// Closure example

// It's a function, that remembers the variables from its outer scope even after the outer function has finished executing.

function outerFunction() {
  let outerVariable = "This is the outer variable"; // private variable that is only accessible within the outer function
  function innerFunction() {
    console.log(outerVariable); // inner function has access to the outer variable
  }
  return innerFunction; // returning the inner function, which forms a closure
}

// console.log(outerVariable); // This will cause an error because 'outerVariable' is not defined in this scope
let myInnerFunction = outerFunction(); // This will not output anything because innerFunction is not called
myInnerFunction(); // This will output: "This is the outer variable"

function BankAccount(initialBalance) {
  let balance = initialBalance; // private variable to hold the balance of the account

  //innerfunction
  return {
    deposit: function (amount) {
      balance += amount; // inner function has access to the balance variable
      console.log(`Deposited: ${amount}, New Balance: ${balance}`);
    },

    withdraw: function (amount) {
      if (amount > balance) {
        console.log("Insufficient funds");
      } else {
        balance -= amount; // inner function has access to the balance variable
        console.log(`Withdrew: ${amount}, New Balance: ${balance}`);
      }
    },

    getBalance: function () {
      return balance; // inner function has access to the balance variable
    },
  };
}

let myAccount = BankAccount(100);
console.log(myAccount.balance); // This will cause an error because 'balance' is not accessible outside the BankAccount function
console.log(myAccount.getBalance()); // Output: 100
myAccount.deposit(50); // Output: Deposited: 50, New Balance: 150
myAccount.withdraw(30); // Output: Withdrew: 30, New Balance: 120
myAccount.withdraw(200); // Output: Insufficient funds
