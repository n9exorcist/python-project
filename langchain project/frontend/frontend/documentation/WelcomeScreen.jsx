import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../assets/css/Welcomescreen.css";
import { useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import OverviewCards from "../components/OverviewCards";

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const functions = [
    { name: "Plan", icon: "planner_banner_ad_pt", description: "Planning" },
    { name: "Source", icon: "design_services", description: "Sourcing" },
    { name: "Deliver", icon: "controller_gen", description: "Delivery" },
    { name: "Make", icon: "pacemaker", description: "Manufacturing" },
    { name: "Service", icon: "source_environment", description: "Service" },
  ];

  return (
    <div className="glossy-bg min-vh-100 welcomescreen-container">
      {/* Hero Section */}
      <div className="hero-container overflow-hidden">
        <div className="container py-5">
          <div className="row align-items-center text-center text-md-start">
            <div className="col-md-7 animate-left mb-4 mb-md-0">
              <h2 className="fw-light px-3 px-md-5">
                Welcome to{" "}
                <span className="text-accenture">
                  Supply Chain Rapid Diagnostics Platform
                </span>
              </h2>
            </div>
            <div className="col-md-5 animate-right">
              <div
                className="glossy-card shadow-lg p-3 mb-3 mb-md-5 rounded mx-auto"
                style={{ maxWidth: "400px" }}
              >
                <img
                  src="./mainpage.jpg"
                  alt="Tariff and Resiliency"
                  className="img-fluid rounded"
                />
                <div className="mt-2 intro-genai">
                  GenAI Powered diagnostics. Simplifying assessments.
                </div>
              </div>
            </div>
          </div>

          <div className="row functions-section mt-4">
            {/* Functions Section */}
            <div className="p-3 p-md-4">
              <Box
                sx={{
                  borderRadius: "12px",
                  border: "1px solid #FFF",
                  background:
                    "linear-gradient(270deg, rgba(254, 197, 240, 0.30) 86.06%, rgba(186, 226, 255, 0.30) 100%), rgba(186, 226, 255, 0.30)",
                  padding: { xs: "20px", md: "30px" },
                }}
              >
                <Typography
                  variant="h5"
                  className="typoHeader"
                  align="center"
                  gutterBottom
                >
                  <div className="d-flex align-items-center justify-content-center mb-4">
                    <span
                      className="material-symbols-outlined"
                      style={{ marginRight: "8px", fontSize: "24px" }}
                    >
                      checked_bag
                    </span>
                    Functions
                  </div>
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                  }}
                >
                  {functions.map((func, index) => {
                    const isActive = ["Plan", "Source", "Deliver"].includes(
                      func.name,
                    );
                    return (
                      <button
                        key={index}
                        className={`function-button ${isActive ? " active" : " disabled"}`}
                        disabled={!isActive}
                        style={{
                          opacity: isActive ? 1 : 0.5,
                          pointerEvents: isActive ? "auto" : "none",
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            marginRight: "8px",
                            fontSize: "20px",
                            color: isActive ? "#7500C0" : "#aaa",
                          }}
                        >
                          {func.icon}
                        </span>
                        {func.name}
                      </button>
                    );
                  })}
                </Box>
              </Box>
            </div>
          </div>
        </div>
      </div>

      <OverviewCards />

      {/* Workbench Section */}
      <div className="workbench-container overflow-hidden">
        <div className="container py-5">
          <div className="row d-flex align-items-stretch flex-column-reverse flex-md-row mb-5">
            {/* Left Section */}
            <div className="col-md-6 animate-left d-flex flex-column ps-3 ps-md-4 text-center text-md-start mt-4 mt-md-0">
              <h3 className="text-accenture mb-3">
                Rapid Diagnostics Workbench
              </h3>
              <div className="inner-content mb-4">
                Rapid Diagnostic Factory empowers users with AI-powered,
                cross-platform insights from Accenture's Supply Chain (SC)
                diagnostic tools, high-impact opportunities and tailored
                recommendations—accelerating decision-making
              </div>
              <div className="mt-auto d-flex justify-content-center justify-content-md-start">
                <button
                  className="btn btn-dark btn-homepage"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    navigate("/assessment");
                  }}
                >
                  Launch
                </button>
              </div>
            </div>

            {/* Right Section */}
            <div className="col-md-6 animate-right d-flex align-items-center justify-content-center">
              <div
                className="glossy-card shadow p-3 bg-white rounded w-100 h-100 mx-auto"
                style={{ maxWidth: "500px" }}
              >
                <img
                  src="./overview.png"
                  alt="benchmark-placeholder"
                  className="image-welcome rounded img-fluid"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demos Section */}
      <div className="demo-container overflow-hidden">
        <div className="container py-5">
          <div className="row d-flex align-items-stretch mb-5">
            {/* Left Image Section */}
            <div className="col-md-6 animate-right d-flex align-items-center justify-content-center mb-4 mb-md-0">
              <div
                className="glossy-card shadow p-3 bg-white rounded w-100 h-100 mx-auto"
                style={{ maxWidth: "500px" }}
              >
                <img
                  src="./demo.png"
                  alt="benchmark-placeholder"
                  className="image-welcome rounded img-fluid"
                />
              </div>
            </div>

            {/* Right Text Section */}
            <div className="col-md-6 animate-left d-flex flex-column ps-3 ps-md-5 text-center text-md-start">
              <h3 className="text-accenture mb-3">Demo</h3>
              <div className="inner-content mb-4">
                Explore inspiring demos and client success stories showcasing
                how our tailored solutions deliver real results. See how we’ve
                transformed challenges into achievements, driving growth and
                innovation across industries.
              </div>
              <div className="mt-auto d-flex justify-content-center justify-content-md-start">
                <button
                  className="btn btn-dark btn-homepage"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    navigate("/demo");
                  }}
                >
                  Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
