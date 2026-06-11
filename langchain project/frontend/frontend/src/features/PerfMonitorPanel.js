/**
 * PerfMonitorPanel.js
 * src/features/PerfMonitorPanel.js
 *
 * Lazy-loaded panel (Q6) that is conditionally mounted (Q11) from TaskDashboard.
 *
 * Patterns from 06.reactPerformance.js:
 *  - PerformanceMonitoring  → useRef to track render timing without extra state
 *  - RefOptimizationExample → useRef for renderCount + previousValue without re-renders
 */

import React, { memo, useRef, useState, useEffect } from "react";

const PerfMonitorPanel = memo(({ tasks }) => {
  // ── useRef — none of these trigger re-renders when mutated ──────────────────
  const renderCount     = useRef(0);
  const mountTime       = useRef(Date.now());
  const renderStartTime = useRef(Date.now());
  const previousCount   = useRef(tasks.length);

  renderCount.current++;
  renderStartTime.current = Date.now();

  const taskDelta = tasks.length - previousCount.current;
  previousCount.current = tasks.length;

  const [renderLog, setRenderLog] = useState([]);

  // Record each render into the visible log (max 8 entries)
  useEffect(() => {
    const entry = {
      n:     renderCount.current,
      tasks: tasks.length,
      delta: taskDelta,
      time:  new Date().toLocaleTimeString("en-IN", { hour12: false }),
      ms:    Date.now() - mountTime.current,
    };
    setRenderLog((prev) => [entry, ...prev].slice(0, 8));
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-xs font-mono">
      {/* Summary row */}
      <div className="flex gap-4 flex-wrap mb-3 p-2 bg-gray-800 rounded">
        <span>Panel renders: <strong className="text-yellow-400">{renderCount.current}</strong></span>
        <span>Mount age: <strong className="text-cyan-400">{((Date.now() - mountTime.current) / 1000).toFixed(1)}s</strong></span>
        <span>Task count: <strong className="text-green-400">{tasks.length}</strong></span>
        <span>Last Δ: <strong className={taskDelta >= 0 ? "text-green-400" : "text-red-400"}>{taskDelta >= 0 ? `+${taskDelta}` : taskDelta}</strong></span>
      </div>

      {/* Render log table */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-gray-500 text-left border-b border-gray-700">
            <th className="pb-1 pr-4">#</th>
            <th className="pb-1 pr-4">Time</th>
            <th className="pb-1 pr-4">Tasks</th>
            <th className="pb-1 pr-4">Δ</th>
            <th className="pb-1">Age (ms)</th>
          </tr>
        </thead>
        <tbody>
          {renderLog.map((row, i) => (
            <tr key={i} className={`border-b border-gray-800 ${i === 0 ? "text-white" : "text-gray-400"}`}>
              <td className="py-0.5 pr-4">{row.n}</td>
              <td className="py-0.5 pr-4">{row.time}</td>
              <td className="py-0.5 pr-4">{row.tasks}</td>
              <td className={`py-0.5 pr-4 ${row.delta > 0 ? "text-green-400" : row.delta < 0 ? "text-red-400" : "text-gray-500"}`}>
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </td>
              <td className="py-0.5">{row.ms}</td>
            </tr>
          ))}
          {renderLog.length === 0 && (
            <tr><td colSpan={5} className="text-gray-600 py-2">No renders recorded yet — add or remove a task.</td></tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-gray-600">
        * renderCount uses useRef — incrementing it never triggers a re-render.
      </p>
    </div>
  );
});

PerfMonitorPanel.displayName = "PerfMonitorPanel";
export default PerfMonitorPanel;
