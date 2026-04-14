import React, { createContext, useState } from "react";
import Calculate from "./Calculate";
import Onewaydatabinding from "./Onewaydatabinding";
import ConditionalRendering from "./ConditionalRendering";
import ListAndKey from "./ListAndKey";
import Axios from "./Axios";
import UseEffecty from "./Functional Compoments/UseEffecty";
import UseContexty from "./Functional Compoments/UseContexty";

import ControlledComp from "./Functional Compoments/ControlledComp";
import UnControlledComp from "./Functional Compoments/UnControlledComp";

// Create a ThemeContext to manage dark mode state
export const ThemeContext = createContext();

const Home = () => {
  const [message, setMessage] = useState("");

  // 2. Define a state that will be shared across components, in this case, dark mode state
  const [isDarkMode, setIsDarkMode] = useState(false);

  const showmessage = () => {
    setMessage("Hello user, this is one way data binding example");
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prevMode) => !prevMode);
  };

  // Define dynamic styles based on the theme
  const themeStyles = {
    backgroundColor: isDarkMode ? "#2c3e50" : "#ffffff",
    color: isDarkMode ? "#ecf0f1" : "#000000",
    minHeight: "10vh",
    padding: "20px",
    transition: "all 0.3s ease", // Smooth transition between modes
  };

  // You MUST return the JSX elements!
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <div>
        <Calculate />
        <Onewaydatabinding message={message} showmessage={showmessage} />
        <ConditionalRendering />
        <ListAndKey />
        <Axios />
        <div style={themeStyles}>
          <UseContexty />
        </div>

        <UseEffecty />

        <ControlledComp />
        <UnControlledComp />
      </div>
    </ThemeContext.Provider>
  );
};

export default Home;
