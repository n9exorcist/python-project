// ── Q1: Garbage Collection (simulated — no DOM in Node) ──
console.log("=== Q1: Garbage Collection ===");
let obj1 = { name: "test data" };
obj1 = null; // now eligible for GC
console.log("obj1 set to null — GC will clean it up");

// ── Q2: Generator Functions ──
console.log("\n=== Q2: Generator Functions ===");
function* idGenerator() {
  let id = 1;
  while (true) yield id++;
}
const gen = idGenerator();
console.log(gen.next().value); // 1
console.log(gen.next().value); // 2
console.log(gen.next().value); // 3

// ── Q3: Shallow vs Deep Copy ──
console.log("\n=== Q3: Shallow vs Deep Copy ===");
const obj = { a: 1, nested: { b: 2 } };

const shallow = { ...obj };
shallow.nested.b = 99;
console.log("Original after shallow copy mutation:", obj.nested.b); // 99 — mutated!

const deep = structuredClone(obj);
deep.nested.b = 999;
console.log("Original after deep copy mutation:", obj.nested.b); // still 99 — safe

// ── Q4: Flatten Nested Array ──
console.log("\n=== Q4: Flatten Array ===");
const arr2 = [1, [2, [3, [4]]]];
console.log(arr2.flat(Infinity)); // [1, 2, 3, 4]

function flatten(arr) {
  return arr.reduce(
    (acc, val) =>
      Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val),
    [],
  );
}

const arr = [1, [2, [3, [4]]]];
console.log(flatten(arr)); // [1, 2, 3, 4]

// ── Q5: Group By Property ──
console.log("\n=== Q5: Group By ===");
const orders = [
  { id: 1, status: "pending" },
  { id: 2, status: "done" },
  { id: 3, status: "pending" },
];
const grouped = orders.reduce((acc, o) => {
  (acc[o.status] ??= []).push(o);
  return acc;
}, {});
console.log(grouped);
