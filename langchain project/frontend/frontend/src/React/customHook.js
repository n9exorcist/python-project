import { useState, useEffect } from "react";

function useDebounce(value, delay = 500) {
  const [debounceValue, setDebounceValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounceValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounceValue;
}

// Usage

function SearchBox() {
  const [input, setInput] = useState("");
  const debouncedInput = useDebounce(input, 500);

  useEffect(() => {
    if (debouncedInput) {
      console.log("API call with", debouncedInput);
    }
  }, [debouncedInput]);

  return <input onChange={(e) => setInput(e.target.value)} />;
}
