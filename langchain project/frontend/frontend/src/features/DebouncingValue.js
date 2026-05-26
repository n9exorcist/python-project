import { useEffect, useState } from "react";

export function DebouncingValue(value, delay) {
  const [debouncedValue, setdebouncingValue] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setdebouncingValue(value), delay);

    //Clean up is critical

    return () => clearTimeout(id);
  }, [value, delay]);

  return debouncedValue;
}
