// Array destructuring
let numbers = [1, 2, 3, 4, 5];
let [a, b, c] = numbers; // Destructuring the first three elements of the array

console.log(`a : ${a}, b : ${b}, c : ${c}`); // Output: a : 1, b : 2, c : 3

//skipping elements in array destructuring

let [first, , , , last] = numbers; // Destructuring the first and last elements of the array
console.log(`first : ${first}, last : ${last}`); // Output: first : 1, last : 5

// default values in array destructuring
let [m = 20, n = 30, o = 40] = [10]; // Destructuring with default values
console.log(`m : ${m}, n : ${n}, o : ${o}`); // Output: m : 10, n : 30, o : 40

// rest operator -> collects the remaining elements into an array
let arr1 = [14, 15, 16, 17, 18];
let [start, ...rest] = arr1;
console.log(`start : ${start}, rest : ${rest}`); // Output: start : 14, rest : 15,16,17,18
console.log(rest); // Output: [15, 16, 17, 18]

// Object destructuring
let user = {
  name: "Alice",
  age: 25,
  city: "New York",
};
let { name, age, city } = user;
console.log(`name : ${name}, age : ${age}, city : ${city}`); // Output: name : Alice, age : 25, city : New York

let user2 = {
  name2: "Bob",
  age: 30,
  city: "Los Angeles",
};

let { name2, ...restDetails } = user2; // Destructuring with renaming
console.log(`name2 : ${name2}, restDetails : ${JSON.stringify(restDetails)}`); // Output: name2 : Bob, restDetails : {"age":30,"city":"Los Angeles"}

let admin = { adminId: 101, address: { citie: "San Francisco" } };
let {
  adminId,
  address: { citie },
} = admin; // Nested object destructuring
console.log(`adminId : ${adminId}, city : ${citie}`); // Output: adminId : 101, city : San Francisco

// Spread Operator in object destructuring

// expanding the properties of an object into a new object/Object cloning
// shallow copy -> only the top-level properties are copied, nested objects are still referenced
let arr3 = [1, 2, 3];

let arr4 = [...arr3]; // Cloning the array using spread operator
arr4.push(4); // Modifying arr4 does not affect arr3

console.log(arr4); // Output: [1, 2, 3, 4]
console.log(arr3); // Output: [1, 2, 3]

let arr5 = [...arr4, 5, 6]; // Creating a new array by combining arr4 with additional elements
let arr6 = [7, 8, 9];
let combinedArr = [...arr5, ...arr6]; // Combining arr5 and arr6 into a new array using spread operator
console.log(arr5); // Output: [1, 2, 3, 4, 5, 6]
console.log(combinedArr); // Output: [1, 2, 3, 4, 5, 6, 7, 8, 9]

// Spread operator in object cloning
let obj1 = { a: 1, b: 2 };
let obj2 = { ...obj1 }; // Cloning the object using spread operator
obj2.c = 3; // Modifying obj2 does not affect obj1
console.log(obj2); // Output: { a: 1, b: 2, c: 3 }
console.log(obj1); // Output: { a: 1, b: 2 }

// Merging objects using spread operator
let obj3 = { x: 10, y: 20 };
let obj4 = { z: 30, w: 40 };
let mergedObj = { ...obj3, ...obj4 };
console.log(mergedObj); // Output: { x: 10, y: 20, z: 30, w: 40 }

// pass array as arguments to a function using spread operator
function sum(a, b, c) {
  return a + b + c;
}

let nums = [5, 10, 15];
console.log(sum(...nums)); // Output: 30

// string >> array

let str = "Hello";
let chars = [...str]; // Using spread operator to convert a string into an array of characters
console.log(chars); // Output: ['H', 'e', 'l', 'l', 'o']
