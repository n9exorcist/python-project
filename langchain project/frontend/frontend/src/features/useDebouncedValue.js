import { useEffect, useState } from "react";

/**
 * Custom React hook that debounces a value with a specified delay.
 * Useful for delaying expensive operations like API calls until the user stops changing a value.
 *
 * @param {*} value - The value to debounce
 * @param {number} delay - The delay in milliseconds before the value is updated
 * @returns {*} The debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState("");
 * const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);
 *
 * useEffect(() => {
 *   // This effect runs only when debouncedSearchTerm changes (every 500ms after user stops typing)
 *   console.log("Searching for:", debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 */
export function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if the component unmounts or the value/delay changes
    // This prevents the old timeout from executing after the effect runs again
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
