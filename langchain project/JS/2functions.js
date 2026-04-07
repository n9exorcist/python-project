// defining a function
function userDetails(username, age) {
  return `Username: ${username}, Age: ${age}`;
}

console.log(userDetails("JohnDoe", 30)); // Output: Username: JohnDoe, Age: 30

// Function with return statement
function calculateArea(radius) {
  return Math.PI * radius * radius;
}
console.log(calculateArea(5)); // Output: 78.53981633974483

// Function expression

let greeting = function (name) {
  return `Hello, ${name}!`;
};
console.log(greeting("Alice")); // Output: Hello, Alice!

// Arrow function
let add = (a, b) => a + b;
console.log(add(5, 3)); // Output: 8

let cube = (num) => console.log(`The cube of ${num} is ${num * num * num}`);
cube(3); // Output: The cube of 3 is 27

// Function with default parameters
function greet(name = "Guest") {
  return `Hello, ${name}!`;
}

console.log(greet()); // Output: Hello, Guest!
console.log(greet("Bob")); // Output: Hello, Bob!

//Hoisting of function declarations

// var - declation is hoisted but not initialization

// declaration of 'x' is hoisted to the top, but its initialization is not, so it is undefined at this point
console.log(x); // Output: undefined
var x = 10; // The declaration of 'x' is hoisted to the top, but its initialization is not, so it is undefined at this point
console.log(x); //declaration -> var x; initialization -> x = 10; Output: 10

// let and const - neither declaration nor initialization is hoisted - TDXE (Temporal Dead Zone)

// console.log(y); // This will cause a ReferenceError because 'y' is not defined yet (TDZ)
// let y = 20; // The declaration of 'y' is not hoisted, so it is not accessible before this line

callme(); // This will cause a ReferenceError because 'callme' is not defined yet (TDZ)

function callme() {
  console.log("This is a function declaration, and it is hoisted.");
}

var callme = () => {
  console.log("This is a function expression, and it is not hoisted.");
};
