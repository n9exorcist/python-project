import React, { useState, useDeferredValue, useMemo } from "react";

const SearchAnalytics = ({ tasks }) => {
  const [query, setQuery] = useState("");

  // Question 3: Concurrent Features
  // deferredQuery lets React prioritize the "typing" over the "filtering"
  // while the heavy filtering happens at a lower priority.
  const deferredQuery = useDeferredValue(query);

  // Question 5: useMemo for heavy calculations
  // Only recalculates the count when the 'tasks' or 'deferredQuery' actually change
  const filteredCount = useMemo(() => {
    console.log("🏃‍♂️ useMemo is calculating the filter...");

    // ARTIFICIAL SLOWDOWN: Simulating 50,000 tasks being filtered
    let i = 0;
    while (i < 50000000) i++;

    return tasks.filter((t) => t.includes(deferredQuery)).length;
  }, [tasks, deferredQuery]);

  return (
    <div className="p-4 border mt-4">
      <input
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
        className="border p-2"
      />
      <p>Actual Query (Fast): {query}</p>
      <p>Deferred Query (Slow): {deferredQuery}</p>
      <p>Matches: {filteredCount}</p>
    </div>
  );
};

// Question 2: Shallow Comparison
// React.memo prevents this entire component from re-rendering
// unless the 'tasks' array reference actually changes

export default React.memo(SearchAnalytics);
