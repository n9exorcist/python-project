"""
inference_scaling.py — the in-process half of "AI traffic grew 100x, scale
inference": the three levers that aren't someone else's infrastructure.

Caching already lives in llm_gateway. The other three from the answer:

  MicroBatcher   Requests that arrive within a few milliseconds of each other
                 are collected into ONE call to the model instead of one call
                 each. This is how a GPU stays busy — the single biggest
                 throughput win, and the classic dynamic-batching trick every
                 inference server uses.
  ReplicaPool    N workers serve requests concurrently (the in-process stand-in
                 for N model replicas behind a load balancer), with a BOUNDED
                 admission queue in front.
  backpressure   When the queue is full the pool SHEDS load (raises Overloaded)
                 instead of accepting work it can't reach — a fast, honest
                 rejection beats an unbounded queue that melts under the spike.

The trade-off the interview wants named, made measurable here via Metrics:
larger batches raise throughput but add latency (every request waits for the
window); more replicas raise capacity but cost more; the queue protects the
system but makes a shed request wait or fail. None of these is free, and they
interact — this module lets you watch them do it.

Pure threading + stdlib, no GPU and no provider needed, so the batching,
concurrency and shedding behaviour is fully testable offline.

    python inference_scaling.py     # self-test
"""

from __future__ import annotations

import queue
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable


class Overloaded(RuntimeError):
    """Admission control rejected the request: the system is at capacity."""


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
@dataclass
class Metrics:
    accepted: int = 0
    rejected: int = 0
    batches: int = 0
    batched_items: int = 0
    _latencies_ms: list = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def _record_latency(self, ms: float):
        with self._lock:
            self._latencies_ms.append(ms)

    @property
    def avg_batch_size(self) -> float:
        return round(self.batched_items / self.batches, 2) if self.batches else 0.0

    @property
    def avg_latency_ms(self) -> float:
        lat = self._latencies_ms
        return round(sum(lat) / len(lat), 1) if lat else 0.0

    @property
    def p95_latency_ms(self) -> float:
        lat = sorted(self._latencies_ms)
        return round(lat[int(len(lat) * 0.95)], 1) if lat else 0.0

    def summary(self) -> str:
        return (f"accepted={self.accepted} rejected={self.rejected} "
                f"batches={self.batches} avg_batch={self.avg_batch_size} "
                f"avg_latency={self.avg_latency_ms}ms p95={self.p95_latency_ms}ms")


# ---------------------------------------------------------------------------
# Dynamic micro-batching
# ---------------------------------------------------------------------------
@dataclass
class _Pending:
    item: Any
    future: Future
    submitted: float


class MicroBatcher:
    """Collect submitted items into batches, flushing when the batch fills OR
    the wait window elapses — whichever comes first.

    `handler(list_of_items) -> list_of_results` is your real batched inference
    call (one embedding/completion request carrying every item). submit() hands
    back a Future that resolves to that item's own result.
    """

    def __init__(self, handler: Callable[[list], list], *,
                 max_batch: int = 16, max_wait_ms: float = 10.0,
                 metrics: Metrics | None = None):
        self.handler = handler
        self.max_batch = max_batch
        self.max_wait = max_wait_ms / 1000.0
        self.metrics = metrics or Metrics()
        self._q: "queue.Queue[_Pending]" = queue.Queue()
        self._running = True
        self._worker = threading.Thread(target=self._loop, daemon=True)
        self._worker.start()

    def submit(self, item: Any) -> Future:
        fut: Future = Future()
        self._q.put(_Pending(item, fut, time.perf_counter()))
        return fut

    def submit_and_wait(self, item: Any, timeout: float | None = None) -> Any:
        return self.submit(item).result(timeout=timeout)

    def _collect(self) -> list[_Pending]:
        """Block for the first item, then gather more until full or window ends."""
        first = self._q.get()
        batch = [first]
        deadline = time.perf_counter() + self.max_wait
        while len(batch) < self.max_batch:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            try:
                batch.append(self._q.get(timeout=remaining))
            except queue.Empty:
                break
        return batch

    def _loop(self) -> None:
        while self._running:
            try:
                batch = self._collect()
            except Exception:
                continue
            if not batch:
                continue
            items = [p.item for p in batch]
            try:
                results = self.handler(items)
                if len(results) != len(items):
                    raise RuntimeError(
                        f"handler returned {len(results)} results for {len(items)} items")
            except Exception as exc:  # whole batch fails together
                for p in batch:
                    if not p.future.done():
                        p.future.set_exception(exc)
                continue
            now = time.perf_counter()
            for p, r in zip(batch, results):
                if not p.future.done():
                    p.future.set_result(r)
                self.metrics._record_latency((now - p.submitted) * 1000)
            self.metrics.batches += 1
            self.metrics.batched_items += len(batch)
            self.metrics.accepted += len(batch)

    def shutdown(self, drain: bool = True) -> None:
        if drain:
            while not self._q.empty():
                time.sleep(0.001)
        self._running = False


# ---------------------------------------------------------------------------
# Replica pool with bounded admission queue + backpressure
# ---------------------------------------------------------------------------
class ReplicaPool:
    """`replicas` workers run concurrently; up to `queue_size` more may wait.
    Past that, submit() raises Overloaded rather than queue without limit.

    The admission counter (not the thread pool's own queue) is what enforces the
    bound: a ThreadPoolExecutor queues without limit on its own, which is the
    failure mode this exists to prevent.
    """

    def __init__(self, replicas: int = 4, queue_size: int = 32,
                 metrics: Metrics | None = None):
        self.replicas = replicas
        self.capacity = replicas + queue_size
        self.metrics = metrics or Metrics()
        self._exec = ThreadPoolExecutor(max_workers=replicas)
        self._admitted = 0
        self._lock = threading.Lock()

    def submit(self, fn: Callable[..., Any], *args, **kwargs) -> Future:
        with self._lock:
            if self._admitted >= self.capacity:
                self.metrics.rejected += 1
                raise Overloaded(
                    f"at capacity ({self._admitted}/{self.capacity}) — shedding load")
            self._admitted += 1
            self.metrics.accepted += 1
        start = time.perf_counter()

        def _wrapped():
            try:
                return fn(*args, **kwargs)
            finally:
                self.metrics._record_latency((time.perf_counter() - start) * 1000)
                with self._lock:
                    self._admitted -= 1

        return self._exec.submit(_wrapped)

    @property
    def in_flight(self) -> int:
        with self._lock:
            return self._admitted

    def shutdown(self, wait: bool = True) -> None:
        self._exec.shutdown(wait=wait)


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("== micro-batching: many submits coalesce into few calls ==")
    seen_batches: list[int] = []

    def embed_batch(items: list) -> list:
        seen_batches.append(len(items))      # record how big each real call was
        time.sleep(0.005)                    # pretend this is one GPU pass
        return [x * 10 for x in items]

    m = Metrics()
    b = MicroBatcher(embed_batch, max_batch=8, max_wait_ms=15, metrics=m)
    futs = [b.submit(i) for i in range(20)]  # fire 20 near-simultaneously
    results = [f.result(timeout=2) for f in futs]
    b.shutdown()
    print(f"  20 requests -> {len(seen_batches)} batched calls, sizes {seen_batches}")
    print(f"  results correct: {results == [i * 10 for i in range(20)]}")
    print(f"  {m.summary()}")
    assert results == [i * 10 for i in range(20)]
    assert len(seen_batches) < 20, "no batching happened"
    assert max(seen_batches) <= 8, "batch exceeded max_batch"

    print("\n== batch error fails that batch, not the process ==")
    def bad_batch(items): raise RuntimeError("model OOM")
    b2 = MicroBatcher(bad_batch, max_batch=4, max_wait_ms=5)
    f = b2.submit("x")
    try:
        f.result(timeout=1)
        print("  XX expected failure")
    except RuntimeError as e:
        print(f"  OK batch failure surfaced to caller: {e}")
    b2.shutdown()

    print("\n== replica pool: concurrency capped, overflow shed ==")
    m2 = Metrics()
    pool = ReplicaPool(replicas=2, queue_size=2, metrics=m2)
    peak = {"v": 0}
    live = {"v": 0}
    lk = threading.Lock()

    def work(_):
        with lk:
            live["v"] += 1
            peak["v"] = max(peak["v"], live["v"])
        time.sleep(0.05)
        with lk:
            live["v"] -= 1
        return "done"

    accepted, shed = [], 0
    for i in range(10):                      # 10 at once, capacity is 2+2=4
        try:
            accepted.append(pool.submit(work, i))
        except Overloaded:
            shed += 1
    for f in accepted:
        f.result(timeout=2)
    pool.shutdown()
    print(f"  submitted 10, accepted {len(accepted)}, shed {shed}, peak concurrency {peak['v']}")
    print(f"  {m2.summary()}")
    assert peak["v"] <= 2, "replica cap breached"
    assert shed >= 1, "backpressure never triggered"

    print("\nAll inference_scaling self-tests passed.")
