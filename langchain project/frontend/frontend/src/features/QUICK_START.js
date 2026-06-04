#!/usr/bin/env node

/**
 * QUICK START GUIDE
 * Copy-paste reference for all concepts
 */

console.log(`
╔════════════════════════════════════════════════════════════════╗
║    JAVASCRIPT & REACT INTERVIEW MASTERY - QUICK START          ║
╚════════════════════════════════════════════════════════════════╝

📁 FILES CREATED:
├─ 01-flattenArray.js          Flatten arrays & group by reduce
├─ 02-debounce.js               Debounce function (closures!)
├─ 03-firstNonRepeatingChar.js  Algorithm: O(n) vs O(n²)
├─ 04-promiseDelay.js           Promises & retry logic
├─ 05-eventLoop.js              Event Loop deep dive
├─ 06-reactPerformance.js       React optimization patterns
├─ 07-apiManagement.js          Production API client
├─ tests.js                     Comprehensive tests
├─ README.md                    Full documentation
└─ IMPLEMENTATION_GUIDE.md      This guide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ROUND 1: TECHNICAL CODING

1️⃣ FLATTEN ARRAYS & GROUP BY REDUCE
   Time: O(n) | Space: O(n)
   Pattern: reduce() with accumulator
   Key: Array.isArray() + recursion

   flattenArray([1, [2, [3]]])
   => [1, 2, 3]

2️⃣ DEBOUNCE FUNCTION
   Time: O(1) per call
   Key: Closure + clearTimeout (critical!)
   Use: Search inputs, window resize

   const debouncedSearch = debounce(search, 300);
   // Won't call until 300ms after last keystroke

3️⃣ FIRST NON-REPEATING CHARACTER
   O(n) optimal | O(n²) naive
   Pattern: Hash Map + two passes
   Key: Trade space for speed

   firstNonRepeatingChar("hello") => "h"

4️⃣ PROMISE-BASED DELAY
   Pattern: new Promise((resolve) => setTimeout(...))
   Adds: AbortController, retry, timeout support

   await delay(1000);
   const result = await retryWithDelay(fetch, 3);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏛️ ROUND 2: TECH LEAD DISCUSSION

1️⃣ EVENT LOOP (MOST IMPORTANT!)
   
   Execution Priority:
   1. All Synchronous Code (Call Stack)
   2. ALL Microtasks (Promises) ← HIGH PRIORITY
   3. ONE Macrotask (setTimeout)
   4. Back to step 2

   setTimeout(() => console.log("A"), 0);
   Promise.resolve().then(() => console.log("B"));
   
   Output: B (microtask) → A (macrotask)

2️⃣ REACT PERFORMANCE

   ✓ React.memo()     ← Prevent re-renders
   ✓ useCallback()    ← Memoize functions
   ✓ useMemo()        ← Cache computations
   ✓ React.lazy()     ← Code splitting
   ✓ Virtual scroll   ← Large lists

3️⃣ API MANAGEMENT

   Layer 1: Centralized client
   Layer 2: Caching + TTL
   Layer 3: Deduplication + Retry
   Layer 4: Auth token management
   Layer 5: Batch operations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ QUICK REFERENCE SNIPPETS

// DEBOUNCE (Remember to clearTimeout!)
function debounce(func, delay) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);  // ← CRITICAL
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// FLATTEN ARRAY (Use reduce + recursion)
function flattenArray(arr) {
  return arr.reduce((flat, item) => {
    return flat.concat(Array.isArray(item) ? flattenArray(item) : item);
  }, []);
}

// FIRST NON-REPEATING (O(n) with Hash Map)
function firstNonRepeatingChar(str) {
  const counts = {};
  for (const char of str) counts[char] = (counts[char] || 0) + 1;
  for (const char of str) if (counts[char] === 1) return char;
  return null;
}

// PROMISE DELAY (Wrap setTimeout)
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// REACT MEMOIZATION (Prevent re-renders)
const Component = memo(({ data }) => <div>{data}</div>);

const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);

const expensive = useMemo(() => {
  return heavyCalculation(data);
}, [data]);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 MEMORIZE THESE

O(n²) vs O(n) on 10,000 items = 100x difference!
Microtasks execute BEFORE macrotasks (Promises first!)
Debounce MUST clear previous timeout
React.memo only helps if props actually change
Cache only after measuring the problem

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧪 RUN TESTS

node tests.js

✓ Flatten arrays with various depths
✓ Group by conditions
✓ Debounce timer logic
✓ Performance: O(n) vs O(n²)
✓ Promise delays and cancellation
✓ Event Loop execution order

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ FINAL CHECKLIST BEFORE INTERVIEW

Before Technical Round:
☐ Can implement debounce from memory
☐ Can explain O(n) vs O(n²) impact
☐ Can code flatten array recursively
☐ Know first non-repeating char algorithm

Before Tech Lead Round:
☐ Can draw Event Loop diagram
☐ Know microtask vs macrotask priority
☐ Can list 5 React optimizations
☐ Can design 3-tier API client
☐ Know when to optimize vs measure

During Interview:
☐ Ask clarifying questions
☐ Explain approach before coding
☐ Test edge cases
☐ Discuss complexity
☐ Show clean code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 INTERVIEW SCRIPT

"I'll start with a straightforward approach, then optimize.
The key is understanding the underlying data structures
and algorithms. Let me trace through an example to show
the logic, then write clean, tested code."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 You've got everything you need. Good luck! 🎯
`);
