function learningVar() {
  var message = "Hello";
  console.log(message);
}

learningVar();

// console.log(message); // This will cause an error because 'message' is not defined outside the function.

// Redeclaration and rescoping of 'var' variable

var xVar = 123;
var xVar = 456; // This is allowed with 'var', it will overwrite the previous value
console.log(xVar); // Output: 456
xVar = 789; // Reassigning the value of xVar
console.log(xVar); // Output: 789

// Block scope with let and const

{
  var x = 10; // 'var' is function-scoped, so it will be accessible outside this block
  let y = 20; // 'let' is block-scoped, so it will not be accessible outside this block
  const z = 30; // 'const' is also block-scoped, so it will not be accessible outside this block
  console.log(x); // Output: 10
  console.log(y); // Output: 20
  console.log(z); // Output: 30
}
// console.log(x); // This will cause an error because 'x' is not defined outside the block
// console.log(y); // This will cause an error because 'y' is not defined outside the block
// console.log(z); // This will cause an error because 'z' is not defined outside the block

let xLet = 123;
// let xLet = 456; // This will cause an error because 'xLet' has already been declared with 'let'
console.log(xLet); // Output: 123
xLet = 789; // Reassigning the value of xLet is allowed
console.log(xLet); // Output: 789

const XConst = 123;
// const XConst = 456; // This will cause an error because 'XConst' has already been declared with 'const'
console.log(XConst); // Output: 123
// XConst = 789; // This will cause an error because you cannot reassign a value to a 'const' variable
