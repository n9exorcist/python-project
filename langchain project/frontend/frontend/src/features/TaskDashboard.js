/**
 * TaskDashboard.js
 *
 * Integrated with 06.reactPerformance.js patterns:
 *
 *  Q1  React.memo            — MemoizedTaskItem, MemoizedStatsBar, MemoizedResetButton
 *  Q2  useCallback           — addTask, handleReset, handleDelete (stable refs for memoized children)
 *  Q3  useMemo               — filteredTasks (derived list), stats (aggregate object), config (stable object ref)
 *  Q4  Automatic Batching    — handleReset batches 3 state updates → ONE re-render
 *  Q5  useDeferredValue      — inside SearchAnalytics (already present, now explicit)
 *  Q6  React.lazy + Suspense — HeavyStats (already), + new PerfMonitorPanel (lazy)
 *  Q7  useImperativeHandle   — inputRef.current.clearAndFocus() via CustomInput/forwardRef
 *  Q8  useRef (non-render)   — renderCount, lastRenderTime, previousTaskCount
 *  Q9  Virtual scrolling     — VirtualizedLogs (already present)
 *  Q10 Debounce + Throttle   — DebouncingValue, useThrottleValue (already present)
 *  Q11 Conditional rendering — PerfMonitorPanel only mounts when showPerfMonitor is true
 *  Q12 Code splitting        — MemoizedObjectComponent, ExpensiveCalculationComponent via lazy
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
  Suspense,
  lazy,
} from "react";

import CustomInput from "../common/CustomInput";
import SearchAnalytics from "./SearchAnalytics";
import VirtualizedLogs from "./VirtualizedLogs";
import SearchFilter from "./SearchFilter";
import { DebouncingValue } from "./DebouncingValue";
import { useThrottleValue } from "./useThrottleValue";

// ─── Q6 · Code Splitting with React.lazy ─────────────────────────────────────
// Each lazy() call creates a separate bundle chunk that is only downloaded
// when the component is first rendered.  Mirrors CodeSplittingExample in
// 06.reactPerformance.js — but applied to the real dashboard views.

const HeavyStats = lazy(() => import("./HeavyStats"));
const PerfMonitorPanel = lazy(() => import("./PerfMonitorPanel")); // new — Q11 conditional + Q6 lazy
const ExpensiveCalcPanel = lazy(() => import("./ExpensiveCalcPanel")); // wraps ExpensiveCalculationComponent
const MemoizedObjectPanel = lazy(() => import("./MemoizedObjectPanel")); // wraps MemoizedObjectComponent

// ─── Q1 · React.memo — presentational leaf components ────────────────────────
// Memoized children only re-render when their own props change.
// The parent (TaskDashboard) re-renders often (every keystroke in the input);
// these children must NOT follow unless their data actually changed.

/**
 * Single task row.
 * Props: task (string), index (number), onDelete (stable function ref).
 * Because onDelete is wrapped in useCallback below, memo's shallow-equal
 * check will pass on every parent re-render → no unnecessary work.
 */
const MemoizedTaskItem = memo(({ task, index, onDelete }) => {
  return (
    <li className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-800">
      <span className="text-sm text-black  text-black">
        {index + 1}. {task}
      </span>
      <button
        onClick={() => onDelete(index)}
        className="text-red-400 text-xs text-black ml-2 hover:text-red-300"
      >
        ✕
      </button>
    </li>
  );
});
MemoizedTaskItem.displayName = "MemoizedTaskItem";

/**
 * Stats bar at the top.
 * Receives the memoized `stats` object (see useMemo below) so that
 * this component only re-renders when the aggregate numbers actually change.
 */
const MemoizedStatsBar = memo(({ stats }) => {
  return (
    <div className="flex gap-4 text-xs text-black text-gray-400 mb-3 border border-gray-700 rounded p-2">
      <span>
        Total: <strong className="text-black">{stats.total}</strong>
      </span>
      <span>
        Urgent: <strong className="text-red-400">{stats.urgent}</strong>
      </span>
      <span>
        Normal: <strong className="text-green-400">{stats.normal}</strong>
      </span>
      <span>
        Renders:{" "}
        <strong className="text-yellow-400">{stats.renderCount}</strong>
      </span>
    </div>
  );
});
MemoizedStatsBar.displayName = "MemoizedStatsBar";

/**
 * Reset button extracted into its own memoized component.
 * onClick is a stable useCallback ref → memo prevents all re-renders
 * caused by unrelated state changes in the parent.
 */
const MemoizedResetButton = memo(({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="bg-red-500 text-black p-2 rounded text-sm text-black  text-black font-bold text-black"
    >
      Reset Dashboard
    </button>
  );
});
MemoizedResetButton.displayName = "MemoizedResetButton";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TaskDashboard() {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [input, setInput] = useState("");
  const [showPerfMonitor, setShowPerfMonitor] = useState(false); // Q11 conditional rendering
  const [showExpCalc, setShowExpCalc] = useState(false); // Q11
  const [showMemoObj, setShowMemoObj] = useState(false); // Q11
  const [filter, setFilter] = useState("all"); // for MemoizedObjectPanel config

  // ── Q8 · useRef — values that must NOT trigger re-renders ───────────────────
  // renderCount tracks how many times TaskDashboard itself has re-rendered.
  // Incrementing a ref is invisible to React — no extra render is queued.
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());
  const previousTaskCount = useRef(0);

  renderCount.current++;
  lastRenderTime.current = Date.now();
  // Track previous task count for delta display (without a separate useEffect)
  const taskDelta = tasks.length - previousTaskCount.current;
  previousTaskCount.current = tasks.length;

  // ── Q7 · useImperativeHandle ref ────────────────────────────────────────────
  // CustomInput exposes { clearAndFocus() } via forwardRef + useImperativeHandle.
  const inputRef = useRef();

  // ── Debounce + Throttle (Q10) ────────────────────────────────────────────────
  const debounceInput = DebouncingValue(input, 500);
  const throttledInput = useThrottleValue(input, 5000);

  // ── Q2 · useCallback — stable function references ───────────────────────────
  // Rule: every function that is passed as a prop to a memoized child MUST be
  // wrapped in useCallback, otherwise memo's shallow-equal check fails and the
  // child re-renders on every parent render anyway.

  /** Add a new task to the list. */
  const addTask = useCallback((taskName) => {
    if (!taskName.trim()) return;
    setTasks((prev) => [...prev, taskName.trim()]);
  }, []); // no external deps → created once

  /** Delete a single task by index. */
  const handleDelete = useCallback((index) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }, []); // no external deps

  /**
   * Q4 · Automatic Batching
   * React 18 batches ALL state updates in the same synchronous callback
   * into a single re-render — even across multiple setState calls.
   * Before React 18 this only worked inside React synthetic event handlers;
   * now it works everywhere (setTimeout, Promise, native events, etc.).
   *
   * Here: setTasks + setIsUrgent → ONE re-render, not two.
   */
  const handleReset = useCallback(() => {
    setTasks([]); // ─┐
    setIsUrgent(false); // ─┘ batched → single re-render (Q4)

    // Q7 · useImperativeHandle — call a method INSIDE the child component
    // from the parent, without lifting state or passing extra props.
    inputRef.current?.clearAndFocus();
  }, []);

  const toggleUrgent = useCallback(() => {
    setIsUrgent((prev) => !prev);
  }, []);

  const togglePerfMonitor = useCallback(() => {
    setShowPerfMonitor((prev) => !prev);
  }, []);

  const toggleExpCalc = useCallback(() => {
    setShowExpCalc((prev) => !prev);
  }, []);

  const toggleMemoObj = useCallback(() => {
    setShowMemoObj((prev) => !prev);
  }, []);

  const handleFilterChange = useCallback((e) => {
    setFilter(e.target.value);
  }, []);

  // ── Q3 · useMemo — derived data and stable object references ────────────────
  //
  // Rule 1 — expensive derived data:
  //   filteredTasks recalculates only when `tasks` or `isUrgent` changes,
  //   not on every parent re-render (e.g. input keystrokes).
  //
  // Rule 2 — stable object references:
  //   `stats` and `config` are plain objects. Without useMemo they would be
  //   recreated on every render, making memo's shallow-equal fail for any
  //   child that receives them — defeating the purpose of React.memo.

  /** Derived task list — filtered by urgency flag. */
  const filteredTasks = useMemo(() => {
    if (!isUrgent) return tasks;
    // Treat tasks starting with "!" as urgent
    return tasks.filter((t) => t.startsWith("!"));
  }, [tasks, isUrgent]);

  /**
   * Aggregate stats object passed to MemoizedStatsBar.
   * Stable reference: only a new object when tasks or renderCount changes.
   * (renderCount.current is read here; because it's a ref it doesn't cause
   *  extra renders, but it IS up-to-date at computation time.)
   */
  const stats = useMemo(
    () => ({
      total: tasks.length,
      urgent: tasks.filter((t) => t.startsWith("!")).length,
      normal: tasks.filter((t) => !t.startsWith("!")).length,
      renderCount: renderCount.current,
    }),
    [tasks],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ renderCount.current intentionally omitted from deps — it's a ref,
  //   not state, so it never triggers recalculation on its own.

  /**
   * Config object for MemoizedObjectPanel (mirrors MemoizedObjectComponent
   * from 06.reactPerformance.js).  Stable reference — only recreated when
   * `filter` state changes.
   */
  const panelConfig = useMemo(
    () => ({
      theme: "dark",
      language: "en",
      filter,
    }),
    [filter],
  );

  /** Static array memoized with empty deps → created once, never recreated. */
  const staticItems = useMemo(() => [1, 2, 3, 4, 5], []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 min-h-screen bg-gray-950 text-black">
      <h1 className="text-xl font-bold text-black mb-1">
        Advanced React 2025 Demo
      </h1>

      {/* Q8 · useRef — perf info without extra state / re-renders */}
      <p className="text-xs text-black text-gray-500 mb-4">
        Dashboard renders: {renderCount.current} · Tasks Δ this render:{" "}
        {taskDelta >= 0 ? `+${taskDelta}` : taskDelta} · Last render:{" "}
        {new Date(lastRenderTime.current).toLocaleTimeString()}
      </p>

      {/* ── Input row ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        {/*
          Q7 · useImperativeHandle
          CustomInput must be implemented with forwardRef and expose:
            useImperativeHandle(ref, () => ({ clearAndFocus() { ... } }))
          That lets handleReset call inputRef.current.clearAndFocus() above.
        */}
        <CustomInput ref={inputRef} onAdd={addTask} />

        {/* Q1 · MemoizedResetButton — won't re-render unless handleReset changes */}
        <MemoizedResetButton onClick={handleReset} />

        <button
          onClick={toggleUrgent}
          className={`p-2 rounded text-sm text-black  text-black border ${
            isUrgent
              ? "bg-red-900 border-red-500 text-red-300"
              : "border-gray-600 text-gray-400"
          }`}
        >
          {isUrgent ? "Urgent Only" : "Show All"}
        </button>
      </div>

      {/* ── Q1 · MemoizedStatsBar — receives memoized stats object (Q3) ──── */}
      <MemoizedStatsBar stats={stats} />

      {/* ── Filtered task list — Q1 memo item + Q3 derived list ─────────── */}
      {filteredTasks.length > 0 && (
        <ul className="mb-6 border border-gray-700 rounded p-2">
          {filteredTasks.map((task, i) => (
            /*
              Q1 · MemoizedTaskItem
              key=task is intentional here: if the string content is the same,
              the component is the same — no remount on re-order.
              onDelete is a stable useCallback ref → memo works correctly.
            */
            <MemoizedTaskItem
              key={`${task}-${i}`}
              task={task}
              index={i}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {/* ── Q6 · Suspense boundary for HeavyStats ────────────────────────── */}
      {/*
        React.lazy splits HeavyStats into its own JS chunk.
        Suspense shows the fallback while that chunk is downloading.
        Once loaded, React caches it — subsequent mounts are instant.
      */}
      <Suspense
        fallback={
          <div className="animate-pulse text-sm text-black  text-black text-gray-500">
            Loading Analytics…
          </div>
        }
      >
        <HeavyStats tasks={tasks} onDelete={handleReset} />
      </Suspense>

      {/* ── Q3 & useDeferredValue — SearchAnalytics ──────────────────────── */}
      {/*
        SearchAnalytics should internally use:
          const deferredTasks = useDeferredValue(tasks);
          const filtered = useMemo(() => ..., [deferredTasks, query]);
        This keeps the input responsive even when `tasks` is large.
      */}
      <SearchAnalytics tasks={tasks} />

      {/* ── Q9 · Virtual Scrolling — VirtualizedLogs ─────────────────────── */}
      <div className="mt-8">
        <h2 className="font-bold text-black mb-2">
          System Logs (Virtualized — Q9)
        </h2>
        {/*
          VirtualizedLogs should use react-window's FixedSizeList.
          Only the visible rows are in the DOM → constant render cost
          regardless of how many log entries exist (10,000+).
        */}
        <VirtualizedLogs />
      </div>

      {/* ── Q10 · Debounce + Throttle ────────────────────────────────────── */}
      <div className="mt-6 border border-gray-700 rounded p-4">
        <h3 className="font-bold text-black text-sm text-black  text-black mb-2">
          Debounce & Throttle
        </h3>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type here…"
          className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-black  text-black w-full mb-2"
        />
        <p className="text-xs text-black text-gray-400">
          Immediate: <span className="text-black">{input}</span>
        </p>
        <p className="text-xs text-black text-amber-400">
          Debounced (500ms): <span className="text-black">{debounceInput}</span>
        </p>
        <p className="text-xs text-black text-purple-400">
          Throttled (5s): <span className="text-black">{throttledInput}</span>
        </p>
      </div>

      {/* ── SearchFilter ─────────────────────────────────────────────────── */}
      <div className="mt-4">
        <h3 className="font-bold text-black text-sm text-black  text-black mb-2">
          Search Filter
        </h3>
        <SearchFilter />
      </div>

      {/* ── Q11 · Conditional Rendering + Q6 lazy ────────────────────────── */}
      {/*
        PerfMonitorPanel is:
          (a) lazy-loaded  — not in the initial bundle (Q6)
          (b) conditionally mounted — not rendered at all until toggled (Q11)
        Combining both means: zero download cost + zero render cost until needed.
      */}
      <div className="mt-6 border border-gray-700 rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-black text-sm text-black  text-black">
            Performance Monitor
          </h3>
          <button
            onClick={togglePerfMonitor}
            className="text-xs text-black border border-gray-600 rounded px-3 py-1 text-gray-300 hover:border-cyan-500 hover:text-cyan-400"
          >
            {showPerfMonitor ? "Hide" : "Show"}
          </button>
        </div>
        {/*
          Q11 — only mounts (and triggers the lazy chunk download) when true.
          If the user never opens this panel, zero JS is downloaded for it.
        */}
        {showPerfMonitor && (
          <Suspense
            fallback={
              <div className="animate-pulse text-xs text-black text-gray-500">
                Loading monitor…
              </div>
            }
          >
            {/*
              PerfMonitorPanel should internally use:
                const renderStartTime = useRef(Date.now());
              to track its own render timing — pattern from
              PerformanceMonitoring + RefOptimizationExample in 06.reactPerformance.js
            */}
            <PerfMonitorPanel tasks={tasks} />
          </Suspense>
        )}
      </div>

      {/* ── Q3 · MemoizedObjectPanel — stable config object ref ──────────── */}
      <div className="mt-4 border border-gray-700 rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-black text-sm text-black  text-black">
            Memoized Object / Array Props
          </h3>
          <button
            onClick={toggleMemoObj}
            className="text-xs text-black border border-gray-600 rounded px-3 py-1 text-gray-300 hover:border-purple-500 hover:text-purple-400"
          >
            {showMemoObj ? "Hide" : "Show"}
          </button>
        </div>
        {showMemoObj && (
          <Suspense
            fallback={
              <div className="animate-pulse text-xs text-black text-gray-500">
                Loading…
              </div>
            }
          >
            {/*
              panelConfig and staticItems are both memoized above (Q3).
              MemoizedObjectPanel should be wrapped in React.memo so that
              it only re-renders when config or items reference changes —
              which only happens when `filter` state changes.
            */}
            <MemoizedObjectPanel config={panelConfig} items={staticItems} />
            <div className="mt-2">
              <label className="text-xs text-black text-gray-400 mr-2">
                Filter:
              </label>
              <select
                value={filter}
                onChange={handleFilterChange}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-black"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="done">Done</option>
              </select>
            </div>
          </Suspense>
        )}
      </div>

      {/* ── ExpensiveCalculationPanel — useMemo heavy compute ────────────── */}
      <div className="mt-4 border border-gray-700 rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-black text-sm text-black  text-black">
            Expensive Calculation
          </h3>
          <button
            onClick={toggleExpCalc}
            className="text-xs text-black border border-gray-600 rounded px-3 py-1 text-gray-300 hover:border-green-500 hover:text-green-400"
          >
            {showExpCalc ? "Hide" : "Show"}
          </button>
        </div>
        {showExpCalc && (
          <Suspense
            fallback={
              <div className="animate-pulse text-xs text-black text-gray-500">
                Loading…
              </div>
            }
          >
            {/*
              ExpensiveCalcPanel wraps ExpensiveCalculationComponent from
              06.reactPerformance.js.  The useMemo inside it ensures the
              heavy loop only runs when `items` or `multiplier` change —
              never on unrelated parent re-renders.
            */}
            <ExpensiveCalcPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
