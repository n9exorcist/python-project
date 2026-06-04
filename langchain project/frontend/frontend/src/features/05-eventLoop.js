/**
 * EVENT LOOP & ASYNC EXECUTION IN JAVASCRIPT
 * Comprehensive explanation and practical examples
 *
 * The JavaScript Event Loop:
 * 1. Call Stack - Where function execution happens (LIFO)
 * 2. Web APIs - Browser APIs that handle async tasks (setTimeout, fetch, etc)
 * 3. Callback Queue (Macrotask Queue) - setTimeout, setInterval, I/O operations
 * 4. Microtask Queue - Promises, queueMicrotask, MutationObserver
 * 5. Event Loop - Continuously checks if Call Stack is empty
 *
 * CRITICAL: Microtasks have PRIORITY over Macrotasks
 * - Call Stack executes
 * - ALL Microtasks execute (until empty)
 * - Then ONE Macrotask executes
 * - Back to step 2
 */

/**
 * Demonstration 1: Basic Event Loop Execution Order
 * Shows call stack, Web APIs, and callback queue
 */
export function eventLoopDemo1() {
  console.log("1. Start");

  setTimeout(() => {
    console.log("2. setTimeout callback (Macrotask Queue)");
  }, 0);

  console.log("3. End");

  // Output Order:
  // 1. Start
  // 3. End
  // 2. setTimeout callback (Macrotask Queue)
  //
  // WHY:
  // - "1. Start" executes immediately (Call Stack)
  // - setTimeout is sent to Web APIs, callback goes to Macrotask Queue
  // - "3. End" executes immediately (Call Stack)
  // - Call Stack is now empty, Event Loop moves callback to Call Stack
  // - setTimeout callback executes
}

/**
 * Demonstration 2: Microtasks vs Macrotasks
 * Shows the PRIORITY of Microtasks over Macrotasks
 */
export function eventLoopDemo2() {
  console.log("1. Synchronous start");

  // Macrotask
  setTimeout(() => {
    console.log("4. setTimeout (Macrotask)");
  }, 0);

  // Microtask - Promises have higher priority
  Promise.resolve()
    .then(() => {
      console.log("2. Promise (Microtask) - executes BEFORE setTimeout");
    })
    .then(() => {
      console.log("3. Promise chain (Microtask) - all microtasks run first");
    });

  console.log("5. Synchronous end");

  // Output Order:
  // 1. Synchronous start
  // 5. Synchronous end
  // 2. Promise (Microtask) - executes BEFORE setTimeout
  // 3. Promise chain (Microtask) - all microtasks run first
  // 4. setTimeout (Macrotask)
  //
  // WHY: Event Loop priority is:
  // 1. Execute all Synchronous code
  // 2. Execute ALL Microtasks (Promises)
  // 3. Then execute ONE Macrotask (setTimeout)
}

/**
 * Demonstration 3: Complex Event Loop Scenario
 * Multiple macrotasks and microtasks interleaved
 */
export async function eventLoopDemo3() {
  console.log("Start");

  // Macrotask 1
  setTimeout(() => {
    console.log("Timeout 1");
    // Microtask inside Macrotask gets priority
    Promise.resolve().then(() => console.log("Promise inside Timeout 1"));
  }, 0);

  // Microtask 1
  Promise.resolve()
    .then(() => {
      console.log("Promise 1");
      // Macrotask inside Microtask
      setTimeout(() => {
        console.log("Timeout inside Promise 1");
      }, 0);
    })
    .then(() => {
      console.log("Promise 2");
    });

  // Macrotask 2
  setTimeout(() => {
    console.log("Timeout 2");
  }, 0);

  console.log("End");

  // Output Order:
  // Start
  // End
  // Promise 1 (Microtask first)
  // Promise 2 (Rest of Microtasks)
  // Timeout 1 (Macrotask 1)
  // Promise inside Timeout 1 (Microtask of Macrotask)
  // Timeout 2 (Macrotask 2)
  // Timeout inside Promise 1 (Queued macrotask)
}

/**
 * Demonstration 4: queueMicrotask for manual microtask scheduling
 * Shows explicit control over microtask queue
 */
export function eventLoopDemo4() {
  console.log("Start");

  queueMicrotask(() => {
    console.log("queueMicrotask - explicit microtask");
  });

  Promise.resolve().then(() => {
    console.log("Promise microtask");
  });

  setTimeout(() => {
    console.log("setTimeout macrotask");
  }, 0);

  console.log("End");

  // Output:
  // Start
  // End
  // queueMicrotask - explicit microtask
  // Promise microtask
  // setTimeout macrotask
}

/**
 * Demonstration 5: Async/Await and Event Loop
 * async/await is syntactic sugar over Promises (microtasks)
 */
export async function eventLoopDemo5() {
  console.log("1. Start");

  // This goes to Microtask Queue, NOT Macrotask
  const result = await Promise.resolve("value");
  console.log("2. After await (Microtask)");

  setTimeout(() => {
    console.log("3. setTimeout (Macrotask)");
  }, 0);

  console.log("4. End");

  // Output:
  // 1. Start
  // 4. End
  // 2. After await (Microtask)
  // 3. setTimeout (Macrotask)
}

/**
 * Real-world scenario: API call with multiple operations
 * Shows how Event Loop affects API handling
 */
export async function realWorldEventLoopExample() {
  console.log("Fetching data...");

  // Simulate API call returning a Promise (Microtask)
  const data = await simulateApiCall();
  console.log("Data received:", data);

  // Process data immediately (Microtask - part of async chain)
  const processed = processData(data);
  console.log("Data processed:", processed);

  // Schedule cleanup later (Macrotask)
  setTimeout(() => {
    console.log("Cleanup completed");
  }, 0);
}

async function simulateApiCall() {
  return new Promise((resolve) => {
    // In real code, this would be fetch() or axios()
    setTimeout(() => {
      resolve({ id: 1, name: "User" });
    }, 100);
  });
}

function processData(data) {
  return { ...data, processed: true };
}

/**
 * Understanding execution order with logging
 * Use this to trace through event loop mentally
 */
export function traceEventLoop() {
  const trace = [];

  trace.push("Call Stack: console.log('1')");
  console.log("1. Start");

  trace.push("Call Stack: setTimeout queued → Web API");
  setTimeout(() => {
    trace.push("Macrotask Queue → Call Stack: setTimeout callback");
    console.log("4. setTimeout callback");
  }, 0);

  trace.push("Call Stack: Promise.resolve()");
  Promise.resolve()
    .then(() => {
      trace.push("Microtask Queue → Call Stack: Promise.then");
      console.log("2. Promise.then");
    })
    .then(() => {
      trace.push("Microtask Queue → Call Stack: Promise.then (2)");
      console.log("3. Promise.then (2)");
    });

  trace.push("Call Stack: console.log('End')");
  console.log("5. End");

  setTimeout(() => {
    console.log("\n=== Execution Trace ===");
    trace.forEach((line) => console.log(line));
  }, 500);
}

export const eventLoopExplanation = `
╔══════════════════════════════════════════════════════════════╗
║            JAVASCRIPT EVENT LOOP ARCHITECTURE                ║
╚══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────┐
│      CALL STACK (Synchronous)       │ ← Executes line by line
│  - Function calls                   │ ← LIFO (Last In First Out)
│  - Synchronous code                 │
└─────────────────────────────────────┘

        │ (When empty)
        ↓

┌─────────────────────────────────────┐
│    MICROTASK QUEUE (Priority)       │ ← Executes ALL before macrotask
│  - Promise.then/catch/finally       │
│  - async/await                      │
│  - queueMicrotask()                 │
│  - MutationObserver                 │
└─────────────────────────────────────┘

        │ (When empty)
        ↓

┌─────────────────────────────────────┐
│    MACROTASK QUEUE (Next)           │ ← Executes ONE per cycle
│  - setTimeout/setInterval           │
│  - setImmediate (Node.js)           │
│  - I/O operations                   │
│  - UI rendering                     │
└─────────────────────────────────────┘

        │ (Back to Microtask Queue check)
        ↓

╔══════════════════════════════════════════════════════════════╗
║                   EXECUTION PRIORITY                         ║
╚══════════════════════════════════════════════════════════════╝

HIGHEST:  Synchronous Code (Call Stack)
   ↓     All Microtasks (empty entire queue)
   ↓     One Macrotask (setTimeout, etc)
   ↓     Check Microtasks again (repeat cycle)
LOWEST:   Next Macrotask

KEY INSIGHT: Event Loop ALWAYS processes ALL Microtasks before 
ANY Macrotask. This is why Promises execute before setTimeout!

╔══════════════════════════════════════════════════════════════╗
║                    PRACTICAL EXAMPLE                         ║
╚══════════════════════════════════════════════════════════════╝

setTimeout(() => console.log("A"), 0);        // Macrotask
Promise.resolve().then(() => console.log("B")); // Microtask
console.log("C");                             // Sync

Output: C → B → A

Explanation:
1. "C" prints first (Call Stack - synchronous)
2. "B" prints second (Microtask Queue - has priority)
3. "A" prints last (Macrotask Queue - executes when Microtask empty)
`;
