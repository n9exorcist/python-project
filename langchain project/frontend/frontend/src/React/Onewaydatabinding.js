import React from "react";

const Onewaydatabinding = ({ message, showmessage }) => {
  return (
    <div>
      <h1>One way data binding</h1>
      {/* Check if 'message' has text, not if the function exists */}
      {message && <p>{message}</p>}

      {/* The onClick just calls the function passed from Home */}
      <button onClick={showmessage}>Show Message</button>
    </div>
  );
};

export default Onewaydatabinding;
