// Main Hub
// This component demonstrates Automatic Batching (Q4) and manages the state for the rest of the demo.
import React, { useState, useCallback, useRef, Suspense, lazy } from "react";
import CustomInput from "../common/CustomInput";
import SearchAnalytics from "./SearchAnalytics";
import VirtualizedLogs from "./VirtualizedLogs";
import SearchFilter from "./SearchFilter";
import { DebouncingValue } from "./DebouncingValue";
import { useThrottleValue } from "./useThrottleValue";

// Question 6: Suspense & Lazy Loading
const HeavyStats = lazy(() => import("./HeavyStats"));

export default function TaskDashboard() {
  // 1. The parent holds the actual state array in memory
  const [tasks, setTasks] = useState([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [input, setInput] = useState(" ");
  const debounceInput = DebouncingValue(input, 500);
  const throttledInput = useThrottleValue(input, 5000);
  const inputRef = useRef();

  // useCallback prevents re-creating the function (Question #5)
  const addTask = useCallback((taskName) => {
    setTasks((prev) => [...prev, taskName]);
  }, []);

  //   const addTask = (taskName) => {
  //     setTasks((prev) => [...prev, taskName]);
  //   };

  const handleReset = useCallback(() => {
    // Automatic Batching (Question #4) - Only triggers ONE re-render
    setTasks([]);
    setIsUrgent(false);

    // Question 7: useImperativeHandle
    inputRef.current.clearAndFocus();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Advanced React 2025 Demo</h1>

      <div className="flex gap-2 mb-4">
        <CustomInput ref={inputRef} onAdd={addTask} />
        {/* The parent calls a function inside the child directly! */}
        <button
          onClick={handleReset}
          className="bg-red-500 text-black p-2 rounded"
        >
          Reset Dashboard
        </button>
      </div>

      {/* Question 6: Suspense boundary */}
      <Suspense
        fallback={<div className="animate-pulse">Loading Analytics...</div>}
      >
        <HeavyStats tasks={tasks} onDelete={handleReset} />
      </Suspense>

      {/* Question 3 & 5: useMemo & useDeferredValue inside this component */}
      {/* 2. The parent hands the array down to the child here! */}
      <SearchAnalytics tasks={tasks} />

      <div className="mt-8">
        <h2 className="font-bold">System Logs (Virtualized)</h2>
        <VirtualizedLogs />
      </div>

      <div className="mt-2">
        <h3>Debounced & Throttled </h3>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <p>Immediate:{input}</p>
        <p>Debounced: {debounceInput}</p>
        <p>Throttled:{throttledInput}</p>
      </div>

      <div className="mt-2">
        <h3>Search Filter</h3>
        <SearchFilter />
      </div>
    </div>
  );
}
