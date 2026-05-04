/* eslint-disable no-console */
import React from "react";
import { Navbar, Nav, Button } from "react-bootstrap";
import { useNavigate, useLocation } from "react-router-dom";
import {
  useMsal,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import "../assets/css/Navbar.css";

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { instance, accounts, inProgress } = useMsal();

  // Get user name for greeting (from MSAL account)
  const userName =
    accounts && accounts.length > 0
      ? accounts[0].name || accounts[0].username || "User"
      : "User";

  // Handles logo click and redirects home
  const handleLogoClick = () => {
    navigate("/");
  };

  // Active nav-link helper for CSS
  const getClassName = (path) =>
    location.pathname === path ? "nav-link active" : "nav-link";

  // Handles logout using MSAL
  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI,
    });
  };

  // Handles login using MSAL - FIXED: Guard against interaction_in_progress
  const handleLogin = async () => {
    try {
      // Critical: wait until MSAL finishes any ongoing interaction
      if (inProgress !== InteractionStatus.None) {
        return;
      }

      // If already signed in, don't trigger login again
      const activeAccount = instance.getActiveAccount() || accounts[0];
      if (activeAccount) {
        instance.setActiveAccount(activeAccount);
        return;
      }

      await instance.loginRedirect();
    } catch (error) {
      if (error.errorCode !== "interaction_in_progress") {
        // handle non-interaction errors if needed
        console.error(error);
      } else {
        // interaction_in_progress: safely ignore
      }
    }
  };

  return (
    <Navbar
      expand="lg"
      className="navbar-container bg-white navbar-light px-3 px-md-4"
      collapseOnSelect
    >
      <Navbar.Brand
        onClick={handleLogoClick}
        className="logo-container d-flex align-items-center"
        style={{ cursor: "pointer" }}
      >
        <img
          src="/mlogo.svg"
          alt="Supply Chain Rapid Diagnostics logo"
          className="desktop-logo"
        />
        <span className="footer-chevron"></span>
        <span className="title mb-0">Supply Chain Rapid Diagnostics</span>
      </Navbar.Brand>

      {/* This is the Hamburger Icon */}
      <Navbar.Toggle
        aria-controls="responsive-navbar-nav"
        className="border-0 shadow-none"
      />

      {/* Everything inside here collapses on mobile */}
      <Navbar.Collapse
        className="justify-content-end"
        id="responsive-navbar-nav"
      >
        <Nav className="nav-menu align-items-center text-center mt-3 mt-lg-0">
          <Nav.Link className={getClassName("/")} onClick={() => navigate("/")}>
            Home
          </Nav.Link>
          <Nav.Link
            className={getClassName("/home")}
            onClick={() => navigate("/home")}
          >
            Overview
          </Nav.Link>
          <Nav.Link
            className={getClassName("/demo")}
            onClick={() => navigate("/demo")}
          >
            Demo
          </Nav.Link>
          <Nav.Link
            className={getClassName("/assessment")}
            onClick={() => navigate("/assessment")}
          >
            Workbench
          </Nav.Link>
        </Nav>

        <Nav className="auth-section align-items-center justify-content-center mt-3 mt-lg-0 pb-3 pb-lg-0">
          <AuthenticatedTemplate>
            {/* Full username without truncation */}
            <span className="user-name text-center mb-3 mb-lg-0 mx-lg-3">
              {`Hi, ${userName}`}
            </span>
            <Button
              variant="outline-primary"
              className="btn-auth"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </AuthenticatedTemplate>

          <UnauthenticatedTemplate>
            <Button
              variant="primary"
              className="btn-auth ms-lg-3"
              onClick={handleLogin}
              disabled={inProgress !== InteractionStatus.None}
            >
              {inProgress !== InteractionStatus.None ? "Please wait..." : "Login"}
            </Button>
          </UnauthenticatedTemplate>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default NavBar;

.navbar-container {
  width: 100%;
  min-height: 65px;
  border-bottom: 1px solid #f2f2f2;
}

.desktop-logo {
  width: 30px;
  margin-right: 10px;
}

.title {
  font-size: 16px;
  font-weight: 500;
  color: #181818;
}

.nav-menu {
  gap: 15px;
}

/* Base styles for the links */
.navbar-container .nav-link {
  font-size: 15px;
  color: #222;
  text-decoration: none;
  padding-bottom: 4px;
  position: relative;
  cursor: pointer !important;
  transition: color 0.3s;
  font-weight: 500;
}

/* Active state colors and underline */
.navbar-container .nav-link.active {
  color: #6a1b94;
}

.navbar-container .nav-link.active::after {
  content: "";
  display: block;
  position: absolute;
  bottom: 0px;
  left: 0;
  width: 100%;
  height: 2px;
  background: #7d3ee9;
  border-radius: 2px;
}

/* Enforced Auth Button Styles */
.btn-auth {
  background-color: #6a1b94 !important;
  color: #fff !important;
  border: none !important;
  padding: 7px 18px !important;
  border-radius: 18px !important;
  font-weight: 600 !important;
  font-size: 15px !important;
  cursor: pointer !important;
  transition: background-color 0.3s ease;
}

.btn-auth:hover {
  background-color: #59217b !important;
}

.user-name {
  color: #6a1b94;
  background-color: #f4e6fd;
  border-radius: 12px;
  padding: 8px 15px;
  font-weight: 600;
  font-size: 15px;
  cursor: default;
  white-space: normal; 
  word-break: break-word;
}

/* Mobile Specific Adjustments */
@media (max-width: 991px) {
  .nav-menu {
    gap: 0;
    margin-bottom: 10px;
  }
  
  .navbar-container .nav-link {
    margin-bottom: 10px;
    display: inline-block;
  }

  .navbar-container .nav-link.active::after {
    width: 50%;
    left: 25%;
  }
}

