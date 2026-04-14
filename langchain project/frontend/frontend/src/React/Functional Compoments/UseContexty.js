import React, { useContext } from "react";
// Import the specific context we created in Home.js
import { ThemeContext } from "../Home";

const UseContexty = () => {
  // Use the useContext hook to access the context values
  const { isDarkMode, toggleDarkMode } = useContext(ThemeContext);
  return (
    <>
      <div
        style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px" }}
      >
        <h1>UseContext in React</h1>
        <p>Dark Mode: {isDarkMode ? "On" : "Off"}</p>
        <button onClick={toggleDarkMode}>
          Switch to {isDarkMode ? "Light" : "Dark"} Mode
        </button>
      </div>
    </>
  );
};

export default UseContexty;
