/**
 * Promise-based Delay
 * Tests modern asynchronous JavaScript and Promise understanding
 * Shows clean wrapping of setTimeout inside Promise constructor
 */

/**
 * Creates a Promise that resolves after a specified delay
 * Clean way to use promises for timing without callbacks
 * @param {number} ms - The delay in milliseconds
 * @returns {Promise<void>} Promise that resolves after the delay
 *
 * @example
 * await delay(1000);
 * console.log("1 second has passed");
 *
 * @example
 * delay(500).then(() => {
 *   console.log("Delayed callback");
 * });
 */
export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Delay with rejection capability (supports AbortController cancellation)
 * @param {number} ms - The delay in milliseconds
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @returns {Promise<void>} Promise that resolves after the delay
 *
 * @throws {AbortError} If the signal is aborted before delay completes
 *
 * @example
 * const controller = new AbortController();
 * const promise = delayCancellable(5000, controller.signal);
 * setTimeout(() => controller.abort(), 1000);
 * try {
 *   await promise;
 * } catch (e) {
 *   console.log("Delay was cancelled");
 * }
 */
export function delayCancellable(ms, signal = null) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (signal) {
      // Reject if abort is signaled before timeout completes
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error("Delay was cancelled"));
      };

      if (signal.aborted) {
        clearTimeout(timeoutId);
        reject(new Error("Delay was cancelled"));
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }
  });
}

/**
 * Delay with a value to resolve to
 * Useful for chaining operations that need to return something
 * @param {number} ms - The delay in milliseconds
 * @param {*} value - The value to resolve to (default: undefined)
 * @returns {Promise<*>} Promise that resolves to the provided value after delay
 *
 * @example
 * const result = await delayWithValue(1000, "Hello!");
 * console.log(result); // "Hello!"
 */
export function delayWithValue(ms, value) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

/**
 * Delay that tracks progress
 * @param {number} ms - The delay in milliseconds
 * @param {Function} onProgress - Callback with progress percentage (0-100)
 * @returns {Promise<void>} Promise that resolves after the delay
 *
 * @example
 * await delayWithProgress(3000, (progress) => {
 *   console.log(`Progress: ${progress}%`);
 * });
 */
export function delayWithProgress(ms, onProgress) {
  return new Promise((resolve) => {
    const steps = 20; // Update progress 20 times
    const stepDuration = ms / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      const progress = Math.round((currentStep / steps) * 100);
      onProgress(Math.min(progress, 100));

      if (currentStep >= steps) {
        clearInterval(interval);
        resolve();
      }
    }, stepDuration);
  });
}

/**
 * Retry an async function with exponential backoff delay
 * @param {Function} asyncFn - The async function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in milliseconds (default: 100)
 * @returns {Promise<*>} The result of the successful function call
 *
 * @throws {Error} If all retries fail
 *
 * @example
 * const result = await retryWithDelay(
 *   () => fetchData("https://api.example.com/data"),
 *   3,
 *   100
 * );
 */
export async function retryWithDelay(
  asyncFn,
  maxRetries = 3,
  initialDelay = 100,
) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff: delay = initialDelay * (2 ^ attempt)
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        await delay(exponentialDelay);
      }
    }
  }

  throw new Error(
    `Failed after ${maxRetries + 1} attempts: ${lastError.message}`,
  );
}

/**
 * Race between a promise and a timeout
 * Returns the promise result if it completes before timeout, otherwise rejects
 * @param {Promise} promise - The promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Error message if timeout occurs
 * @returns {Promise<*>} The promise result or timeout error
 *
 * @example
 * const result = await raceWithTimeout(
 *   fetch("https://api.example.com/data"),
 *   5000,
 *   "Request took too long"
 * );
 */
export function raceWithTimeout(
  promise,
  timeoutMs,
  timeoutMessage = "Operation timed out",
) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
}

/**
 * Chain multiple delayed operations in sequence
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {number} delayBetween - Delay between operations in milliseconds
 * @returns {Promise<Array>} Array of results from all operations
 *
 * @example
 * const results = await chainDelayedOperations(
 *   [
 *     () => fetch("/api/users"),
 *     () => fetch("/api/posts"),
 *     () => fetch("/api/comments")
 *   ],
 *   1000
 * );
 */
export async function chainDelayedOperations(operations, delayBetween = 0) {
  const results = [];

  for (const operation of operations) {
    results.push(await operation());
    if (delayBetween > 0) {
      await delay(delayBetween);
    }
  }

  return results;
}
