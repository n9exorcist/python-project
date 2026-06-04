/**
 * REACT PERFORMANCE OPTIMIZATION STRATEGIES
 * Advanced patterns for preventing unnecessary re-renders and optimizing performance
 */

import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  lazy,
  Suspense,
} from "react";

/**
 * 1. React.memo - Prevent re-renders of functional components
 * Memoizes component and only re-renders if props change
 */
export const MemoizedComponent = memo(({ data, onUpdate }) => {
  console.log("MemoizedComponent rendering");
  return (
    <div>
      <h3>{data.title}</h3>
      <button onClick={() => onUpdate(data.id)}>Update</button>
    </div>
  );
});

MemoizedComponent.displayName = "MemoizedComponent";

/**
 * 2. useCallback - Memoize callback functions
 * Prevents child components from re-rendering due to new function references
 * Only recreates function when dependencies change
 */
export function ParentWithCallback() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("User");

  // Without useCallback, this function gets recreated on every render
  // causing child components to think props have changed
  const handleIncrement = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []); // Empty deps = function never recreated

  const handleNameChange = useCallback((newName) => {
    setName(newName);
  }, []); // No dependencies needed

  return (
    <div>
      <p>Count: {count}</p>
      <p>Name: {name}</p>
      {/* These memoized children only re-render if their props actually change */}
      <MemoizedButton onClick={handleIncrement} label="Increment" />
      <MemoizedInput onChange={handleNameChange} placeholder="Enter name" />
    </div>
  );
}

const MemoizedButton = memo(({ onClick, label }) => {
  console.log(`Rendering button: ${label}`);
  return <button onClick={onClick}>{label}</button>;
});

const MemoizedInput = memo(({ onChange, placeholder }) => {
  console.log("Rendering input");
  return (
    <input
      type="text"
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});

/**
 * 3. useMemo - Memoize expensive computations
 * Only recalculates when dependencies change
 * Prevents expensive operations from running on every render
 */
export function ExpensiveCalculationComponent() {
  const [items, setItems] = useState([1, 2, 3, 4, 5]);
  const [multiplier, setMultiplier] = useState(1);

  // Without useMemo, this calculation runs every render
  // With useMemo, it only runs when items or multiplier changes
  const expensiveResult = useMemo(() => {
    console.log("Running expensive calculation...");
    // Simulate expensive computation
    return items.reduce((sum, item) => {
      // Simulate heavy processing
      for (let i = 0; i < 100000000; i++) {}
      return sum + item * multiplier;
    }, 0);
  }, [items, multiplier]); // Only recalculate when these dependencies change

  return (
    <div>
      <p>Result: {expensiveResult}</p>
      <button onClick={() => setMultiplier((m) => m + 1)}>
        Multiply (x{multiplier})
      </button>
      <button onClick={() => setItems([...items, Math.random()])}>
        Add Item
      </button>
    </div>
  );
}

/**
 * 4. Object/Array memoization to prevent cascading re-renders
 * Stable references for objects and arrays passed as props
 */
export function MemoizedObjectComponent() {
  const [filter, setFilter] = useState("active");

  // Without useMemo, this object is recreated every render
  // causing child components to think it's a new prop
  const config = useMemo(
    () => ({
      theme: "dark",
      language: "en",
      filter,
    }),
    [filter],
  );

  const items = useMemo(() => [1, 2, 3, 4, 5], []);

  return (
    <div>
      <MemoizedChild config={config} items={items} />
    </div>
  );
}

const MemoizedChild = memo(({ config, items }) => {
  console.log("MemoizedChild rendering with config:", config);
  return (
    <div>
      <p>Theme: {config.theme}</p>
      <p>Items: {items.join(", ")}</p>
    </div>
  );
});

/**
 * 5. Code Splitting with React.lazy and Suspense
 * Load components only when needed (reduces initial bundle size)
 */
const HeavyComponent = lazy(() => import("./HeavyComponent"));
const DashboardComponent = lazy(() => import("./DashboardComponent"));

export function CodeSplittingExample() {
  const [view, setView] = useState("home");

  return (
    <div>
      <button onClick={() => setView("home")}>Home</button>
      <button onClick={() => setView("heavy")}>Heavy Component</button>
      <button onClick={() => setView("dashboard")}>Dashboard</button>

      <Suspense fallback={<div>Loading...</div>}>
        {view === "home" && <h1>Home View</h1>}
        {view === "heavy" && <HeavyComponent />}
        {view === "dashboard" && <DashboardComponent />}
      </Suspense>
    </div>
  );
}

/**
 * 6. Virtual Scrolling for Long Lists (using external library pattern)
 * Only renders visible items, dramatically improving performance
 * In real implementation, use react-window or react-virtualized
 */
export function VirtualScrollingPattern() {
  const items = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    text: `Item ${i}`,
  }));

  // Simple virtual scroll simulation
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeight = 35;
  const visibleCount = 20;
  const startIndex = Math.floor(scrollTop / itemHeight);
  const visibleItems = items.slice(startIndex, startIndex + visibleCount);

  return (
    <div
      style={{
        height: "700px",
        overflow: "auto",
        onScroll: (e) => setScrollTop(e.currentTarget.scrollTop),
      }}
    >
      <div style={{ height: items.length * itemHeight }}>
        <div style={{ transform: `translateY(${startIndex * itemHeight}px)` }}>
          {visibleItems.map((item) => (
            <div key={item.id} style={{ height: itemHeight }}>
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 7. useRef for non-rerendering state and storing dom refs
 * Useful for tracking values that don't need to trigger re-renders
 */
export function RefOptimizationExample() {
  const [count, setCount] = useState(0);
  const renderCount = useRef(0);
  const previousValue = useRef(count);

  // This updates without triggering a re-render
  renderCount.current++;

  // Update ref after render
  previousValue.current = count;

  return (
    <div>
      <p>Count: {count}</p>
      <p>Renders: {renderCount.current}</p>
      <p>Previous Value: {previousValue.current}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}

/**
 * 8. Conditional rendering to avoid rendering unnecessary content
 * Load content on demand
 */
export function ConditionalRenderingOptimization() {
  const [showDetails, setShowDetails] = useState(false);
  const [showLargeList, setShowLargeList] = useState(false);

  return (
    <div>
      <button onClick={() => setShowDetails(!showDetails)}>
        Toggle Details
      </button>

      {/* Only render when needed */}
      {showDetails && <ExpensiveDetails />}

      <button onClick={() => setShowLargeList(!showLargeList)}>
        Toggle Large List
      </button>

      {showLargeList && <LargeList />}
    </div>
  );
}

function ExpensiveDetails() {
  console.log("Rendering ExpensiveDetails");
  return <div>This is expensive to render</div>;
}

function LargeList() {
  const items = Array.from({ length: 1000 }, (_, i) => i);
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * 9. Performance monitoring with useRef for timing
 */
export function PerformanceMonitoring() {
  const [data, setData] = useState([]);
  const renderStartTime = useRef(Date.now());

  return (
    <div>
      <p>Data: {data.length} items</p>
      <p>Render time: {Date.now() - renderStartTime.current}ms</p>
    </div>
  );
}

/**
 * OPTIMIZATION CHECKLIST
 *
 * ✓ Use React.memo for presentational components
 * ✓ Use useCallback for event handlers passed as props
 * ✓ Use useMemo for expensive computations
 * ✓ Memoize objects and arrays passed as props (with useMemo)
 * ✓ Use React.lazy + Suspense for code splitting
 * ✓ Implement virtual scrolling for large lists (react-window)
 * ✓ Use keys correctly in lists
 * ✓ Split large components into smaller ones
 * ✓ Avoid inline object/array creation in render
 * ✓ Use Production build for testing performance
 * ✓ Profile with React DevTools Profiler
 * ✓ Consider Concurrent Features (startTransition, useTransition)
 */

export const performanceOptimizationGuide = `
╔══════════════════════════════════════════════════════════════╗
║      REACT PERFORMANCE OPTIMIZATION STRATEGIES               ║
╚══════════════════════════════════════════════════════════════╝

1. PREVENTING RE-RENDERS
   ├─ React.memo() - Memoize components
   ├─ useCallback() - Memoize functions
   ├─ useMemo() - Memoize expensive calculations
   └─ useRef() - Track values without re-renders

2. CODE SPLITTING
   ├─ React.lazy() - Load components on demand
   ├─ Suspense - Show fallback while loading
   └─ Dynamic imports - Split bundle by route

3. LIST OPTIMIZATION
   ├─ Virtual scrolling (react-window, react-virtualized)
   ├─ Proper keys (don't use array index)
   └─ useTransition for non-blocking updates

4. BUNDLING OPTIMIZATION
   ├─ Tree shaking - Remove unused code
   ├─ Dynamic imports - Load routes lazily
   └─ Production builds - Use build optimization

5. ADVANCED PATTERNS
   ├─ useTransition - Mark updates as non-urgent
   ├─ startTransition - Batch state updates
   ├─ useDeferredValue - Defer state updates
   └─ Suspense for data fetching - Boundary handling

WHEN TO OPTIMIZE:
✓ When profiling shows actual performance issues
✓ When rendering large lists (>100 items)
✓ When components have expensive calculations
✗ Don't optimize prematurely without measurement

MEASUREMENT TOOLS:
- React DevTools Profiler (built-in)
- Chrome DevTools Performance tab
- Lighthouse
- Web Vitals (LCP, FID, CLS)
`;
