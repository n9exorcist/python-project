/**
 * COMPREHENSIVE TEST SUITE
 * Tests for all implemented concepts
 * Run with: node tests.js or use Jest: jest tests.js
 */

// Import all functions
import {
  flattenArray,
  flattenArrayDepth,
  groupByReduce,
  groupByMultiple,
} from "./01-flattenArray.js";
import { debounce, debounceAdvanced } from "./02-debounce.js";
import {
  firstNonRepeatingChar,
  firstNonRepeatingCharCaseInsensitive,
  firstNonRepeatingCharNaive,
} from "./03-firstNonRepeatingChar.js";
import {
  delay,
  delayCancellable,
  delayWithValue,
  retryWithDelay,
  raceWithTimeout,
} from "./04-promiseDelay.js";

// ============================================
// TEST UTILITIES
// ============================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================
// FLATTEN ARRAY TESTS
// ============================================

console.log("\n=== FLATTEN ARRAY TESTS ===\n");

const flatTest1 = flattenArray([1, [2, [3, [4]]]]);
assert(deepEqual(flatTest1, [1, 2, 3, 4]), "flattenArray: deeply nested");

const flatTest2 = flattenArray([1, [2, 3], [[4, 5], 6]]);
assert(deepEqual(flatTest2, [1, 2, 3, 4, 5, 6]), "flattenArray: mixed nesting");

const flatTest3 = flattenArray([1, 2, 3]);
assert(deepEqual(flatTest3, [1, 2, 3]), "flattenArray: already flat");

const depthTest1 = flattenArrayDepth([1, [2, [3, [4]]]], 1);
assert(deepEqual(depthTest1, [1, 2, [3, [4]]]), "flattenArrayDepth: depth=1");

const depthTest2 = flattenArrayDepth([1, [2, [3, [4]]]], 2);
assert(deepEqual(depthTest2, [1, 2, 3, [4]]), "flattenArrayDepth: depth=2");

// ============================================
// GROUP BY REDUCE TESTS
// ============================================

console.log("\n=== GROUP BY REDUCE TESTS ===\n");

const groupTest1 = groupByReduce([1, 2, 3, 4, 5, 6], (n) =>
  n % 2 === 0 ? "even" : "odd",
);
assert(
  deepEqual(groupTest1, { odd: [1, 3, 5], even: [2, 4, 6] }),
  "groupByReduce: even/odd",
);

const groupTest2 = groupByReduce(
  ["apple", "apricot", "banana", "berry"],
  (w) => w[0],
);
assert(
  deepEqual(groupTest2, {
    a: ["apple", "apricot"],
    b: ["banana", "berry"],
  }),
  "groupByReduce: by first letter",
);

const groupTest3 = groupByMultiple(
  [
    { age: 25, name: "Alice" },
    { age: 25, name: "Bob" },
    { age: 30, name: "Charlie" },
  ],
  "age",
);
assert(
  groupTest3[25].length === 2 && groupTest3[30].length === 1,
  "groupByMultiple: by property",
);

// ============================================
// DEBOUNCE TESTS
// ============================================

console.log("\n=== DEBOUNCE TESTS ===\n");

await new Promise((resolve) => {
  let callCount = 0;
  const debouncedFunc = debounce(() => {
    callCount++;
  }, 100);

  // Call multiple times rapidly
  debouncedFunc();
  debouncedFunc();
  debouncedFunc();

  setTimeout(() => {
    assert(
      callCount === 1,
      "debounce: should only call once after multiple rapid calls",
    );
    resolve();
  }, 150);
});

await new Promise((resolve) => {
  let callCount = 0;
  const debouncedFunc = debounce(() => {
    callCount++;
  }, 100);

  debouncedFunc();
  setTimeout(() => debouncedFunc(), 50);
  setTimeout(() => debouncedFunc(), 100);

  setTimeout(() => {
    assert(callCount === 1, "debounce: timer resets on new call");
    resolve();
  }, 250);
});

await new Promise((resolve) => {
  let callCount = 0;
  const debouncedFunc = debounce(() => {
    callCount++;
  }, 100);

  debouncedFunc();
  debouncedFunc.cancel();
  setTimeout(() => {
    assert(callCount === 0, "debounce: cancel should prevent execution");
    resolve();
  }, 150);
});

// ============================================
// FIRST NON-REPEATING CHARACTER TESTS
// ============================================

console.log("\n=== FIRST NON-REPEATING CHARACTER TESTS ===\n");

assert(
  firstNonRepeatingChar("hello") === "h",
  "firstNonRepeatingChar: 'hello' => 'h'",
);

assert(
  firstNonRepeatingChar("aabbcc") === null,
  "firstNonRepeatingChar: all repeating => null",
);

assert(
  firstNonRepeatingChar("swiss") === "w",
  "firstNonRepeatingChar: 'swiss' => 'w'",
);

assert(
  firstNonRepeatingChar("") === null,
  "firstNonRepeatingChar: empty string => null",
);

assert(
  firstNonRepeatingChar("a") === "a",
  "firstNonRepeatingChar: single character",
);

assert(
  firstNonRepeatingCharCaseInsensitive("AaBbCc") === "A",
  "firstNonRepeatingCharCaseInsensitive: case-insensitive",
);

// Verify O(n) is faster than O(n²) for large strings
const largeString = "a".repeat(100) + "b" + "c".repeat(100);
const start1 = Date.now();
firstNonRepeatingChar(largeString);
const time1 = Date.now() - start1;

const start2 = Date.now();
firstNonRepeatingCharNaive(largeString);
const time2 = Date.now() - start2;

assert(
  time1 <= time2,
  `firstNonRepeatingChar performance: O(n)=${time1}ms vs O(n²)=${time2}ms`,
);

// ============================================
// PROMISE DELAY TESTS
// ============================================

console.log("\n=== PROMISE DELAY TESTS ===\n");

await new Promise((resolve) => {
  const start = Date.now();
  delay(100).then(() => {
    const duration = Date.now() - start;
    assert(
      duration >= 90 && duration <= 150,
      `delay: should wait approximately 100ms (actual: ${duration}ms)`,
    );
    resolve();
  });
});

const result = await delayWithValue(50, "test_value");
assert(result === "test_value", "delayWithValue: returns provided value");

await new Promise((resolve) => {
  const controller = new AbortController();
  const promise = delayCancellable(1000, controller.signal);

  setTimeout(() => controller.abort(), 50);

  promise
    .then(() => {
      assert(false, "delayCancellable: should not resolve");
      resolve();
    })
    .catch(() => {
      assert(true, "delayCancellable: cancelled before completion");
      resolve();
    });
});

await new Promise((resolve) => {
  let attempts = 0;
  const failingFunc = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error("Temporary failure");
    }
    return "success";
  };

  retryWithDelay(failingFunc, 3, 50)
    .then((result) => {
      assert(
        result === "success" && attempts === 3,
        "retryWithDelay: retries and succeeds",
      );
      resolve();
    })
    .catch(() => {
      assert(false, "retryWithDelay: should succeed on retry");
      resolve();
    });
});

// ============================================
// EVENT LOOP DEMONSTRATION
// ============================================

console.log("\n=== EVENT LOOP CONCEPT TEST ===\n");

await new Promise((resolve) => {
  const output = [];

  output.push("1. Sync");

  Promise.resolve()
    .then(() => output.push("2. Microtask"))
    .then(() => output.push("3. Microtask"));

  setTimeout(() => output.push("4. Macrotask"), 0);

  output.push("5. Sync");

  setTimeout(() => {
    const expected = [
      "1. Sync",
      "5. Sync",
      "2. Microtask",
      "3. Microtask",
      "4. Macrotask",
    ];
    assert(
      deepEqual(output, expected),
      `Event Loop: Microtasks execute before Macrotasks: ${output.join(" -> ")}`,
    );
    resolve();
  }, 100);
});

// ============================================
// TEST SUMMARY
// ============================================

console.log("\n╔══════════════════════════════════════╗");
console.log("║          TEST SUMMARY                ║");
console.log("╚══════════════════════════════════════╝");
console.log(`✓ Passed: ${testsPassed}`);
console.log(`✗ Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log("🎉 All tests passed!");
} else {
  console.log(`⚠️ ${testsFailed} test(s) failed`);
  process.exit(1);
}
