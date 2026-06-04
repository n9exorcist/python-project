/**
 * Debounce Function Implementation
 * Tests closures, lexical scope, and timer management
 * Critical for understanding how to prevent excessive API calls
 */

/**
 * Creates a debounced function that delays execution until after a specified delay
 * Resets the timer on each call, preventing execution until the function stops being called
 * @param {Function} func - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {Function} The debounced function
 *
 * @example
 * const debouncedSearch = debounce((query) => {
 *   console.log("Searching:", query);
 * }, 300);
 *
 * // Call multiple times (e.g., in onInput handler)
 * debouncedSearch("a");
 * debouncedSearch("ab");
 * debouncedSearch("abc");
 * // Only logs "Searching: abc" after 300ms of inactivity
 */
export function debounce(func, delay) {
  let timeoutId = null;

  function debounced(...args) {
    // Clear the previous timer - this is key to debouncing
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set a new timer
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  }

  // Allow manual cancellation
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // Allow immediate execution and reset
  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      func.apply(this, arguments);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Debounce with leading edge execution option
 * Can execute immediately on first call, then wait for debounce period
 * @param {Function} func - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @param {Object} options - Configuration options
 * @param {boolean} options.leading - Execute on leading edge (default: false)
 * @param {boolean} options.trailing - Execute on trailing edge (default: true)
 * @param {number} options.maxWait - Maximum time to wait before forced execution
 * @returns {Function} The debounced function
 *
 * @example
 * const debouncedClick = debounceAdvanced(() => {
 *   console.log("Clicked!");
 * }, 300, { leading: true, trailing: false });
 */
export function debounceAdvanced(func, delay, options = {}) {
  const { leading = false, trailing = true, maxWait = null } = options;
  let timeoutId = null;
  let maxTimeoutId = null;
  let lastArgs = null;
  let lastThis = null;
  let result = null;
  let lastCallTime = null;
  let lastInvokeTime = 0;
  let leading_called = false;

  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = null;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function shouldInvoke(time) {
    if (lastCallTime === null) return true;
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      timeSinceLastCall >= delay ||
      timeSinceLastCall < 0 ||
      (maxWait && timeSinceLastInvoke >= maxWait)
    );
  }

  function trailingEdge(time) {
    timeoutId = null;
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = null;
    return result;
  }

  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    const timeSinceLastCall = Date.now() - lastCallTime;
    timeoutId = setTimeout(timerExpired, delay - timeSinceLastCall);
  }

  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (!timeoutId && leading) {
        leading_called = true;
        invokeFunc(time);
      }
      if (!timeoutId) {
        timeoutId = setTimeout(timerExpired, delay);
      }
      if (maxWait && !maxTimeoutId) {
        maxTimeoutId = setTimeout(() => {
          const time = Date.now();
          if (shouldInvoke(time)) {
            trailingEdge(time);
          }
          maxTimeoutId = null;
        }, maxWait);
      }
    }

    return result;
  }

  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (maxTimeoutId) clearTimeout(maxTimeoutId);
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeoutId = maxTimeoutId = null;
  };

  debounced.flush = () => {
    return !timeoutId ? result : trailingEdge(Date.now());
  };

  return debounced;
}
