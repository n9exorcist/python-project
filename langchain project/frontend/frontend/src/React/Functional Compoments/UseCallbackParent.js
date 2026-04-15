import React from "react";
import UseMemoyChild from "./UseMemoyChild";

const UseCallbackParent = () => {
  const [add, setAdd] = React.useState(0);
  const [count, setCount] = React.useState(0);

  // Usecallback to memoize the function, it will only change if the count changes
  //It will not recreate when add changes, it will only recreate when count changes

  const learning = React.useCallback(() => {
    return add + count;
  }, [count]);
  return (
    <>
      <h1>UseCallback and Usememo in React</h1>
      <h3>Parent Component</h3>
      <div>Add(Local State): {add}</div>
      <div>Count(Shared State): {count}</div>
      <button onClick={() => setAdd(add + 1)}>
        Update Add (No Child Render)
      </button>
      <button onClick={() => setCount(count + 1)}>
        Update Count (Triggers Child Render)
      </button>
      <UseMemoyChild learning={learning} count={count} />
    </>
  );
};

export default UseCallbackParent;
