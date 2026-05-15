// Main Hub
// This component demonstrates Automatic Batching (Q4) and manages the state for the rest of the demo.
import React, { useState, useCallback, useRef, Suspense, lazy } from "react";
import CustomInput from "../common/CustomInput";
import SearchAnalytics from "./SearchAnalytics";

const HeavyStats = lazy(() => import("./HeavyStats"));

export default function TaskDashboard() {
  const [tasks, setTasks] = useState([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const inputRef = useRef();

  const addTask = useCallback((taskName) => {
    setTasks((prev) => [...prev, taskName]);
  }, []);

  //   const addTask = (taskName) => {
  //     setTasks((prev) => [...prev, taskName]);
  //   };

  const handleReset = () => {
    setTasks([]);
    setIsUrgent(false);

    inputRef.current.clearAndFocus();
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Advanced React 2025 Demo</h1>

      <div className="flex gap-2 mb-4">
        <CustomInput ref={inputRef} onAdd={addTask} />
        {/* The parent calls a function inside the child directly! */}
        <button
          onClick={handleReset}
          className="bg-red-500 text-white p-2 rounded"
        >
          Reset Dashboard
        </button>
      </div>

      {/* Question 3 & 5: useMemo & useDeferredValue inside this component */}
      <SearchAnalytics tasks={tasks} />

      {/* Question 6: Suspense boundary */}
      <Suspense
        fallback={<div className="animate-pulse">Loading Analytics...</div>}
      >
        {/* <HeavyStats tasks={tasks} /> */}
      </Suspense>
    </div>
  );
}
