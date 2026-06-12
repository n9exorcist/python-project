import React, { createContext, useState } from "react";
import Calculate from "./Calculate";
import Onewaydatabinding from "./Onewaydatabinding";
import ConditionalRendering from "./ConditionalRendering";
import ListAndKey from "./ListAndKey";
import Axios from "./Axios";
import UseEffecty from "./Functional Components/UseEffecty";
import UseContexty from "./Functional Components/UseContexty";

import ControlledComp from "./Functional Components/ControlledComp";
import UnControlledComp from "./Functional Components/UnControlledComp";
import UseCallbackParent from "./Functional Components/UseCallbackParent";
import UseReducersy from "./Functional Components/UseReducersy";

// Create a ThemeContext to manage dark mode state
export const ThemeContext = createContext();

const Home = () => {
  const [message, setMessage] = useState("");

  const showmessage = () => {
    setMessage("Hello user, this is one way data binding example");
  };

  // UseReducer - Initial state for the reducer
  // Initial state of an object with a count property set to 0
  const [state, dispatch] = React.useReducer(UseReducersy, { count: 0 });

  // UseContext
  // 2. Define a state that will be shared across components, in this case, dark mode state
  const [isDarkMode, setIsDarkMode] = useState(false);

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
        <h1>UseReducer in React</h1>
        <p>Count: {state.count}</p>
        <button onClick={() => dispatch({ type: "INCREMENT" })}>
          Increment
        </button>
        <button onClick={() => dispatch({ type: "DECREMENT" })}>
          Decrement
        </button>
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
        <UseCallbackParent />
      </div>
    </ThemeContext.Provider>
  );
};

export default Home;
