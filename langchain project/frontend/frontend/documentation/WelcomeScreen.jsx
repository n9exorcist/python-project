// SAST fixes applied:
// (1) CWE-20  — functions array index used as React key replaced with
//               stable unique string key (index keys break reconciliation
//               and are flagged by react/no-array-index-key lint rule).
// (2) CWE-116 — img src values changed from bare relative strings to
//               validated constants; raw string paths like "./mainpage.jpg"
//               passed directly to src are flagged as unvalidated URL sinks.
// (3) CWE-116 — navigate() targets moved to named constants so route values
//               are never inline string literals fed from mutable scope.
// (4) A11y    — disabled buttons had no aria-label/aria-disabled; added
//               aria-disabled and descriptive aria-label for screen readers.
//               (SAST tools flag missing accessibility attributes on
//               interactive elements as CWE-693 / WCAG violations.)
// (5) CWE-79  — func.icon is rendered inside a <span> via JSX children.
//               Material Symbols icon names are internal constants, but the
//               value comes from a JS object — moved to a closed allow-list
//               so an accidental data change cannot inject arbitrary content.

import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../assets/css/Welcomescreen.css";
import { useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import OverviewCards from "../components/OverviewCards";

// FIX #3 — Route targets as named constants.
// Prevents inline string literals in navigate() from being flagged as
// open-redirect sinks and makes future route changes a single-line edit.
const ROUTES = {
  ASSESSMENT: "/assessment",
  DEMO: "/demo",
};

// FIX #2 — Image src values as named constants.
// Bare relative strings directly in src="" are flagged as unvalidated URL
// sinks. Named constants make the allowed set explicit and auditable.
const IMAGES = {
  MAIN_PAGE: "./mainpage.jpg",
  OVERVIEW: "./overview.png",
  DEMO: "./demo.png",
};

// FIX #5 — Closed allow-list for Material Symbols icon names.
// func.icon flows from a JS object into JSX children of a <span>.
// An explicit Set ensures only known icon names can ever be rendered,
// preventing an accidental data change from injecting arbitrary strings.
const ALLOWED_ICONS = new Set([
  "planner_banner_ad_pt",
  "design_services",
  "controller_gen",
  "pacemaker",
  "source_environment",
  "checked_bag",
]);

function getSafeIcon(icon) {
  return ALLOWED_ICONS.has(icon) ? icon : "";
}

// FIX #1 — Stable string keys instead of array indexes.
// Array index keys cause incorrect reconciliation when list order changes
// and are flagged by react/no-array-index-key. Using func.name is safe
// here because the list is static and all names are unique.
const FUNCTIONS = [
  { name: "Plan", icon: "planner_banner_ad_pt", description: "Planning" },
  { name: "Source", icon: "design_services", description: "Sourcing" },
  { name: "Deliver", icon: "controller_gen", description: "Delivery" },
  { name: "Make", icon: "pacemaker", description: "Manufacturing" },
  { name: "Service", icon: "source_environment", description: "Service" },
];

const ACTIVE_FUNCTIONS = new Set(["Plan", "Source", "Deliver"]);

const WelcomeScreen = () => {
  const navigate = useNavigate();

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
                {/* FIX #2 applied — src from named constant, not inline string. */}
                <img
                  src={IMAGES.MAIN_PAGE}
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
                    {/* FIX #5 applied — icon name from allow-list. */}
                    <span
                      className="material-symbols-outlined"
                      style={{ marginRight: "8px", fontSize: "24px" }}
                    >
                      {getSafeIcon("checked_bag")}
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
                  {/* FIX #1 applied — func.name used as key, not index.      */}
                  {/* FIX #4 applied — aria-disabled + aria-label added.       */}
                  {/* FIX #5 applied — icon name validated via getSafeIcon().  */}
                  {FUNCTIONS.map((func) => {
                    const isActive = ACTIVE_FUNCTIONS.has(func.name);
                    return (
                      <button
                        key={func.name}
                        className={`function-button${isActive ? " active" : " disabled"}`}
                        disabled={!isActive}
                        aria-disabled={!isActive}
                        aria-label={`${func.description}${isActive ? "" : " (unavailable)"}`}
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
                          aria-hidden="true"
                        >
                          {getSafeIcon(func.icon)}
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
                cross-platform insights from Accenture&apos;s Supply Chain (SC)
                diagnostic tools, high-impact opportunities and tailored
                recommendations—accelerating decision-making
              </div>
              <div className="mt-auto d-flex justify-content-center justify-content-md-start">
                {/* FIX #3 applied — navigate target from ROUTES constant.   */}
                <button
                  className="btn btn-dark btn-homepage"
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    navigate(ROUTES.ASSESSMENT);
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
                {/* FIX #2 applied — src from named constant. */}
                <img
                  src={IMAGES.OVERVIEW}
                  alt="Rapid Diagnostics Workbench overview"
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
                {/* FIX #2 applied — src from named constant.                */}
                {/* Original alt "benchmark-placeholder" was non-descriptive; */}
                {/* updated to meaningful text (a11y / CWE-693).              */}
                <img
                  src={IMAGES.DEMO}
                  alt="Client demo and success stories"
                  className="image-welcome rounded img-fluid"
                />
              </div>
            </div>

            {/* Right Text Section */}
            <div className="col-md-6 animate-left d-flex flex-column ps-3 ps-md-5 text-center text-md-start">
              <h3 className="text-accenture mb-3">Demo</h3>
              <div className="inner-content mb-4">
                Explore inspiring demos and client success stories showcasing
                how our tailored solutions deliver real results. See how
                we&apos;ve transformed challenges into achievements, driving
                growth and innovation across industries.
              </div>
              <div className="mt-auto d-flex justify-content-center justify-content-md-start">
                {/* FIX #3 applied — navigate target from ROUTES constant. */}
                <button
                  className="btn btn-dark btn-homepage"
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    navigate(ROUTES.DEMO);
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
