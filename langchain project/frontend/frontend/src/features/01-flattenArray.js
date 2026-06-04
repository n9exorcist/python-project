/**
 * Flatten Arrays using Reduce
 * Time Complexity: O(n) where n is total number of elements
 * Tests recursive logic and functional programming
 */

/**
 * Recursively flattens a nested array to any depth
 * @param {Array} arr - The array to flatten
 * @returns {Array} Flattened array
 *
 * @example
 * flattenArray([1, [2, [3, [4]]]]) => [1, 2, 3, 4]
 * flattenArray([1, [2, 3], [[4, 5], 6]]) => [1, 2, 3, 4, 5, 6]
 */
export function flattenArray(arr) {
  return arr.reduce((flat, item) => {
    return flat.concat(Array.isArray(item) ? flattenArray(item) : item);
  }, []);
}

/**
 * Flatten to a specific depth using reduce
 * @param {Array} arr - The array to flatten
 * @param {number} depth - How many levels deep to flatten (default: Infinity)
 * @returns {Array} Flattened array
 *
 * @example
 * flattenArrayDepth([1, [2, [3, [4]]]], 2) => [1, 2, 3, [4]]
 * flattenArrayDepth([1, [2, [3, [4]]]], 1) => [1, 2, [3, [4]]]
 */
export function flattenArrayDepth(arr, depth = Infinity) {
  if (depth === 0) return arr;

  return arr.reduce((flat, item) => {
    return flat.concat(
      Array.isArray(item) ? flattenArrayDepth(item, depth - 1) : item,
    );
  }, []);
}

/**
 * Group array elements by a reducer function using reduce
 * @param {Array} arr - The array to group
 * @param {Function} fn - Function that returns the group key for each item
 * @returns {Object} Object with grouped items
 *
 * @example
 * groupByReduce([1, 2, 3, 4, 5, 6], num => num % 2 === 0 ? 'even' : 'odd')
 * => { odd: [1, 3, 5], even: [2, 4, 6] }
 */
export function groupByReduce(arr, fn) {
  return arr.reduce((groups, item) => {
    const key = fn(item);
    return {
      ...groups,
      [key]: [...(groups[key] || []), item],
    };
  }, {});
}

/**
 * Advanced grouping with reduce - group objects by multiple properties
 * @param {Array} arr - Array of objects to group
 * @param {string|Function} keyFn - Property name or function returning the group key
 * @returns {Object} Object with grouped items
 *
 * @example
 * groupByMultiple([
 *   { age: 25, name: 'Alice' },
 *   { age: 25, name: 'Bob' },
 *   { age: 30, name: 'Charlie' }
 * ], 'age')
 * => { 25: [{age: 25, name: 'Alice'}, {age: 25, name: 'Bob'}], 30: [{...}] }
 */
export function groupByMultiple(arr, keyFn) {
  return arr.reduce((groups, item) => {
    const key = typeof keyFn === "function" ? keyFn(item) : item[keyFn];
    return {
      ...groups,
      [key]: [...(groups[key] || []), item],
    };
  }, {});
}
