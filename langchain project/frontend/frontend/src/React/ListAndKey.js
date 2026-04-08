import React from "react";

const ListAndKey = () => {
  const courses = [
    { cid: "C001", cname: "ReactJS", cduration: 27, csme: "Shipra" },
    { cid: "C002", cname: "Angular", cduration: 30, csme: "Kriti" },
    { cid: "C003", cname: "Vue", cduration: 18, csme: "Amisha" },
    { cid: "C004", cname: "ES6", cduration: 20, csme: "Sheetal" },
    { cid: "C005", cname: "TypeScript", cduration: 22, csme: "Sanskriti" },
  ];
  return (
    <>
      <h1>List and Keys</h1>
      <table>
        <thead>
          <tr>
            <th>Course ID</th>
            <th>Course Name</th>
            <th>Duration</th>
            <th> SME </th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.cid}>
              <td>{course.cid}</td>
              <td>{course.cname}</td>
              <td>{course.cduration}</td>
              <td>{course.csme}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default ListAndKey;
