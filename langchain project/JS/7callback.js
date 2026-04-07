// callback

console.log("hello 1");
setTimeout(() => {
  console.log("hello 2");
}, 2000);
console.log("hello 3");

// call stack => console.log('hello 1'), console.log('hello 3')
// event loop => checks the call stack and task queue, if the call stack is empty, it takes the first callback from the task queue and pushes it to the call stack for execution
// task queue => setTimeout callback (console.log('hello 2')) is added to the task queue after 2000 milliseconds, and it will be executed after the call stack is empty (after console.log('hello 1') and console.log('hello 3') are executed)
// web APIs => setTimeout is a web API that allows us to execute a callback function after a specified delay (2000 milliseconds in this case). It is not part of the JavaScript language itself, but it is provided by the browser environment. When setTimeout is called, it registers the callback function to be executed after the specified delay and continues with the next line of code without waiting for the timeout to complete.

function Greet(name, callback) {
  console.log(`Hello, ${name}!`);
  setTimeout(() => {
    callback();
  }, 1000);
}

function showMessage(msg) {
  console.log(msg);
}

Greet("Alice", () => {
  showMessage("Welcome to the callback function!"); // Output: Welcome to the callback function!
});
