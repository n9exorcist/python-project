import React, { memo } from "react";

const UseMemoyChild = memo(({ learning, count }) => {
  return (
    <div>
      <h3>Child Component</h3>
      <p>Learning: {learning()}</p>
      <p>Count: {count}</p>
    </div>
  );
});

export default UseMemoyChild;
