class Student {
  constructor(name, id, course) {
    this.name = name;
    this.id = id;
    this.course = course;
  }

  Message() {
    console.log(this); // 'this' refers to the instance of Student that calls the Message method
    console.log(
      "Hello, I am " +
        this.name +
        ", my id is " +
        this.id +
        " and I am enrolled in " +
        this.course +
        " course.",
    ); // Using 'this' to access the properties of the Student instance
    return `Hello, I am ${this.name}, my id is ${this.id} and I am enrolled in ${this.course} course.`;
  }
}

let student1 = new Student("Alice", "S123", "Computer Science");
console.log(student1.Message()); // Output: Hello, I am Alice, my id is S123 and I am enrolled in Computer Science course.

let student2 = new Student("Bob", "S456", "Mathematics");
console.log(student2.Message()); // Output: Hello, I am Bob, my id is S456 and I am enrolled in Mathematics course.

// Inhertitance in JavaScript using classes
class GraduateStudent extends Student {
  constructor(name, id, course, rank) {
    // call the parent class constructor to initialize the inherited properties
    super(name, id, course);
    // initialize the new property specific to GraduateStudent
    this.rank = rank;
  }

  Message() {
    // call the parent class Message method to get the base message
    const baseMessage = super.Message();
    // add the rank information to the base message
    return `${baseMessage} My rank is ${this.rank}.`;
  }
}

let student3 = new GraduateStudent("Charlie", "S789", "Physics", 1);
console.log(student3); // Output: GraduateStudent { name: 'Charlie', id: 'S789', course: 'Physics', rank: 1 }
console.log(student3.Message()); // Output: Hello, I am Charlie, my id is S789 and I am enrolled in Physics course. My rank is 1.
