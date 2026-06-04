# INTERVIEW MASTER GUIDE: Complete JavaScript & React Implementation

## Quick Navigation

### 📝 Files Created

```
01-flattenArray.js          → Flatten Arrays & Group by Reduce (O(n) approach)
02-debounce.js              → Debounce Function (closures, timers)
03-firstNonRepeatingChar.js → Algorithm Optimization (O(n) vs O(n²))
04-promiseDelay.js          → Promise utilities & retry logic
05-eventLoop.js             → Event Loop deep dive
06-reactPerformance.js      → React optimization patterns
07-apiManagement.js         → Enterprise API client patterns
tests.js                    → Comprehensive test suite
README.md                   → Full documentation
IMPLEMENTATION_GUIDE.md     → This file
```

---

## 🎯 ROUND 1: TECHNICAL CODING DEEP DIVE

### Concept 1: Flatten Arrays & Group by Reduce

**Why it matters:**

- Tests recursive thinking and reduce() mastery
- Shows functional programming understanding
- Critical for data transformation tasks

**File:** `01-flattenArray.js`

**Key Functions:**

```javascript
flattenArray(arr); // Recursively flatten to any depth
flattenArrayDepth(arr, depth); // Flatten with depth limit
groupByReduce(arr, fn); // Group by reducer function
groupByMultiple(arr, keyFn); // Group objects by property
```

**Time Complexity Analysis:**

```
flattenArray()   → O(n) where n = total elements
                   O(d) space where d = max depth

groupByReduce()  → O(n) time, O(n) space
```

**Interview Talking Points:**

1. "I use reduce() which maintains an accumulator"
2. "For flattening, I check if item is array with Array.isArray()"
3. "I recursively call on nested arrays"
4. "Space complexity is O(depth) for the call stack"

---

### Concept 2: Debounce Function

**Why it matters:**

- Premium question showing closure + timer mastery
- Shows understanding of preventing API spam
- Requires understanding lexical scope

**File:** `02-debounce.js`

**Key Functions:**

```javascript
debounce(func, delay); // Basic debounce
debounceAdvanced(func, delay, opts); // With leading/trailing/maxWait
```

**Critical Detail - Timer Reset:**

```javascript
// WITHOUT proper reset → calls multiple times ✗
export function badDebounce(func, delay) {
  let timeoutId = null;
  return (...args) => {
    // MISSING: clearTimeout(timeoutId) ← This is the bug!
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// WITH proper reset → calls once ✓
export function goodDebounce(func, delay) {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId); // ← Key line!
    timeoutId = setTimeout(() => func(...args), delay);
  };
}
```

**Interview Talking Points:**

1. "Debounce uses a closure to store the timeoutId"
2. "Each call clears the previous timer - this is critical"
3. "Only the last call executes after the delay"
4. "Use case: search inputs, window resize events"
5. "Difference from throttle: throttle executes periodically"

---

### Concept 3: First Non-Repeating Character

**Why it matters:**

- Tests algorithmic thinking and optimization
- Shows understanding of data structures
- O(n) vs O(n²) is a 100x difference on 10K items

**File:** `03-firstNonRepeatingChar.js`

**Comparison: O(n) vs O(n²)**

```javascript
// ✓ OPTIMAL: O(n) time, O(k) space
export function firstNonRepeatingChar(str) {
  const charCount = {};

  // Pass 1: Count characters
  for (const char of str) {
    charCount[char] = (charCount[char] || 0) + 1;
  }

  // Pass 2: Find first with count 1
  for (const char of str) {
    if (charCount[char] === 1) {
      return char;
    }
  }
  return null;
}

// ✗ NAIVE: O(n²) time
export function firstNonRepeatingCharNaive(str) {
  for (let i = 0; i < str.length; i++) {
    let isUnique = true;
    for (let j = 0; j < str.length; j++) {
      // ← Nested loop = O(n²)
      if (i !== j && str[i] === str[j]) {
        isUnique = false;
        break;
      }
    }
    if (isUnique) return str[i];
  }
  return null;
}
```

**Performance Difference:**

```
String length: 10,000 characters
O(n)   solution:  ~1ms
O(n²)  solution:  ~1000ms (1 second!)

Ratio: 1000x slower!
```

**Interview Talking Points:**

1. "Start with naive O(n²) approach"
2. "Then optimize: use a Hash Map"
3. "Two passes is better than nested loops"
4. "Space complexity trade-off: O(k) for O(n) speed"
5. "Variations: case-insensitive, skip punctuation"

---

### Concept 4: Promise-based Delay

**Why it matters:**

- Tests modern async JavaScript
- Shows Promise constructor understanding
- Real-world utility (retries, timeouts)

**File:** `04-promiseDelay.js`

**Key Functions:**

```javascript
delay(ms); // Basic delay promise
delayCancellable(ms, signal); // With AbortSignal
delayWithValue(ms, value); // Resolve to value
retryWithDelay(asyncFn, retries); // Exponential backoff
raceWithTimeout(promise, timeoutMs); // Promise racing
```

**The Pattern:**

```javascript
// Clean Promise wrap of setTimeout
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Usage
await delay(1000);
console.log("1 second passed");
```

**Retry with Exponential Backoff:**

```javascript
async function retryWithDelay(asyncFn, maxRetries = 3, initialDelay = 100) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms...
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        await delay(exponentialDelay);
      }
    }
  }

  throw lastError;
}
```

**Interview Talking Points:**

1. "Promise constructor takes (resolve, reject) callback"
2. "setTimeout is wrapped inside Promise"
3. "Exponential backoff: delay \* 2^attempt"
4. "AbortSignal integration for cancellation"
5. "Use case: API retries on failure"

---

## 🏛️ ROUND 2: TECH LEAD DISCUSSION

### Concept 1: Event Loop & Async Execution

**File:** `05-eventLoop.js`

**The Foundation - 5 Components:**

```
┌─────────────────────┐
│   CALL STACK        │  ← Where code executes (LIFO)
│   (Synchronous)     │  ← function calls
└─────────────────────┘
        ↓
┌─────────────────────┐
│   WEB APIs          │  ← Browser async tasks
│ (setTimeout, etc)   │  ← Delegate here
└─────────────────────┘
        ↓
┌──────────────────────────────┐
│   MICROTASK QUEUE            │  ← Promises (HIGH PRIORITY!)
│   (queueMicrotask, async)    │
└──────────────────────────────┘
        ↓
┌──────────────────────────────┐
│   MACROTASK QUEUE            │  ← setTimeout, I/O
│   (setTimeout, setInterval)  │  ← Executed one at a time
└──────────────────────────────┘
```

**Execution Priority (Most Important!):**

```
1. Execute ALL synchronous code (Call Stack)
2. Execute ALL Microtasks (empty entire queue)
3. Execute ONE Macrotask
4. Go back to step 2
```

**Real Example - Predict Output:**

```javascript
console.log("1"); // ← Sync

setTimeout(() => console.log("2"), 0); // ← Macrotask

Promise.resolve()
  .then(() => console.log("3")) // ← Microtask
  .then(() => console.log("4")); // ← Microtask

console.log("5"); // ← Sync

// Output: 1 → 5 → 3 → 4 → 2
//
// WHY:
// 1,5 = Synchronous (Call Stack)
// 3,4 = Promises (Microtask - runs BEFORE setTimeout!)
// 2 = setTimeout (Macrotask - runs LAST)
```

**Complex Example:**

```javascript
console.log("A");

setTimeout(() => {
  console.log("B");
  Promise.resolve().then(() => console.log("C"));
}, 0);

Promise.resolve()
  .then(() => {
    console.log("D");
    setTimeout(() => console.log("E"), 0);
  })
  .then(() => console.log("F"));

console.log("G");

// Output: A → G → D → F → B → C → E
//
// Timeline:
// Call Stack: A, G
// Microtask: D, F (all promises first!)
// Macrotask 1: B
// Microtask (in B): C
// Macrotask 2: E
```

**Interview Script:**
"The Event Loop continuously checks if the Call Stack is empty. When empty, it processes ALL Microtasks (Promises), then ONE Macrotask (setTimeout), then repeats. Microtasks have priority because they're part of the Promise/async specification."

---

### Concept 2: React Performance Optimization

**File:** `06-reactPerformance.js`

**Pattern 1: React.memo - Prevent Component Re-renders**

```javascript
const MemoizedComponent = memo(({ data }) => {
  console.log("Rendering"); // Only logs if props change
  return <h1>{data.title}</h1>;
});
```

**Pattern 2: useCallback - Memoize Functions**

```javascript
// Problem: function recreated every render, causing child re-render
function Parent() {
  const handleClick = () => setCount((c) => c + 1);
  return <MemoizedChild onClick={handleClick} />;
}

// Solution: useCallback
function Parent() {
  const handleClick = useCallback(
    () => setCount((c) => c + 1),
    [], // Dependencies - recreate only if deps change
  );
  return <MemoizedChild onClick={handleClick} />;
}
```

**Pattern 3: useMemo - Memoize Calculations**

```javascript
function ExpensiveComponent() {
  const [items, setItems] = useState([...]);

  // Without useMemo: calculation runs every render
  // With useMemo: only runs when dependencies change
  const processedItems = useMemo(() => {
    console.log("Computing...");
    return items
      .filter(item => item.active)
      .map(item => ({ ...item, processed: true }));
  }, [items]); // Recalculate only if items changes

  return <div>{processedItems.length}</div>;
}
```

**Pattern 4: Code Splitting with React.lazy**

```javascript
const HeavyComponent = lazy(() => import("./HeavyComponent"));

export function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}
```

**Performance Checklist:**

```
✓ Use React.memo for presentational components
✓ Use useCallback for event handlers
✓ Use useMemo for expensive computations
✓ Memoize objects/arrays passed as props
✓ Code split with React.lazy + Suspense
✓ Virtual scrolling for long lists
✓ Use keys correctly in lists
✓ Profile with React DevTools
✓ Measure before optimizing
```

**Interview Talking Points:**

1. "React.memo prevents re-renders if props don't change"
2. "useCallback creates stable function reference"
3. "useMemo caches computation result"
4. "Code splitting reduces initial bundle size"
5. "React DevTools Profiler identifies slow components"

---

### Concept 3: Managing Large-Scale API Calls

**File:** `07-apiManagement.js`

**Architecture Pattern:**

```
Layer 1: Basic Client
  ├─ Centralized fetch instance
  ├─ Base URL configuration
  └─ Error handling

Layer 2: Caching
  ├─ Response caching per endpoint
  ├─ TTL (Time-To-Live)
  └─ Manual invalidation

Layer 3: Request Management
  ├─ Deduplication (prevent duplicate requests)
  ├─ Retry with exponential backoff
  └─ Timeout handling

Layer 4: Authentication
  ├─ Auto-inject auth tokens
  ├─ Refresh on 401
  └─ Queue during refresh

Layer 5: Batch Operations
  ├─ Combine multiple requests
  └─ Reduce network overhead
```

**Deduplication Pattern:**

```javascript
class DedupedApiClient extends ApiClient {
  constructor(baseURL) {
    super(baseURL);
    this.pendingRequests = new Map();
  }

  async request(method, endpoint, options) {
    const requestKey = `${method}:${endpoint}`;

    // If already pending, return same promise
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    // Create new request and store
    const promise = super.request(method, endpoint, options);
    this.pendingRequests.set(requestKey, promise);

    try {
      return await promise;
    } finally {
      // Clean up when done
      this.pendingRequests.delete(requestKey);
    }
  }
}
```

**Retry Logic:**

```javascript
async request(method, endpoint, options) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(...);
    } catch (error) {
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms → 200ms → 400ms
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
}
```

**Interview Talking Points:**

1. "Centralize all API calls for consistent handling"
2. "Cache GET requests with TTL"
3. "Deduplicate simultaneous identical requests"
4. "Retry with exponential backoff on failure"
5. "Auto-inject auth tokens via interceptors"
6. "Handle 401 with token refresh"
7. "Use AbortController to cancel stale requests"

---

## 🎓 MASTER INTERVIEW CHECKLIST

### Before the Interview

- [ ] Practice each concept 3-5 times
- [ ] Time yourself (15-20 min per concept)
- [ ] Explain each without looking at code
- [ ] Code from scratch without copy-paste

### During Technical Coding Round

- [ ] Ask clarifying questions first
- [ ] Explain approach before coding
- [ ] Start simple, then optimize
- [ ] Test edge cases
- [ ] Discuss time/space complexity
- [ ] Show clean code practices

### During Tech Lead Discussion

- [ ] Draw diagrams (especially Event Loop)
- [ ] Mention all key components
- [ ] Explain microtask vs macrotask priority
- [ ] Discuss actionable optimization strategies
- [ ] Show understanding of trade-offs
- [ ] Mention measurement tools

### Code Quality Standards

- [ ] Clear variable names
- [ ] Comments for complex logic only
- [ ] Proper error handling
- [ ] Follows JS conventions
- [ ] No console.log left behind

---

## 📊 Quick Reference

### Time Complexities

```
Flatten Arrays       O(n) time, O(depth) space
Group by Reduce     O(n) time, O(n) space
Debounce            O(1) per call, O(1) space
First Non-Rep       O(n) time, O(k) space (vs O(n²) naive)
Promise Delay       O(1) time, O(1) space
API Management      Variable by layer
React Optimization  Component dependent
```

### Common Mistakes to Avoid

```
✗ Forgetting to clear timeout in debounce
✗ Using object/array literals in JSX props
✗ Optimizing without measuring first
✗ Forgetting AbortController cleanup
✗ Not handling promise rejection
✗ Incorrect Event Loop priority understanding
✗ Using array index as React key
✗ Blocking UI with long computations
```

---

## 🚀 Practice Exercises

1. **Modify debounce to support trailing only** (no leading)
2. **Implement throttle** (opposite of debounce)
3. **Create useDebounce React hook** (already done!)
4. **Implement queue data structure** for batch requests
5. **Predict Event Loop output** for complex scenarios
6. **Design cache invalidation strategy**
7. **Implement rate limiting** for API calls
8. **Create request timeout handler**

---

Good luck! You've got this! 🎯
