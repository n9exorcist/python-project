// this keyword in JavaScript refers to the current execution context. It can refer to different objects depending on how a function is called.

// In a regular function, 'this' refers to the global object (window in browsers) or undefined in strict mode.

function learningThis() {
  console.log("this is regular function: ", this); // In a regular function, 'this' refers to the global object (window in browsers) or undefined in strict mode.
}

learningThis(); // Output: Window { ... } in browsers, or undefined in strict mode

// Arrow functions do not have their own 'this' context; they inherit 'this' from the enclosing scope.

let arrowFunction = () => {
  console.log("this is arrow function: ", this); // In an arrow function, 'this' refers to the enclosing scope's 'this'.
};

arrowFunction(); // Output: Window { ... } in browsers, or undefined in strict mode (same as the enclosing scope)

// arrow function can inherit the value of this from enclosing/lexical scope

function CountTimer() {
  this.seconds = 0; // 'this' refers to the instance of CountTimer when called with 'new'
  console.log("this is CountTimer instance: ", this); // Output: CountTimer { seconds: 0 }
  setInterval(() => {
    this.seconds++; // 'this' refers to the instance of CountTimer because arrow functions inherit 'this' from the enclosing scope
    console.log("seconds: ", this.seconds);
  }, 1000);
}

// let timer = new CountTimer(); // Output: 1, 2, 3, ... every second

// method insider an object, 'this' refers to the object itself

let person = {
  adminName: "Admin",
  getAdminName: function () {
    console.log(this.adminName); // 'this' refers to the 'person' object, so it will output "Admin"
  },
};

person.getAdminName(); // Output: Admin

let person2 = {
  adminName: "Admin",
  getAdminName: () => {
    console.log(this.adminName); // In an arrow function, 'this' does not refer to the object, but to the enclosing scope, which is the global object. So it will output undefined.
  },
};

person2.getAdminName(); // Output: undefined

// call, bind and apply methods can be used to explicitly set the value of 'this' in a function

function greet() {
  console.log(`Hello, ${this.name}!`); // 'this' will refer to the object that is passed as an argument to call, bind, or apply
}

let user1 = { name: "Alice" };
let user2 = { name: "Bob" };

greet.call(user1); // Output: Hello, Alice! - 'this' is set to user1 using call
greet.apply(user2); // Output: Hello, Bob! - 'this' is set to user2 using apply
let boundGreet = greet.bind(user1); // 'this' is set to user1 using bind
boundGreet(); // Output: Hello, Alice!
