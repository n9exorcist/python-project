// UseImperativeHandle
// child components

import React, {
  useImperativeHandle,
  forwardRef,
  useRef,
  useState,
} from "react";

const CustomInput = forwardRef(({ onAdd }, ref2) => {
  const [val, setVal] = useState("");
  const innerInputRef = useRef();

  // Question 7: Giving the parent controlled access to the child's DOM/Logic
  // This "exposes" specific functions to the parent component
  useImperativeHandle(ref2, () => ({
    clearAndFocus: () => {
      setVal(""); // Clear the internal state
      innerInputRef.current.focus(); // Focus the DOM element
    },
  }));

  return (
    <div className="flex gap-2">
      <input
        ref={innerInputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="border p-2 rounded"
      />
      <button
        onClick={() => {
          onAdd(val); // Executes the parent's addTask function with current input value
          setVal(""); // Clears child's internal state
        }}
      >
        Child Add
      </button>
    </div>
  );
});

// This name will now show up in the DevTools instead of "Anonymous"
CustomInput.displayName = "ChildInput";

export default CustomInput;
