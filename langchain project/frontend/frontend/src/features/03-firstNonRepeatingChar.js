/**
 * First Non-Repeating Character
 * Classic algorithmic efficiency check using Hash Map
 * Optimal: O(n) time complexity with single pass Hash Map approach
 * vs Naive: O(n²) with nested loops
 */

/**
 * Find the first non-repeating character in a string using Hash Map
 * Time Complexity: O(n) - two passes through the string
 * Space Complexity: O(k) where k is the alphabet size (usually constant)
 *
 * @param {string} str - Input string to search
 * @returns {string|null} First non-repeating character or null if all repeat
 *
 * @example
 * firstNonRepeatingChar("hello") => "h"
 * firstNonRepeatingChar("aabbcc") => null
 * firstNonRepeatingChar("swiss") => "w"
 */
export function firstNonRepeatingChar(str) {
  // First pass: count occurrences of each character
  const charCount = {};
  for (const char of str) {
    charCount[char] = (charCount[char] || 0) + 1;
  }

  // Second pass: find first character with count of 1
  for (const char of str) {
    if (charCount[char] === 1) {
      return char;
    }
  }

  return null;
}

/**
 * Using Map instead of object for better practice with mixed key types
 * @param {string} str - Input string
 * @returns {string|null} First non-repeating character or null
 */
export function firstNonRepeatingCharMap(str) {
  const charCount = new Map();

  for (const char of str) {
    charCount.set(char, (charCount.get(char) || 0) + 1);
  }

  for (const char of str) {
    if (charCount.get(char) === 1) {
      return char;
    }
  }

  return null;
}

/**
 * One-liner using reduce (functionally pure but harder to read)
 * @param {string} str - Input string
 * @returns {string|null} First non-repeating character or null
 */
export function firstNonRepeatingCharFunctional(str) {
  const counts = [...str].reduce((acc, char) => {
    acc[char] = (acc[char] || 0) + 1;
    return acc;
  }, {});

  return [...str].find((char) => counts[char] === 1) || null;
}

/**
 * Case-insensitive version - treats 'A' and 'a' as the same
 * @param {string} str - Input string
 * @returns {string|null} First non-repeating character (preserves original case)
 *
 * @example
 * firstNonRepeatingCharCaseInsensitive("AaBbCc") => "A"
 */
export function firstNonRepeatingCharCaseInsensitive(str) {
  const charCount = {};
  const lowerStr = str.toLowerCase();

  for (let i = 0; i < str.length; i++) {
    const lowerChar = lowerStr[i];
    charCount[lowerChar] = (charCount[lowerChar] || 0) + 1;
  }

  for (let i = 0; i < str.length; i++) {
    if (charCount[lowerStr[i]] === 1) {
      return str[i];
    }
  }

  return null;
}

/**
 * Extended version: find first non-repeating character, ignoring spaces and punctuation
 * @param {string} str - Input string
 * @param {RegExp} ignorePattern - Pattern of characters to ignore (default: /[^a-z0-9]/i)
 * @returns {string|null} First non-repeating alphanumeric character
 *
 * @example
 * firstNonRepeatingCharFiltered("Hello, World!") => "e"
 */
export function firstNonRepeatingCharFiltered(
  str,
  ignorePattern = /[^a-z0-9]/i,
) {
  const cleaned = str.replace(ignorePattern, "").toLowerCase();
  return firstNonRepeatingCharMap(cleaned);
}

// ============================================
// NAIVE O(n²) SOLUTION (for comparison)
// ============================================

/**
 * Naive approach using nested loops - DON'T use this in production
 * Time Complexity: O(n²) - for each character, scan entire string
 * Only shown for educational comparison
 *
 * @param {string} str - Input string
 * @returns {string|null} First non-repeating character or null
 */
export function firstNonRepeatingCharNaive(str) {
  for (let i = 0; i < str.length; i++) {
    let isUnique = true;
    for (let j = 0; j < str.length; j++) {
      if (i !== j && str[i] === str[j]) {
        isUnique = false;
        break;
      }
    }
    if (isUnique) {
      return str[i];
    }
  }
  return null;
}
