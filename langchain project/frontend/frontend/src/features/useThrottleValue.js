import { useState, useEffect, useRef } from "react";

export function useThrottleValue(value, delay = 500) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastExecuted = useRef(Date.now());
  console.log("lastExecuted", lastExecuted);

  useEffect(() => {
    const timeElapsed = Date.now() - lastExecuted.current;
    console.log("timeElapsed", timeElapsed);
    if (timeElapsed >= delay) {
      setThrottledValue(value);
      lastExecuted.current = Date.now();
      console.log("lastExecuted current timeElapsed >= delay", lastExecuted);
    } else {
      const timerId = setTimeout(() => {
        setThrottledValue(value);
        lastExecuted.current = Date.now();
        console.log("lastExecuted current else", lastExecuted);
      }, delay - timeElapsed);

      return () => clearTimeout(timerId);
    }
  }, [value, delay]);
  return throttledValue;
}
