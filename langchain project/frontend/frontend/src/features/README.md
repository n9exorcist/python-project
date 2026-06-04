# Complete Interview Preparation Guide: JavaScript & React Advanced Concepts

This repository contains production-ready implementations of advanced JavaScript and React patterns covering both **Technical Coding** and **Tech Lead Discussion** topics.

## 📋 Table of Contents

1. [Round 1: Technical Coding](#round-1-technical-coding)
2. [Round 2: Tech Lead Discussion](#round-2-tech-lead-discussion)
3. [File Structure](#file-structure)
4. [Running Tests](#running-tests)
5. [Key Takeaways](#key-takeaways)

---

## 🎯 Round 1: Technical Coding (Core JS Fundamentals)

### 1. Flatten Arrays & Group by Reduce

**File:** `01-flattenArray.js`

Demonstrates recursive logic and functional programming without libraries like Lodash.

**Key Concepts:**

- `reduce()` for data manipulation
- Recursive array flattening
- Handling arbitrary nesting depth
- Grouping data by various criteria

**Examples:**

```javascript
// Flatten nested arrays
flattenArray([1, [2, [3, [4]]]]);
// => [1, 2, 3, 4]

// Group by condition
groupByReduce([1, 2, 3, 4, 5, 6], (n) => (n % 2 === 0 ? "even" : "odd"));
// => { odd: [1, 3, 5], even: [2, 4, 6] }
```

**Interview Tips:**

- Show understanding of reduce's accumulator pattern
- Explain the recursion base case and recursive step
- Discuss time/space complexity (O(n) time, O(depth) space)

---

### 2. Debounce Function

**File:** `02-debounce.js`

Premium front-end question testing closures, lexical scope, and timer management.

**Key Concepts:**

- Closures and lexical scope
- Timer reset logic (critical!)
- Use cases: search input, window resize, API calls
- Advanced options: leading edge, trailing edge, max wait

**Examples:**

```javascript
// Basic debounce
const debouncedSearch = debounce((query) => {
  console.log("Searching:", query);
}, 300);

// Won't trigger search immediately, only after 300ms of inactivity
debouncedSearch("a");
debouncedSearch("ab");
debouncedSearch("abc");
// Only logs "Searching: abc"
```

**Interview Tips:**

- Explain why clearing the previous timeout is critical
- Discuss the closure capturing the timeout ID
- Mention use cases in React (controlled inputs)
- Explain difference from throttle

---

### 3. First Non-Repeating Character

**File:** `03-firstNonRepeatingChar.js`

Classic algorithmic efficiency check demonstrating O(n) vs O(n²) solutions.

**Key Concepts:**

- Hash Map approach: O(n) time, O(k) space
- Two-pass algorithm
- Naive nested-loop approach (for comparison)
- Character counting pattern

**Examples:**

```javascript
// O(n) solution - two passes with Hash Map
firstNonRepeatingChar("hello");
// => "h"

firstNonRepeatingChar("swiss");
// => "w"

// O(n²) naive solution (DON'T use in production)
firstNonRepeatingCharNaive("hello");
// => "h" (but much slower)
```

**Interview Tips:**

- Start with naive O(n²) then optimize to O(n)
- Explain why Hash Map is better than nested loops
- Discuss space-time trade-off
- Mention variations: case-insensitive, skip special characters

---

### 4. Promise-based Delay

**File:** `04-promiseDelay.js`

Modern asynchronous JavaScript testing clean Promise wrapping of setTimeout.

**Key Concepts:**

- Wrapping callbacks in Promises
- AbortController for cancellation
- Exponential backoff for retries
- Race conditions with promises

**Examples:**

```javascript
// Basic delay
await delay(1000);
console.log("1 second has passed");

// Delay with value
const result = await delayWithValue(500, "Hello!");
// => "Hello!"

// Retry with exponential backoff
const data = await retryWithDelay(() => fetchData(), 3, 100);

// Race with timeout
const result = await raceWithTimeout(fetchData(), 5000, "Request timed out");
```

**Interview Tips:**

- Explain Promise constructor: new Promise((resolve, reject) => ...)
- Show how to handle AbortSignal
- Discuss exponential backoff formula
- Mention use cases: API retries, timeouts

---

## 🏗️ Round 2: Tech Lead Discussion (Architecture & Execution)

### 1. Event Loop & Async Execution

**File:** `05-eventLoop.js`

Make-or-break section showing deep understanding of JavaScript asynchrony.

**Key Concepts:**

- Call Stack (synchronous execution)
- Web APIs (browser async tasks)
- Callback Queue / Macrotask Queue (setTimeout, I/O)
- Microtask Queue (Promises - has PRIORITY!)
- Event Loop mechanics

**Critical Insight:**

```
Execution Order:
1. Call Stack (Synchronous code)
2. Microtask Queue (ALL Promises until empty)
3. One Macrotask (setTimeout)
4. Back to step 2
```

**Real Example:**

```javascript
console.log("1. Start");

setTimeout(() => console.log("4. setTimeout"), 0);

Promise.resolve().then(() => console.log("2. Promise"));

console.log("3. End");

// Output:
// 1. Start
// 3. End
// 2. Promise (Microtask has priority!)
// 4. setTimeout (Macrotask runs last)
```

**Interview Tips:**

- Draw the Event Loop diagram
- Explicitly mention Call Stack, Web APIs, Callback Queue, Microtask Queue
- Explain why Promises execute before setTimeout
- Show understanding of microtask vs macrotask priority

---

### 2. React Performance Optimization

**File:** `06-reactPerformance.js`

Actionable strategies for preventing unnecessary re-renders.

**Core Patterns:**

1. **React.memo** - Memoize components

```javascript
const MemoizedComponent = memo(({ data }) => {
  return <div>{data.title}</div>;
});
```

2. **useCallback** - Memoize functions

```javascript
const handleClick = useCallback(() => {
  setCount((c) => c + 1);
}, []);
```

3. **useMemo** - Memoize expensive calculations

```javascript
const expensiveValue = useMemo(() => {
  return heavyCalculation(data);
}, [data]);
```

4. **Code Splitting** - React.lazy + Suspense

```javascript
const Component = lazy(() => import("./Component"));

<Suspense fallback={<div>Loading...</div>}>
  <Component />
</Suspense>;
```

5. **Virtual Scrolling** - For large lists

```javascript
// Use react-window or react-virtualized
<FixedSizeList height={600} itemCount={1000} itemSize={35}>
  {Row}
</FixedSizeList>
```

**Interview Tips:**

- Don't optimize prematurely - measure first
- Use React DevTools Profiler
- Know when each optimization applies
- Discuss trade-offs (complexity vs performance)
- Mention Web Vitals (LCP, FID, CLS)

---

### 3. Managing Large-Scale API Calls

**File:** `07-apiManagement.js`

Production patterns for handling APIs at scale.

**Architecture Tiers:**

1. **Basic Client** - Centralized fetch

```javascript
const client = new ApiClient("https://api.example.com");
const data = await client.get("/users");
```

2. **Caching** - Response caching per endpoint

```javascript
client.setCacheDuration("/users", 10 * 60 * 1000); // 10 min
```

3. **Request Management**

- Deduplication (prevent duplicate requests)
- Retry with exponential backoff
- Abort stale requests (AbortController)

4. **Authentication**

- Auto-inject auth tokens
- Refresh on 401
- Queue requests during refresh

5. **Batch Operations**

- Combine multiple requests
- Reduce network calls

**Example:**

```javascript
const api = new BatchApiClient(
  "https://api.example.com",
  () => localStorage.getToken(),
  refreshTokenFn,
);

// Automatic caching, retries, auth injection
const users = await api.get("/users");
```

**Interview Tips:**

- Explain each tier and when to use it
- Discuss tradeoffs: caching vs freshness
- Mention React Query / SWR as alternatives
- Show handling of AbortController
- Explain exponential backoff

---

## 📁 File Structure

```
project/
├── 01-flattenArray.js          # Flatten & Group by Reduce
├── 02-debounce.js               # Debounce patterns
├── 03-firstNonRepeatingChar.js  # Algorithm optimization (O(n) vs O(n²))
├── 04-promiseDelay.js           # Promise utilities & retries
├── 05-eventLoop.js              # Event Loop explained
├── 06-reactPerformance.js       # React optimization patterns
├── 07-apiManagement.js          # API client patterns
├── tests.js                     # Comprehensive test suite
└── README.md                    # This file
```

---

## 🧪 Running Tests

```bash
# Run all tests
node tests.js

# Or with Jest
npm test

# For specific test
node -e "import('./tests.js')"
```

**Test Coverage:**

- Flatten arrays with various depths
- Group by various conditions
- Debounce timer logic
- First non-repeating character (O(n) vs O(n²))
- Promise delays and cancellation
- Event Loop execution order
- Performance comparisons

---

## 🔑 Key Takeaways for Interviews

### Technical Coding Round

1. **Understand under the hood** - No black-box library knowledge
2. **Time complexity matters** - O(n) vs O(n²) is significant
3. **Show your process** - Explain before coding
4. **Test edge cases** - Empty arrays, null values, etc.
5. **Clean code** - Readable and maintainable

### Tech Lead Discussion Round

1. **Event Loop mastery** - Absolutely non-negotiable
2. **Actionable solutions** - Not vague answers
3. **Measurement first** - Don't optimize without profiling
4. **Trade-offs** - Discuss pros/cons of each approach
5. **Scalability mindset** - Think about production needs

---

## 📚 Advanced Topics (Bonus)

- **Concurrent React** - useTransition, useDeferredValue
- **Suspense for data** - Component-level data fetching
- **React Query** - Enterprise caching solution
- **GraphQL** - Query optimization
- **Web Workers** - Off-thread computation
- **Service Workers** - Offline support & caching

---

## 💡 Interview Prep Checklist

- [ ] Can explain Event Loop without notes
- [ ] Can implement debounce from memory
- [ ] Understand O(n²) vs O(n) implications
- [ ] Know when to use React.memo/useCallback/useMemo
- [ ] Can design scalable API client
- [ ] Can handle AbortController for request cancellation
- [ ] Understand Promises vs Callbacks vs async/await
- [ ] Can explain closure and lexical scope
- [ ] Know difference between debounce and throttle
- [ ] Can design caching strategy

---

## 🚀 Final Tips

1. **Practice live coding** - Under time pressure
2. **Verbalize thinking** - Explain as you code
3. **Ask clarifying questions** - Don't assume requirements
4. **Consider edge cases** - Show completeness
5. **Optimize for readability** - Then performance
6. **Show system design mindset** - Think about scale
7. **Discuss tradeoffs** - No perfect solution
8. **Learn from feedback** - Iteratively improve

---

Good luck with your interviews! 🎯
