import React from "react";
import { useState } from "react";

const Calculate = () => {
  const [value, setValue] = useState(1);
  return (
    <div>
      <h1>State in React</h1>
      <button onClick={() => setValue(value + 1)}>Increment</button>
      <p>{value}</p>
    </div>
  );
};

export default Calculate;
