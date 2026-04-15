import React, { useRef } from "react";

const UnControlledComp = () => {
  // 1. Initialize refs as objects (NOT arrays)
  // These will persist for the full lifetime of the component
  const usename = useRef(null);
  const password = useRef(null);
  const captcha = useRef(null);

  const captchaValue = "123";

  const handleSubmit = (e) => {
    // Prevent the default browser form submission (page reload)
    e.preventDefault();

    // 2. Access the 'value' property directly from the DOM nodes via .current
    const enteredCaptcha = captcha.current.value;
    const enteredUsername = usename.current.value;
    const enteredPassword = password.current.value;

    if (enteredCaptcha !== captchaValue) {
      alert("Captcha is incorrect. Please try again.");
      return;
    }

    alert(
      `Form submitted successfully!\nUsername: ${enteredUsername}\nPassword: ${enteredPassword}`,
    );
  };

  return (
    <div
      style={{
        border: "2px solid #3498db",
        padding: "20px",
        margin: "20px",
        borderRadius: "8px",
      }}
    >
      <h1>UnControlled Component using useRef</h1>
      <p>
        <small>
          Using <strong>useRef</strong> to access DOM directly.
        </small>
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "10px" }}>
          <label>Username: </label>
          {/* 3. Attach the ref to the input element */}
          <input type="text" ref={usename} placeholder="Enter Username" />
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>Password: </label>
          <input type="password" ref={password} placeholder="Enter Password" />
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>Captcha (Type "123"): </label>
          <input type="text" ref={captcha} />
        </div>

        <button
          type="submit"
          style={{ cursor: "pointer", padding: "5px 15px" }}
        >
          Submit
        </button>
      </form>
    </div>
  );
};

export default UnControlledComp;
