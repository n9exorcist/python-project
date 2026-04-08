import React from "react";

const ConditionalRendering = () => {
  const isLoggedIn = true;
  const showText = true;
  return (
    <div>
      <h1>Conditional Rendering</h1>
      {!!isLoggedIn ? <p>Welcome back!</p> : <p>Please log in.</p>}
      {showText && <p>This text is conditionally rendered.</p>}
    </div>
  );
};

export default ConditionalRendering;
