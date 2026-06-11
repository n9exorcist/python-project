/**
 * MemoizedObjectPanel.js
 * src/features/MemoizedObjectPanel.js
 *
 * Lazy-loaded (Q6) + conditionally mounted (Q11) from TaskDashboard.
 *
 * Directly ports MemoizedObjectComponent + MemoizedChild from 06.reactPerformance.js:
 *  - Receives `config` and `items` as props
 *  - Both are memoized in TaskDashboard via useMemo → stable references
 *  - This component itself is wrapped in React.memo → only re-renders
 *    when config or items reference actually changes (i.e. when `filter` changes)
 *
 * To prove it works: the render counter below only increments when the
 * parent changes `filter` — not on every TaskDashboard keystroke.
 */

import React, { memo, useRef } from "react";

const MemoizedObjectPanel = memo(({ config, items }) => {
  // useRef render counter — proves memo is working
  const renderCount = useRef(0);
  renderCount.current++;

  return (
    <div className="text-sm">
      {/* Render proof */}
      <div className="mb-3 p-2 bg-gray-800 rounded flex gap-4  text-black">
        <span>
          Panel renders:{" "}
          <strong className="text-yellow-400">{renderCount.current}</strong>
        </span>
        <span className="text-gray-500">
          (should only increment when you change the Filter dropdown above)
        </span>
      </div>

      {/* Config object — received as a stable memoized ref from parent */}
      <div className="mb-3 border border-gray-700 rounded p-3">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          config prop (useMemo in parent)
        </p>
        <div className="flex gap-4 flex-wrap font-mono text-xs">
          <span>
            theme: <strong className="text-purple-400">{config.theme}</strong>
          </span>
          <span>
            language:{" "}
            <strong className="text-cyan-400">{config.language}</strong>
          </span>
          <span>
            filter: <strong className="text-amber-400">{config.filter}</strong>
          </span>
        </div>
      </div>

      {/* Items array — also a stable memoized ref */}
      <div className="border border-gray-700 rounded p-3">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          items prop (useMemo [] in parent)
        </p>
        <div className="flex gap-2">
          {items.map((n, i) => (
            <span
              key={i}
              className="bg-gray-700 text-white font-mono text-xs rounded px-2 py-1"
            >
              {n}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-600">
        Both props are stable object/array references created with useMemo in
        TaskDashboard. React.memo's shallow-equal sees the same reference →
        skips re-render on unrelated state changes.
      </p>
    </div>
  );
});

MemoizedObjectPanel.displayName = "MemoizedObjectPanel";
export default MemoizedObjectPanel;
