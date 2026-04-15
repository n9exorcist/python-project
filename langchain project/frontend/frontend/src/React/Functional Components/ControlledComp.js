import React from "react";

const ControlledComp = () => {
  const [usename, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [captcha, setCaptcha] = React.useState("");

  const captchaValue = "123";
  const handleSubmit = (e) => {
    e.preventDefault();
    if (captcha !== captchaValue) {
      alert("Captcha is incorrect. Please try again.");
      return;
    }
    alert(
      `Form submitted successfully! Username: ${usename}, Password: ${password}`,
    );
  };

  return (
    <>
      <h1>Controlled Component using useState</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username: </label>
          <input
            type="text"
            value={usename}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label>Password: </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label>Captcha: </label>
          <input
            type="text"
            value={captcha}
            onChange={(e) => setCaptcha(e.target.value)}
          />
        </div>
        <button type="submit">Submit</button>
      </form>
    </>
  );
};

export default ControlledComp;
