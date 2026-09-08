"""run_ragas.py — RAGAS metrics over the live graph.

WHY THIS EXISTS ALONGSIDE run_evals.py
--------------------------------------
run_evals.py asks an LLM judge: "is this answer supported by the reference I
wrote?" That measures whether the system got the right answer.

It cannot see the failure that matters most in a RAG system: the model
answering correctly from its own pre-training while retrieval returned nothing
useful. Every metric goes green, the answer is right, and the retrieval is
broken — until the question moves to something the model was never trained on,
and then it is confidently wrong with no warning.

RAGAS asks the other question: "is this answer supported by what was ACTUALLY
RETRIEVED, and did retrieval find the right material at all?"

    faithfulness       claims in the answer that the retrieved contexts support
    response_relevancy does the answer address the question that was asked
    context_precision  of what was retrieved, how much was relevant
    context_recall     of what the reference needs, how much was retrieved

The contexts come from /chat/debug_state, which exposes ToolMessages with the
`name` of the tool that produced them — /chat/history drops both. That endpoint
was built for this and nothing used it until now.

REQUIREMENTS
------------
ragas hard-imports langchain_community.chat_models.vertexai, a path modern
langchain-community no longer has, purely for an isinstance check that
special-cases Vertex. Downgrading langchain-community to restore it would drag
langchain-core below what LangGraph 1.2 needs and break the app. The shim below
supplies a stub class that check can never match, which is harmless and keeps
the production dependency tree untouched. It MUST run before ragas is imported.

    pip install ragas==0.4.3 --no-deps instructor pillow diskcache

RUN
---
    uvicorn main:app --port 8001        # and mcp_server.py on 8000
    venv/Scripts/python.exe evals/run_ragas.py
    venv/Scripts/python.exe evals/run_ragas.py --limit 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import types
import uuid
from datetime import datetime
from pathlib import Path

# --- the shim, before any ragas import -------------------------------------
_vertex = types.ModuleType("langchain_community.chat_models.vertexai")


class ChatVertexAI:  # noqa: D101 - a stub ragas' isinstance check never matches
    pass


_vertex.ChatVertexAI = ChatVertexAI
sys.modules.setdefault("langchain_community.chat_models.vertexai", _vertex)

import httpx
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

from ragas import EvaluationDataset, RunConfig, evaluate
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import (
    Faithfulness,
    LLMContextPrecisionWithReference,
    LLMContextRecall,
    ResponseRelevancy,
)

HERE = Path(__file__).parent
API = os.getenv("EVAL_API_BASE", "http://127.0.0.1:8001")

# Gemini, not Groq. RAGAS issues several judge calls per case per metric, and
# every Groq chat model on this account shares one 8,000 TPM budget — the run
# would spend the whole day's allowance rate-limiting itself. Groq also has no
# embeddings endpoint, and response_relevancy needs one.
JUDGE_MODEL = os.getenv("RAGAS_JUDGE_MODEL", "gemini-3.6-flash")

# text-embedding-004 is retired and answers 404. Verify before changing this --
# the list is per-account and providers drop models without notice:
#   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
# and keep only entries whose supportedGenerationMethods include embedContent.
EMBED_MODEL = os.getenv("RAGAS_EMBED_MODEL", "models/gemini-embedding-001")

# RAGAS defaults to 16 concurrent workers and a 180s timeout. Against Gemini's
# free tier that many parallel judge calls simply queue behind the rate limit
# until they time out -- the first run lost 9 of 12 jobs to TimeoutError while
# the API itself was healthy. Fewer workers with a longer patience finishes
# sooner in wall-clock terms than a wide fan-out that mostly fails.
# SERIAL, deliberately. The 429s name the per-day quota id, but they carry a
# retryDelay of 3-42 SECONDS, not hours -- so the limiter that actually bites is
# short-window, and patience clears it while concurrency cannot. Three workers
# means three simultaneous requests each tripping the throttle and then retrying
# into one another; at one worker the calls are naturally spaced by their own
# ~20s duration and simply queue. A serial run that finishes beats a parallel
# one that loses two thirds of its jobs.
MAX_WORKERS = int(os.getenv("RAGAS_WORKERS", "1"))
JOB_TIMEOUT = int(os.getenv("RAGAS_TIMEOUT", "600"))

# BUDGET -- which decides how you can run this at all.
#
# The 429 names quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier with
# limit 20, which reads like a hard daily ceiling. Observed behaviour says
# otherwise: the same errors carry retryDelay values of 3-42 seconds. Whatever
# the quota is called, it refills on a short window, so the way through it is to
# go slowly rather than to give up for the day -- which is why MAX_WORKERS
# defaults to 1 above.
#
# Budget still governs how much you should attempt in one sitting. RAGAS spends
# roughly one judge call per metric per case:
#
#     4 metrics x 20 cases  = ~80 calls   -- four days of free quota
#     4 metrics x  3 cases  = ~12 calls   -- fits, if nothing else used Gemini
#     2 metrics x  5 cases  = ~10 calls   -- a usable daily slice
#
# The quota is per MODEL, so a different judge (gemini-3.5-flash-lite) carries
# its own 20. Hence --metrics: run the two that carry the most signal when the
# budget is thin, and keep the full set for a paid key.
METRIC_SETS = {
    # Faithfulness catches the answer that is right but ungrounded; context
    # recall catches retrieval that never found the material. Between them they
    # cover both halves of a RAG failure, which the other two refine rather
    # than reveal.
    "core": ("faithfulness", "context_recall"),
    "all": ("faithfulness", "response_relevancy", "context_precision",
            "context_recall"),
}

# Only the retrieval cases. Asking context_recall of a question that was never
# meant to hit the knowledge base measures nothing and scores zero, which would
# drag the aggregate down for a system behaving correctly.
RETRIEVAL_CATEGORIES = {"retrieval", "comparison"}


async def ask(client: httpx.AsyncClient, question: str, thread_id: str) -> str:
    """Run one question through the real graph and collect the streamed answer."""
    answer = ""
    async with client.stream(
        "POST", f"{API}/chat/stream",
        json={"message": question, "thread_id": thread_id},
        timeout=300,
    ) as r:
        async for line in r.aiter_lines():
            if not line.startswith("data: "):
                continue
            body = line[6:]
            if body == "[DONE]":
                break
            try:
                d = json.loads(body)
            except json.JSONDecodeError:
                continue
            if d.get("reset"):
                answer = ""          # the writer replaced its draft
            elif "text" in d:
                answer += d["text"]
    return answer.strip()


async def contexts_for(client: httpx.AsyncClient, thread_id: str) -> list[str]:
    """The chunks retrieval actually returned, from the graph's own state.

    /chat/history deliberately drops ToolMessages — they are working notes, not
    the answer. That makes it useless here: without the retrieved text there is
    nothing to measure faithfulness against.
    """
    r = await client.get(f"{API}/chat/debug_state",
                         params={"thread_id": thread_id}, timeout=60)
    r.raise_for_status()
    out: list[str] = []
    for m in r.json().get("messages", []):
        if m.get("type") != "tool":
            continue
        content = m.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("text"):
                    out.append(block["text"])
        elif isinstance(content, str) and content:
            out.append(content)
    return out


async def collect(cases: list[dict]) -> list[dict]:
    rows = []
    async with httpx.AsyncClient() as client:
        for i, case in enumerate(cases, 1):
            thread = f"ragas_{case['id']}_{uuid.uuid4().hex[:6]}"
            print(f"  [{i}/{len(cases)}] {case['id']}", flush=True)
            try:
                answer = await ask(client, case["question"], thread)
                ctxs = await contexts_for(client, thread)
            except Exception as e:
                # The TYPE matters more than the message here: httpx timeout and
                # connect errors both stringify to "", so printing str(e) alone
                # reported a failure with no cause at all.
                print(f"        FAILED: {type(e).__name__}: {str(e)[:80] or '(no message)'}")
                continue
            if not ctxs:
                # Recorded, not skipped. "Retrieval returned nothing" is a
                # result, and dropping those rows would flatter every average.
                print("        no contexts retrieved")
            rows.append({
                "user_input": case["question"],
                "response": answer or "(empty)",
                "retrieved_contexts": ctxs or ["(nothing retrieved)"],
                "reference": case.get("reference", ""),
                "_id": case["id"],
            })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="first N cases only")
    ap.add_argument("--all-categories", action="store_true",
                    help="include cases that were never meant to retrieve")
    ap.add_argument("--metrics", choices=sorted(METRIC_SETS), default="all",
                    help="'core' halves the judge calls; see BUDGET in this file")
    ap.add_argument("--rescore", metavar="RESULT.json",
                    help="score a previous run's saved answers instead of asking "
                         "the graph again; add --only-missing to fill gaps")
    ap.add_argument("--only-missing", action="store_true",
                    help="with --rescore, skip cases that already have a score")
    args = ap.parse_args()

    key = os.getenv("SWING_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        print("ERROR: no Gemini key; RAGAS needs a judge and an embedding model.")
        return 1

    # Collection and scoring are separable on purpose. Running the graph costs
    # ~90s a case; scoring costs quota. When the judge 429s halfway through,
    # re-running the graph to retry the scoring wastes the half that worked and
    # re-answers questions that were already answered. --rescore reads the saved
    # answers back and only spends judge calls.
    if args.rescore:
        saved = json.loads(Path(args.rescore).read_text(encoding="utf-8"))
        rows = []
        for r in saved:
            scored = r.get("faithfulness") is not None or r.get("context_recall") is not None
            if args.only_missing and scored:
                continue
            rows.append({
                "user_input": r.get("user_input", ""),
                "response": r.get("response", ""),
                "retrieved_contexts": r.get("retrieved_contexts") or ["(nothing retrieved)"],
                "reference": r.get("reference", ""),
                "_id": r.get("case", "?"),
            })
        if not rows:
            print("Nothing to re-score — every case in that file already has a score.")
            return 0
        print(f"Re-scoring {len(rows)} saved cases; the graph is not called.")
        return score(rows, args)

    cases = json.loads((HERE / "dataset.json").read_text(encoding="utf-8"))
    if not args.all_categories:
        cases = [c for c in cases if c.get("category") in RETRIEVAL_CATEGORIES]
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        print("No retrieval cases in the dataset.")
        return 1

    print(f"Running {len(cases)} cases through {API} ...")
    rows = asyncio.run(collect(cases))
    if not rows:
        print(f"Nothing collected — is uvicorn serving {API}?")
        return 1
    return score(rows, args)


def score(rows: list[dict], args) -> int:
    key = os.getenv("SWING_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
    from langchain_google_genai import (ChatGoogleGenerativeAI,
                                        GoogleGenerativeAIEmbeddings)

    judge = LangchainLLMWrapper(ChatGoogleGenerativeAI(
        model=JUDGE_MODEL, temperature=0, google_api_key=key))
    embeddings = LangchainEmbeddingsWrapper(GoogleGenerativeAIEmbeddings(
        model=EMBED_MODEL, google_api_key=key))

    dataset = EvaluationDataset.from_list(
        [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows])

    wanted = METRIC_SETS[args.metrics]
    chosen = [m for name, m in (
        ("faithfulness", Faithfulness(llm=judge)),
        ("response_relevancy", ResponseRelevancy(llm=judge, embeddings=embeddings)),
        ("context_precision", LLMContextPrecisionWithReference(llm=judge)),
        ("context_recall", LLMContextRecall(llm=judge)),
    ) if name in wanted]

    calls = len(rows) * len(chosen)
    print(f"\n{len(rows)} cases x {len(chosen)} metrics = ~{calls} judge calls"
          f" with {JUDGE_MODEL}")
    if calls > 20:
        print("  NOTE: the free tier throttles hard above ~20 calls in a window."
              " Use --metrics core, --limit, or a paid key.")
    if MAX_WORKERS > 1:
        print(f"  NOTE: {MAX_WORKERS} workers. Concurrency is what loses jobs to"
              " 429 here; 1 is the reliable setting.")
    result = evaluate(
        dataset=dataset,
        metrics=chosen,
        llm=judge,
        embeddings=embeddings,
        run_config=RunConfig(timeout=JOB_TIMEOUT, max_workers=MAX_WORKERS,
                             max_retries=3),
    )

    df = result.to_pandas()
    df.insert(0, "case", [r["_id"] for r in rows])

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = HERE / "results" / f"ragas_{stamp}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(df.to_json(orient="records", indent=2), encoding="utf-8")

    metric_cols = [c for c in df.columns
                   if c in ("faithfulness", "answer_relevancy",
                            "llm_context_precision_with_reference",
                            "context_recall", "semantic_similarity")]

    print("\n" + "=" * 78)
    label = {"faithfulness": "Faithfulness",
             "answer_relevancy": "Response relevancy",
             "llm_context_precision_with_reference": "Context precision",
             "context_recall": "Context recall"}
    print(f"{'case':<22}" + "".join(f"{label.get(c, c)[:18]:>19}" for c in metric_cols))
    print("-" * 78)
    for _, row in df.iterrows():
        cells = "".join(
            f"{(f'{row[c]:.2f}' if row[c] == row[c] else '  --'):>19}"
            for c in metric_cols)
        print(f"{str(row['case'])[:22]:<22}{cells}")
    print("-" * 78)
    means = "".join(f"{df[c].mean():>19.2f}" for c in metric_cols)
    print(f"{'MEAN':<22}{means}")
    print("=" * 78)
    print(f"\nSaved {out}")

    # Faithfulness is the one that matters most here: a low score with a high
    # relevancy means the answer was good and the retrieval did not support it,
    # which is exactly the failure run_evals.py cannot see.
    if "faithfulness" in df and df["faithfulness"].mean() < 0.7:
        print("\nWARNING: mean faithfulness under 0.70 — answers are not grounded "
              "in what retrieval returned.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
