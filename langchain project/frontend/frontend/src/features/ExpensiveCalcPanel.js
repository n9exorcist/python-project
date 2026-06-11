/**
 * ExpensiveCalcPanel.js
 * src/features/ExpensiveCalcPanel.js
 *
 * Lazy-loaded panel (Q6) + conditionally mounted (Q11) from TaskDashboard.
 *
 * Directly ports ExpensiveCalculationComponent from 06.reactPerformance.js:
 *  - useMemo for the heavy reduce loop (only re-runs when items or multiplier changes)
 *  - useMemo for the derived filtered list
 *  - All state local — does NOT affect TaskDashboard's render cycle
 */

import React, { memo, useMemo, useState } from "react";

const ExpensiveCalcPanel = memo(() => {
  const [items, setItems] = useState([1, 2, 3, 4, 5]);
  const [multiplier, setMultiplier] = useState(1);
  const [lastCalcMs, setLastCalcMs] = useState(null);

  /**
   * useMemo — the core pattern from ExpensiveCalculationComponent.
   * The inner loop is intentionally heavy to make the memoization visible.
   * Without useMemo this would run on EVERY render of the panel
   * (e.g. re-renders triggered by multiplier label updates).
   * With useMemo it only runs when `items` or `multiplier` actually changes.
   */
  const expensiveResult = useMemo(() => {
    const t0 = performance.now();
    const result = items.reduce((sum, item) => {
      // Simulate CPU-heavy work
      let x = 0;
      for (let i = 0; i < 5_000_000; i++) {
        x += i;
      }
      return sum + item * multiplier;
    }, 0);
    // Store timing as a side-effect inside useMemo — acceptable here
    // because it's purely observational and doesn't affect render output.
    setTimeout(() => setLastCalcMs((performance.now() - t0).toFixed(1)), 0);
    return result;
  }, [items, multiplier]); // ← only recalculates when these change

  /** Another useMemo: cheap derived list, stable reference for any child. */
  const doubledItems = useMemo(() => items.map((n) => n * 2), [items]);

  const addItem = () =>
    setItems((prev) => [...prev, Math.floor(Math.random() * 10) + 1]);
  const removeItem = () => setItems((prev) => prev.slice(0, -1));
  const incMultiplier = () => setMultiplier((m) => m + 1);
  const decMultiplier = () => setMultiplier((m) => Math.max(1, m - 1));

  return (
    <div className="text-sm">
      {/* Result banner */}
      <div className="p-3 bg-gray-800 rounded mb-3 flex items-center gap-4">
        <div>
          <span className="text-gray-400 text-xs">useMemo result</span>
          <p className="text-2xl font-bold text-green-400 font-mono">
            {expensiveResult}
          </p>
        </div>
        {lastCalcMs !== null && (
          <div>
            <span className="text-gray-400 text-xs">Last calc time</span>
            <p className="text-lg font-mono text-yellow-400">{lastCalcMs} ms</p>
          </div>
        )}
      </div>

      {/* Items row */}
      <div className="mb-3">
        <span className="text-xs text-gray-400 mr-2">Items:</span>
        {items.map((n, i) => (
          <span
            key={i}
            className="inline-block bg-gray-700  text-xs rounded px-2 py-0.5 mr-1 font-mono"
          >
            {n}
          </span>
        ))}
      </div>

      <div className="mb-3">
        <span className="text-xs text-gray-400 mr-2">Doubled (useMemo):</span>
        {doubledItems.map((n, i) => (
          <span
            key={i}
            className="inline-block bg-gray-900 text-cyan-400 text-xs rounded px-2 py-0.5 mr-1 font-mono"
          >
            {n}
          </span>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={incMultiplier}
          className="text-xs bg-green-800 text-black hover:bg-green-700  rounded px-3 py-1"
        >
          Multiplier ×{multiplier} ↑
        </button>
        <button
          onClick={decMultiplier}
          className="text-xs bg-gray-700 hover:bg-gray-600  rounded px-3 py-1"
        >
          Multiplier ↓
        </button>
        <button
          onClick={addItem}
          className="text-xs bg-blue-800 hover:bg-blue-700  rounded px-3 py-1"
        >
          + Add item
        </button>
        <button
          onClick={removeItem}
          disabled={items.length <= 1}
          className="text-xs bg-red-900 hover:bg-red-800  rounded px-3 py-1 disabled:opacity-40"
        >
          − Remove item
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-600">
        useMemo only re-runs when items or multiplier changes — not on unrelated
        parent re-renders.
      </p>
    </div>
  );
});

ExpensiveCalcPanel.displayName = "ExpensiveCalcPanel";
export default ExpensiveCalcPanel;
