// ==========================================
// FILE: src/features/HeavyStats.js
// ==========================================
import React, { useMemo } from "react";

// 1. Destructure 'tasks' and 'onDelete' to perfectly match the parent component's props
const HeavyStats = React.memo(({ tasks = [], onDelete }) => {
  // 2. Add a console.log here so you can trace exactly what data arrives in your console
  console.log("📥 HeavyStats received tasks:", tasks);

  // 3. Run the computation loop safely using the verified 'tasks' prop
  const computedStats = useMemo(() => {
    return tasks.map((item) => {
      // If task is a string name (like "Deploy App"), we can't multiply it by 2.
      // We fall back to multiplying its string length, or returning the item itself.
      return typeof item === "number" ? item * 2 : item.length * 2;
    });
  }, [tasks]);

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 my-4 shadow-sm">
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        📊 Heavy Analytics Core Chunk
      </h3>

      <div className="text-xs font-mono bg-white p-2 border rounded overflow-x-auto min-h-[40px] text-gray-600">
        {computedStats.length > 0
          ? `Computed Metrics: ${computedStats.join(", ")}`
          : "No task items compiled yet. Add a task above!"}
      </div>

      <button
        onClick={onDelete}
        className="mt-3 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 rounded transition-colors"
      >
        Clear Stats Array
      </button>
    </div>
  );
});

// Give the component an explicit display name for easier debugging in React DevTools
HeavyStats.displayName = "HeavyStats";

export default HeavyStats;
