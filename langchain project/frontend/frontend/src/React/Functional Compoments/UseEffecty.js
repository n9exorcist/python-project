import React, { useEffect } from "react";

const UseEffecty = () => {
  const [text, setText] = React.useState("");
  const [calculate, setCalculate] = React.useState(0);

  // useEffect to update our calculate based on the length of the text
  useEffect(() => {
    setCalculate(text.length);
  }, [text]);

  // message based on the length of the text, if it's even or odd
  const message = calculate % 2 === 0 ? "Even" : "Odd";

  return (
    <div>
      <h1>UseEffect in React</h1>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p>Calculate: {calculate}</p>
      <p>{message}</p>
    </div>
  );
};

export default UseEffecty;
