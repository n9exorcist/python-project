import React, { useState, useDeferredValue, useMemo } from "react";

const SearchAnalytics = ({ tasks }) => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

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

export default React.memo(SearchAnalytics);
