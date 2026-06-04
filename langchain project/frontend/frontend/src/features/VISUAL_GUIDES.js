/**
 * VISUAL GUIDES FOR KEY CONCEPTS
 * Use these diagrams to understand and memorize key patterns
 */

const visualGuides = `

╔════════════════════════════════════════════════════════════════════╗
║                   EVENT LOOP ARCHITECTURE                         ║
╚════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────┐
│                                                         │
│   JAVASCRIPT RUNTIME                                    │
│   ───────────────────────────────────────────────────   │
│                                                         │
│   ┌────────────────────────────────────────────┐       │
│   │  CALL STACK (Main Thread - Synchronous)   │       │
│   │  ├─ function calls                        │       │
│   │  ├─ variable assignments                 │       │
│   │  └─ synchronous code execution           │       │
│   └────────────────────────────────────────────┘       │
│            │                                            │
│            │ (When Empty)                              │
│            ↓                                            │
│   ┌────────────────────────────────────────────┐       │
│   │  MICROTASK QUEUE (High Priority)          │       │
│   │  ├─ Promise.then/catch/finally           │       │
│   │  ├─ async/await (awaiting)                │       │
│   │  ├─ queueMicrotask()                      │       │
│   │  └─ MutationObserver                      │       │
│   │  (Executes ALL before next macrotask)     │       │
│   └────────────────────────────────────────────┘       │
│            │                                            │
│            │ (When Empty)                              │
│            ↓                                            │
│   ┌────────────────────────────────────────────┐       │
│   │  MACROTASK QUEUE (Lower Priority)         │       │
│   │  ├─ setTimeout / setInterval              │       │
│   │  ├─ setImmediate (Node.js)                │       │
│   │  ├─ I/O operations                        │       │
│   │  └─ UI rendering                          │       │
│   │  (Executes ONE per cycle)                 │       │
│   └────────────────────────────────────────────┘       │
│            │                                            │
│            └──────┐ (Back to Microtask Queue)          │
│                   │                                     │
│                   ↓ (Repeat cycle)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘

WEB APIs (Browser)
  ├─ setTimeout
  ├─ fetch
  ├─ XMLHttpRequest
  └─ DOM methods


╔════════════════════════════════════════════════════════════════════╗
║              DEBOUNCE EXECUTION TIMELINE                           ║
╚════════════════════════════════════════════════════════════════════╝

User types rapidly: "h" "e" "l" "l" "o"
│
├─ 0ms:    User types "h"
│          ├─ Timer starts (300ms)
│          └─ Waiting...
│
├─ 50ms:   User types "e"  ← New keystroke
│          ├─ Clear previous timer (cancel search for "h")
│          ├─ Start new timer (300ms)
│          └─ Waiting...
│
├─ 100ms:  User types "l"  ← New keystroke
│          ├─ Clear previous timer (cancel search for "he")
│          ├─ Start new timer (300ms)
│          └─ Waiting...
│
├─ 150ms:  User types "l"  ← New keystroke
│          ├─ Clear previous timer
│          ├─ Start new timer (300ms)
│          └─ Waiting...
│
├─ 200ms:  User types "o"  ← New keystroke
│          ├─ Clear previous timer
│          ├─ Start new timer (300ms)
│          └─ Waiting...
│
├─ 300ms:  Timer fires! No more keystrokes
│          ├─ Execute: search("hello")
│          ├─ API call sent
│          └─ Done!
│
└─ 450ms:  User stops typing
           └─ Total API calls: 1 (without debounce: 5!)


╔════════════════════════════════════════════════════════════════════╗
║         ALGORITHM EFFICIENCY: O(n) vs O(n²)                        ║
╚════════════════════════════════════════════════════════════════════╝

Problem: Find first non-repeating character

O(n²) NAIVE APPROACH:
┌─────────────────────────────────────┐
│ for each character:                 │
│   for each other character:         │
│     compare                         │
│   end                               │
│ end                                 │
└─────────────────────────────────────┘

Time: 10,000² = 100,000,000 operations = 1000ms ❌

O(n) OPTIMIZED APPROACH:
┌─────────────────────────────────────┐
│ Pass 1: Count characters            │
│   for each character: count it      │
│ Pass 2: Find first with count 1     │
│   for each character:               │
│     if count == 1: return it        │
│ end                                 │
└─────────────────────────────────────┘

Time: 10,000 + 10,000 = 20,000 operations = 1ms ✅

SPEEDUP: 1000x faster!


╔════════════════════════════════════════════════════════════════════╗
║          PROMISE EXECUTION PATTERN                                 ║
╚════════════════════════════════════════════════════════════════════╝

Synchronous:
  function () {
    return value;
  }
  ├─ Executes immediately
  └─ Blocking

Callback:
  function (callback) {
    setTimeout(() => callback(value), 1000);
  }
  ├─ Callback hell issues
  └─ Hard to compose

Promise:
  new Promise(resolve => {
    setTimeout(() => resolve(value), 1000);
  })
  .then(value => doSomething(value))
  .catch(error => handleError(error))
  .finally(() => cleanup())
  ├─ Chain-able
  ├─ Error handling
  ├─ Composable
  └─ Clean syntax


╔════════════════════════════════════════════════════════════════════╗
║         REACT RE-RENDER PREVENTION                                 ║
╚════════════════════════════════════════════════════════════════════╝

WITHOUT OPTIMIZATION:
│
├─ Parent state changes
│  ├─ Parent re-renders
│  ├─ Child1 re-renders (unnecessary!)
│  ├─ Child2 re-renders (unnecessary!)
│  ├─ Child3 re-renders (unnecessary!)
│  └─ 10+ more unnecessary re-renders!

WITH React.memo + useCallback + useMemo:
│
├─ Parent state changes
│  ├─ Parent re-renders
│  ├─ Child1 skipped (props unchanged) ✓
│  ├─ Child2 re-renders (only this needs to)
│  ├─ Child3 skipped (props unchanged) ✓
│  └─ 100+ unnecessary re-renders prevented!

RESULT: 10x performance improvement


╔════════════════════════════════════════════════════════════════════╗
║       FLATTEN ARRAY RECURSION TREE                                 ║
╚════════════════════════════════════════════════════════════════════╝

Input: [1, [2, [3, 4]], 5]

flattenArray([1, [2, [3, 4]], 5])
│
├─ Process 1 (not array)
│  ├─ Result: [1]
│
├─ Process [2, [3, 4]] (is array!)
│  │
│  └─ flattenArray([2, [3, 4]])
│     │
│     ├─ Process 2 (not array)
│     │  ├─ Result: [2]
│     │
│     └─ Process [3, 4] (is array!)
│        │
│        └─ flattenArray([3, 4])
│           │
│           ├─ Process 3 (not array): [3]
│           ├─ Process 4 (not array): [4]
│           └─ Return: [3, 4]
│
│        └─ Result: [2, 3, 4]
│
│     └─ Return: [2, 3, 4]
│
├─ Result: [1, 2, 3, 4]
│
└─ Process 5 (not array)
   ├─ Result: [..., 5]

FINAL OUTPUT: [1, 2, 3, 4, 5]


╔════════════════════════════════════════════════════════════════════╗
║        GROUP BY REDUCE PATTERN                                     ║
╚════════════════════════════════════════════════════════════════════╝

Input:  [1, 2, 3, 4, 5, 6]
Group:  n % 2 === 0 ? 'even' : 'odd'

Process:
Step 1: accumulator = {}
Step 2: Process 1
        key = 'odd'
        accumulator = { odd: [1] }

Step 3: Process 2
        key = 'even'
        accumulator = { odd: [1], even: [2] }

Step 4: Process 3
        key = 'odd'
        accumulator = { odd: [1, 3], even: [2] }

... (continue for 4, 5, 6)

Output: { odd: [1, 3, 5], even: [2, 4, 6] }


╔════════════════════════════════════════════════════════════════════╗
║         API CLIENT ARCHITECTURE LAYERS                             ║
╚════════════════════════════════════════════════════════════════════╝

Layer 5: Batch Operations
         ├─ Combine 10 requests into 1
         └─ Reduce network calls

Layer 4: Authentication
         ├─ Auto-inject tokens
         ├─ Refresh on 401
         └─ Queue during refresh

Layer 3: Request Management
         ├─ Retry (exponential backoff)
         ├─ Deduplicate requests
         └─ Abort stale requests

Layer 2: Caching
         ├─ Cache GET responses
         ├─ TTL per endpoint
         └─ Manual invalidation

Layer 1: Basic Client
         ├─ Centralized fetch
         ├─ Interceptors
         └─ Error handling

         ↓

    Your Application


╔════════════════════════════════════════════════════════════════════╗
║      EXPONENTIAL BACKOFF TIMING                                    ║
╚════════════════════════════════════════════════════════════════════╝

Request fails: API down temporarily

Retry Attempt 1:  Wait 100ms    → Try again
                  └─ Fail

Retry Attempt 2:  Wait 200ms    → Try again
                  └─ Fail

Retry Attempt 3:  Wait 400ms    → Try again
                  └─ Fail

Retry Attempt 4:  Wait 800ms    → Try again
                  └─ Success!

Total wait: 100 + 200 + 400 + 800 = 1500ms

Formula: delay = baseDelay * 2^(attempt - 1)
Benefit: Reduces server load during outages


╔════════════════════════════════════════════════════════════════════╗
║           MEMORY HIERARCHY                                         ║
╚════════════════════════════════════════════════════════════════════╝

Reading 1 byte:

CPU Registers:   ~0.1ns  (Cache L1)
L1 Cache:        ~1ns    
L2 Cache:        ~10ns   
L3 Cache:        ~100ns  
RAM:             ~100ns  (1000x slower than L1)
SSD:             ~1ms    (10,000x slower than RAM)
HDD:             ~10ms   
Network:         ~100ms  (100,000x slower than RAM)

Lesson: Minimize API calls! Network is slow!
Solution: Caching, deduplication, batching


╔════════════════════════════════════════════════════════════════════╗
║                CLOSURE IN DEBOUNCE                                 ║
╚════════════════════════════════════════════════════════════════════╝

function debounce(func, delay) {
  let timeoutId = null;  ← Closure captures this
  
  return function(...args) {
    clearTimeout(timeoutId);  ← Accesses closure variable
    timeoutId = setTimeout(   ← Updates closure variable
      () => func(...args), 
      delay
    );
  };
}

Each call to debounce() creates:
✓ New closure (new timeoutId)
✓ New returned function (bound to its closure)
✓ Independent state (separate timers)

Important: Never use global variables for timeoutId!


╔════════════════════════════════════════════════════════════════════╗
║              WHEN TO OPTIMIZE                                      ║
╚════════════════════════════════════════════════════════════════════╝

MEASURE FIRST → IDENTIFY PROBLEM → OPTIMIZE

Step 1: Profiling
        ├─ React DevTools Profiler
        ├─ Chrome DevTools Performance
        └─ Network tab

Step 2: Identify Bottleneck
        ├─ Unnecessary re-renders?
        ├─ Expensive computation?
        ├─ Too many API calls?
        └─ Large bundle size?

Step 3: Apply Optimization
        ├─ React.memo?
        ├─ useCallback?
        ├─ useMemo?
        ├─ Code splitting?
        └─ Caching?

Step 4: Measure Improvement
        └─ Confirm it worked!

WARNING: Premature optimization = wasted time!
`;

console.log(visualGuides);

export default visualGuides;
