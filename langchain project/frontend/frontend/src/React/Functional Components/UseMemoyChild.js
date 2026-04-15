import React, { useMemo } from "react";

const UseMemoyChild = ({ learning, count }) => {
  // UseMemo to memoize the value, it will only change if the count changes
  const memoizedValue = useMemo(() => learning(), [learning]);

  return (
    <div>
      <h3>Child Component</h3>
      <div>Memoized Value (Add + Count): {memoizedValue}</div>
      <div>Count(Shared State) in Child Component: {count}</div>
    </div>
  );
};

export default UseMemoyChild;
