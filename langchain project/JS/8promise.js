let promise = new Promise((resolve, reject) => {
  console.log("Promise started");
  let success = Math.random() > 0.5; // Simulating success or failure randomly

  success
    ? resolve("Promise resolved successfully!")
    : reject("Promise rejected with an error.");
});

promise
  .then((message) => {
    console.log(message); // Output: Promise resolved successfully!
  })
  .catch((error) => {
    console.error(error); // Output: Promise rejected with an error.
  });

// async function that returns a promise

async function Week() {
  let weekDays = new Promise((resolve, reject) => {
    resolve(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  });

  let weekEnd = new Promise((resolve, reject) => {
    resolve(["Saturday", "Sunday"]);
  });

  console.log("Fetching week days...");
  let wd = await weekDays; // waiting for the weekDays promise to resolve
  console.log("Week days are: ", wd);
  console.log("Fetching week end days...");
  let we = await weekEnd; // waiting for the weekEnd promise to resolve
  console.log("Week end days are: ", we);

  return { weekDays: wd, weekEnd: we };
}

let result = Week();
result.then((data) => {
  console.log("Final result:", data);
}); // Output: Fetching week days... Week days are:  [ 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday' ] Fetching week end days... Week end days are:  [ 'Saturday', 'Sunday' ]
