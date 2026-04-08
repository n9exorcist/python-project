import React, { useState } from "react";
import Calculate from "./Calculate";
import Onewaydatabinding from "./Onewaydatabinding";
import ConditionalRendering from "./ConditionalRendering";
import ListAndKey from "./ListAndKey";
import Axios from "./Axios";
import UseEffecty from "./Functional Compoments/UseEffecty";

const Home = () => {
  const [message, setMessage] = useState("");

  const showmessage = () => {
    setMessage("Hello user, this is one way data binding example");
  };

  // You MUST return the JSX elements!
  return (
    <div>
      <Calculate />
      <Onewaydatabinding message={message} showmessage={showmessage} />
      <ConditionalRendering />
      <ListAndKey />
      <Axios />
      <UseEffecty />
    </div>
  );
};

export default Home;
