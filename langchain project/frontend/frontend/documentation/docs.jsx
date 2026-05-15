import React, { useState, useMemo, useEffect } from "react";
import SpiderChart from "../common/SpiderChart";
import MaturityHorizontalBar from "./MaturityHorizontalBar";
import MaturityHorizontalBarMini from "./MaturityHorizontalBarMini";
import "../../assets/css/MaturityDetail.css";
import Loader from "../common/Loader";
import Select from "react-select";

/* ----------------- Styles for L1 Capability react-select ----------------- */
const l1SelectStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: '56px',
    backgroundColor: "#a100ff",
    borderRadius: "8px",
    borderColor: "#fff",
    boxShadow: state.isFocused ? '0 0 0 2px #fff' : 'none',
    color: "#fff",
    fontSize: "17px",
    fontWeight: 500,
  }),
  valueContainer: (provided) => ({
    ...provided,
    padding: "6px 8px",
    gap: "8px",
    color: "#fff",
  }),
  multiValue: (provided) => ({
    ...provided,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: "6px",
    padding: "2px 6px",
    fontWeight: 500,
    fontSize: "16px",
    color: "#fff",
    border: "1px solid #fff",
    marginRight: "8px",
  }),
  multiValueLabel: (provided) => ({
    ...provided,
    color: "#fff",
    fontWeight: 500,
    padding: "0 6px",
  }),
  multiValueRemove: (provided) => ({
    ...provided,
    color: "#fff",
    backgroundColor: "transparent",
    svg: {
      width: "22px",
      height: "22px",
      fill: "#fff"
    },
    '&:hover': {
      backgroundColor: "rgba(255,255,255,0.14)",
      color: "#fff",
      svg: {
        fill: "#fff"
      }
    }
  }),
  menu: (provided) => ({
    ...provided,
    borderRadius: "8px",
    fontSize: "16px",
    marginTop: "2px",
    zIndex: 10,
    backgroundColor: "#a100ff",
    color: "#fff",
    border: "1px solid #fff",
  }),
  option: (provided, state) => ({
    ...provided,
    fontWeight: state.isSelected ? 600 : 400,
    backgroundColor: state.isSelected ? "#c966ff" : (state.isFocused ? "#a100ff" : "#a100ff"),
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
  }),
  input: (provided) => ({
    ...provided,
    fontSize: "16px",
    color: "#fff"
  }),
  placeholder: (provided) => ({
    ...provided,
    color: "#fff",
    fontSize: "15px",
    fontWeight: 400,
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "#fff",
  }),
  dropdownIndicator: (provided, state) => ({
    ...provided,
    color: "#fff",
    ':hover': {
      color: "#fff"
    }
  }),
  indicatorSeparator: (provided) => ({
    ...provided,
    backgroundColor: "#fff"
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999 // ensures dropdown goes OVER everything!
  })
};

/* ------------------------------------------------------------------ */
/*  Mapping dropdown → real assessment name                           */
/* ------------------------------------------------------------------ */
const ASSESSMENT_TYPE_MAPPING = {
  Plan: "Planning",
  Source: "Procurement",
  Fulfil: "Fulfillment",
};

/* ------------------------------------------------------------------ */
/*  Helper: safe string comparison for Assessment                     */
/* ------------------------------------------------------------------ */
function safeAssessmentMatch(rowAssessment, assessmentKey) {
  if (!rowAssessment || !assessmentKey) return false;
  const norm = (s) =>
    String(s).toLowerCase().replace(/&amp;/g, "&").replace(/\s+/g, "");
  return norm(rowAssessment) === norm(assessmentKey);
}

/* ------------------------------------------------------------------ */
/*  extractKeyObservationTopics – CLUBBING/GROUPING                   */
/* ------------------------------------------------------------------ */
function extractKeyObservationTopics(data, assessmentName) {
  if (!Array.isArray(data)) return {};
  const groupedTopics = {};
  data.forEach((row) => {
    if (!safeAssessmentMatch(row.Assessment, assessmentName)) return;
    const l1 = row["Level 1 Category"]?.trim();
    const dimension = row["Business Dimension"]?.trim();
    if (!l1) return;
    const subKey = dimension || "General";
    const possibleFields = [
      "bd_text_summary_bullets",
      "bdtextsummarybullets",
      "BD_TEXT_SUMMARY_BULLETS",
      "text_summary_bullets",
      "summary",
    ];
    let bulletsField = "";
    for (const field of possibleFields) {
      const val = row[field];
      if (typeof val === "string" && val.trim()) {
        bulletsField = val.trim();
        break;
      }
    }
    if (!bulletsField) return;
    const bullets = bulletsField
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    if (bullets.length === 0) return;
    if (!groupedTopics[l1]) groupedTopics[l1] = {};
    if (!groupedTopics[l1][subKey]) groupedTopics[l1][subKey] = [];
    groupedTopics[l1][subKey].push(...bullets);
  });
  Object.keys(groupedTopics).forEach((l1) => {
    Object.keys(groupedTopics[l1]).forEach((dim) => {
      groupedTopics[l1][dim] = [...new Set(groupedTopics[l1][dim])];
    });
  });
  return groupedTopics;
}

/* ------------------------------------------------------------------ */
/*  Recommendation matching helpers                                   */
/* ------------------------------------------------------------------ */
function normalizeString(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/management/g, "mgmt")
    .replace(/ownership/g, "owner")
    .replace(/process(es)?/g, "process")
    .replace(/analytics/g, "analytics")
    .replace(/automation/g, "automation")
    .replace(/planning/g, "planning")
    .replace(/enrichment/g, "enrich")
    .replace(/forecasting/g, "forecast")
    .replace(/review/g, "review")
    .trim();
}

function findByL2Category(recommendationsArray, l2key) {
  if (!Array.isArray(recommendationsArray)) return undefined;
  const normKey = normalizeString(l2key);
  return recommendationsArray.find((r) => {
    const cats = Array.isArray(r["Level 2 Categories"]) ? r["Level 2 Categories"] : [];
    return cats.some((cat) => normalizeString(cat) === normKey);
  });
}

function renderAsList(text) {
  if (!text || typeof text !== "string") return text;
  let items = [];
  if (text.includes("\n")) {
    items = text.split("\n").map((i) => i.trim()).filter(Boolean);
  } else if (text.includes(" - ")) {
    items = text.split(" - ").map((i) => i.trim()).filter(Boolean);
  }
  if (items.length > 1) {
    return (
      <ul style={{ margin: 0, paddingLeft: "20px" }}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
  }
  return text;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export default function MaturityDetail({
  assessmentType,
  spiderLoading,
  spiderError,
  l1Data,
  l2Data,
  recommendations,
}) {
  const [selectedFunction, setSelectedFunction] = useState("Plan");
  const [selectedL1, setSelectedL1] = useState(["All"]);

  useEffect(() => {
    setSelectedL1(["All"]);
  }, [selectedFunction]);

  const assessmentName = ASSESSMENT_TYPE_MAPPING[selectedFunction] || selectedFunction;
  const recommendationsArray = recommendations || [];

  const l1Capabilities = useMemo(() => {
    const set = new Set();
    (l2Data || []).forEach((item) => {
      if (safeAssessmentMatch(item.Assessment, assessmentName)) {
        const l1 = item["Level 1 Category"];
        if (l1) set.add(l1);
      }
    });
    return ["All", ...Array.from(set)];
  }, [l2Data, assessmentName]);

  const l1Options = l1Capabilities.map((cap) => ({
    value: cap,
    label: cap,
  }));

  const handleL1Change = (opts) => {
    const values = opts.map((o) => o.value);
    if (values.includes("All")) {
      setSelectedL1(["All"]);
    } else {
      setSelectedL1(values);
    }
  };

  const filteredL1Data = useMemo(() => {
    return (l1Data || [])
      .filter((row) => safeAssessmentMatch(row.Assessment, assessmentName))
      .filter((row) =>
        selectedL1.includes("All") || selectedL1.includes(row["Level 1 Category"])
      );
  }, [l1Data, assessmentName, selectedL1]);

  const groupedObservationTopics = useMemo(
    () => extractKeyObservationTopics(filteredL1Data, assessmentName),
    [filteredL1Data, assessmentName]
  );

  const filteredData = useMemo(() => {
    let f = (l2Data || []).filter((item) =>
      safeAssessmentMatch(item.Assessment, assessmentName)
    );
    if (!selectedL1.includes("All")) {
      f = f.filter((item) => selectedL1.includes(item["Level 1 Category"]));
    }
    return f;
  }, [l2Data, assessmentName, selectedL1]);

  const spiderData = useMemo(() => {
    const byL1 = {};
    filteredL1Data.forEach((row) => {
      const l1 = row["Level 1 Category"];
      if (!byL1[l1]) byL1[l1] = [];
      const score = Number(row.overall_score) || Number(row.bd_score) || 0;
      byL1[l1].push(score);
    });
    return Object.entries(byL1)
      .map(([axis, vals]) => ({
        axis,
        value: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      }))
      .sort((a, b) => a.axis.localeCompare(b));
  }, [filteredL1Data]);

  const overallScore = useMemo(() => {
    if (filteredData.length === 0) return "N/A";
    const sum = filteredData.reduce((acc, row) => {
      const score = Number(row.l1_current_state) || Number(row.overall_score) || 0;
      return acc + score;
    }, 0);
    return (sum / filteredData.length).toFixed(2);
  }, [filteredData]);

  const maturityState = useMemo(() => {
    const score = parseFloat(overallScore);
    if (isNaN(score)) return "N/A";
    if (score >= 3.5) return "Differentiated";
    if (score >= 3) return "Advanced";
    if (score >= 2) return "Emerging";
    return "Limited";
  }, [overallScore]);

  const getRecommendation = (l2) => {
    const found = findByL2Category(recommendationsArray, l2);
    return found?.Recommendation || "Recommendation not available.";
  };

  const getLeadingPractice = (l2) => {
    const found = findByL2Category(recommendationsArray, l2);
    return found?.["Leading Practice"] || "Leading practice not available.";
  };

  useEffect(() => {

  }, [selectedFunction, assessmentName, l2Data, filteredData, selectedL1]);

  if (spiderLoading || !Array.isArray(l1Data) || !Array.isArray(l2Data)) {
    return <Loader />;
  }

  if (spiderError) {
    return (
      <div className="alert alert-danger">
        Error: {typeof spiderError === "object" ? JSON.stringify(spiderError) : spiderError}
      </div>
    );
  }

  return (
    <div className="maturity-detail-page">
      {/* ------------------- Dropdowns ------------------- */}
      <div className="dropdown mb-4 viewassessment-dropdown">
        <div className="row align-items-center">
          <div className="col-md-6">
            <label htmlFor="functionSelect" className="form-label fw-bold">
              Function Selection
            </label>
            <select
              id="functionSelect"
              className="form-select form-select-lg"
              value={selectedFunction}
              onChange={(e) => setSelectedFunction(e.target.value)}
            >
              <option value="Plan">Plan</option>
              <option value="Source">Source</option>
              <option value="Fulfil">Fulfil</option>
            </select>
          </div>
          <div className="col-md-6">
            <label htmlFor="l1Select" className="form-label fw-bold" style={{ color: '#fff' }}>
              L1 Capability
            </label>
            {/* --- Styled MULTISELECT DROPDOWN FOR L1 Capability --- */}
            <div style={{
              background: "#a100ff",
              borderRadius: "8px",
              padding: "8px",
              marginTop: "6px",
              marginBottom: "8px",
              boxShadow: "0 2px 8px #a34eff11",
            }}>
              <Select
                inputId="l1Select"
                options={l1Options}
                isMulti
                value={l1Options.filter(o => selectedL1.includes(o.value))}
                onChange={handleL1Change}
                styles={l1SelectStyles}
                className="react-select-container"
                classNamePrefix="react-select"
                placeholder="Select L1 Capability..."
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuShouldBlockScroll={true}
              />
            </div>
          </div>
        </div>
      </div>
      {/* ------------------- Assessment Results ------------------- */}
      <div className="spider-title mb-2 fw-bold">Assessment Results</div>
      <MaturityHorizontalBar data={filteredData} groupBy="Assessment" />

      <div className="d-flex flex-column">
        {/* ----- Summary ----- */}
        <div className="summary-section gap-4">
          <div className="score-box cards shadow mb-3">
            <div className="overall-score">
              <span className="score-label">Overall score:</span>{" "}
              <span className="score-num">{overallScore}</span>
            </div>
            <div className="score-maturity">
              Maturity state:{" "}
              <span
                className="fw-bold"
                style={{
                  color:
                    maturityState === "Differentiated" || maturityState === "Advanced"
                      ? "#31d47d"
                      : "#a34eff",
                }}
              >
                {maturityState}
              </span>
            </div>
          </div>
          <div className="spider-chart-box cards shadow" style={{ width: "100%", marginBottom: 20 }}>
            {spiderData.length > 0 ? (
              <SpiderChart
                data={spiderData}
                axisLabels={spiderData.map((d) => d.axis)}
                maxValue={4}
                color="#a34eff"
                size={320}
                border={0}
              />
            ) : (
              <div className="text-center p-4">No spider data available</div>
            )}
          </div>
        </div>
      </div>
      {/* ----- Sub-Capability Recommendations ----- */}
      <div className="rec-table-section-one cards shadow my-4 p-3">
        <div className="table-title fw-bold mb-2">
          Sub Capability Assessment & Recommendations
        </div>
        <div className="table-responsive">
          <table className="table table-bordered table-striped">
            <thead className="table-light">
              <tr>
                <th className="col-subcap-narrow">Sub Capability</th>
                <th className="col-current-state">Current State</th>
                <th className="col-recommendation-wide">Recommendation</th>
              </tr>
            </thead>
            <tbody className="scrollable-tbody">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center text-muted">
                    No data available for selected filters.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const l2 = row["Level 2 Category"];
                  const recommendationText = getRecommendation(l2);
                  return (
                    <tr key={idx}>
                      <td className="col-subcap-narrow">{l2}</td>
                      <td className="col-current-state">
                        <div style={{ minWidth: 180, maxWidth: 240 }}>
                          <MaturityHorizontalBarMini
                            current={Number(row.l2_current_state) || 0}
                            target={Number(row.l2_target_state) || 4}
                          />
                          <span
                            className={`score-tag score-${(row.l2_label_current || "").toLowerCase()}`}
                          >
                            {row.l2_label_current || "N/A"}
                          </span>
                        </div>
                      </td>
                      <td className="col-recommendation-wide">{renderAsList(recommendationText)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* ----- CLUBBED KEY OBSERVATIONS ----- */}
      <div className="key-observations cards shadow p-3">
        <div className="key-title fw-bold mb-2">Key Observations</div>
        <div>
          {Object.keys(groupedObservationTopics).length === 0 ? (
            <div className="mb-2 text-muted">No key observations available.</div>
          ) : (
            Object.entries(groupedObservationTopics).map(([mainTopic, dimensions], idx) => (
              <div key={idx} style={{ marginBottom: 24 }}>
                <div className="fw-bold mb-1" style={{ fontSize: 17 }}>
                  {mainTopic}
                </div>
                {Object.entries(dimensions).map(([dimension, bullets], dimIdx) => (
                  <div key={dimIdx} style={{ marginLeft: 10, marginBottom: 10 }}>
                    <span className="fw-semibold">{dimension}</span>
                    <ol style={{ marginLeft: "20px", paddingLeft: "0" }}>
                      {bullets.map((bullet, i) => (
                        <li key={i}>{bullet}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {/* ----- Leading Practices ----- */}
      <div className="rec-table-section-two cards shadow mt-4 p-3">
        <div className="table-title fw-bold mb-2">
          Leading Practices by Sub Capability
        </div>
        <div className="table-responsive">
          <table className="table table-bordered table-striped">
            <thead className="table-light">
              <tr>
                <th className="col-subcap-narrow">Sub Capability</th>
                <th className="col-leading-practice-wide">Leading Practice</th>
              </tr>
            </thead>
            <tbody className="scrollable-tbody">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="2" className="text-center text-muted">
                    No data available.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const l2 = row["Level 2 Category"];
                  const leadingPracticeText = getLeadingPractice(l2);
                  return (
                    <tr key={idx}>
                      <td className="col-subcap-narrow">{l2}</td>
                      <td className="col-leading-practice-wide">{renderAsList(leadingPracticeText)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


--

import React from "react";

const LEVELS = [
  { label: "Limited", from: 1, to: 1.99, color: "#e6d9fa" },
  { label: "Emerging", from: 2, to: 2.99, color: "#f5eefd" },
  { label: "Advanced", from: 3, to: 3.49, color: "#e9fddc" },
  { label: "Differentiated", from: 3.5, to: 4, color: "#dff4f9" },
];

const calcLeft = (val, markerWidth = 14) => {
  // Updated: Map 1-4 to 0-100% exactly (score=1 at 0%, score=4 at 100%)
  const x = Math.max(1, Math.min(4, Number(val) || 1)); // Clamp to 1-4, default to 1 if invalid
  return `calc(${((x - 1) / 3) * 100}% - ${markerWidth / 2}px)`;
};

export default function MaturityHorizontalBarMini({ current, target }) {
  // Updated: Clamp inputs to 1-4
  const safeCurrent = Math.max(1, Math.min(4, Number(current) || 1));
  const safeTarget = Math.max(1, Math.min(4, Number(target) || 1));

  return (
    <div
      style={{
        width: 220,
        minWidth: 160,
        height: 38,
        position: "relative",
        margin: "0 0 4px 0",
      }}
    >
      {/* Segments with labels */}
      <div
        style={{
          display: "flex",
          height: 18,
          borderRadius: 7,
          overflow: "hidden",
          boxShadow: "0 1px 6px #efe6ff10",
          background: "#fff",
        }}
      >
        {LEVELS.map((l, i) => (
          <div
            key={l.label}
            style={{
              flex: 1,
              background: l.color,
              borderRight: i === LEVELS.length - 1 ? "none" : "1px solid #eee",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              fontSize: 12,
              color: "#5c5286",
              fontWeight: 600,
              position: "relative",
            }}
          ></div>
        ))}
      </div>
      {/* Labels above bar */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 18,
          left: 0,
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        {LEVELS.map((l) => (
          <div
            key={l.label}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10,
              fontWeight: 600,
              color: "#6d38d7",
            }}
          >
            {l.label}
          </div>
        ))}
      </div>
      {/* Diamonds */}
      <span
        title={`Current: ${safeCurrent}`}
        style={{
          position: "absolute",
          top: 2,
          width: 14,
          height: 14,
          left: calcLeft(safeCurrent, 14),
          background: "#ffa100",
          border: "2px solid #fff",
          borderRadius: 3,
          boxShadow: "0 0 3px #bbb",
          transform: "rotate(45deg)",
          zIndex: 2,
        }}
      />
      <span
        title={`Target: ${safeTarget}`}
        style={{
          position: "absolute",
          top: safeCurrent === safeTarget ? 10 : 2,
          width: 14,
          height: 14,
          left: calcLeft(safeTarget, 14),
          background: "#31d47d",
          border: "2px solid #fff",
          borderRadius: 3,
          boxShadow: "0 0 3px #bbb",
          transform: "rotate(45deg)",
          zIndex: 2,
        }}
      />
    </div>
  );
}


--

import React from "react";
import "../../assets/css/MaturityHorizontalBar.css";

const LEVELS = [
  { label: "Limited", from: 1, to: 1.99, color: "#a34eff" },
  { label: "Emerging", from: 2, to: 2.99, color: "#a34eff" },
  { label: "Advanced", from: 3, to: 3.49, color: "#a34eff" },
  { label: "Differentiated", from: 3.5, to: 4, color: "#a34eff" },
];

const calcLeft = (val, markerWidth = 20) => {
  // Updated: Map 1-4 to 0-100% exactly (score=1 at 0%, score=4 at 100%)
  const x = Math.max(1, Math.min(4, Number(val) || 1)); // Clamp to 1-4, default to 1 if invalid
  return `calc(${((x - 1) / 3) * 100}% - ${markerWidth / 2}px)`;
};

function getCurrentScore(item) {
  // Updated: Default to 1 (min maturity) if invalid, not 0
  const score =
    typeof item.l1_current_state === "number"
      ? item.l1_current_state
      : Number(item.l1_current_state ?? 1) || 1;
  return Math.max(1, Math.min(4, score)); // Clamp
}

function getTargetScore(item) {
  const score =
    typeof item.l1_target_state === "number"
      ? item.l1_target_state
      : Number(item.l1_target_state ?? 1) || 1;
  return Math.max(1, Math.min(4, score)); // Clamp
}

export default function MaturityHorizontalBar({ data }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div className="alert alert-info">No data available</div>;
  }

  // Compute overall averages
  const overallCurrent =
    data.map(getCurrentScore).reduce((a, b) => a + b, 0) / data.length;
  const overallTarget =
    data.map(getTargetScore).reduce((a, b) => a + b, 0) / data.length;

  return (
    <div className="maturity-h-bar">
      <div className="levels-track">
        {LEVELS.map((level) => (
          <div
            key={level.label}
            className="level-segment"
            style={{ background: level.color }}
          >
            {level.label}
          </div>
        ))}
      </div>
      <div className="diamonds-track">
        <div className="diamonds-line"></div>
        {/* Your two diamond-marker spans */}
        <span
          className="diamond-marker"
          title={`Current: ${overallCurrent.toFixed(2)}`}
          style={{
            left: calcLeft(overallCurrent),
            background: "#ffa100",
            border: "2px solid #fff",
            zIndex: 3,
          }}
        />
        <span
          className="diamond-marker"
          title={`Target: ${overallTarget.toFixed(2)}`}
          style={{
            left: calcLeft(overallTarget),
            background: "#31d47d",
            border: "2px solid #fff",
            zIndex: 2,
            top: overallCurrent === overallTarget ? "16px" : "4px",
          }}
        />
      </div>

      <div className="scale-numbers">
        {[1, 2, 3, 4].map(
          (
            n // Updated: Removed 0, now starts at 1
          ) => (
            <span key={n}>{n}</span>
          )
        )}
      </div>
      {/* Legend */}
      <div
        className="horizontal-bar-legend"
        style={{
          display: "flex",
          gap: 16,
          fontSize: 13,
          marginTop: 6,
          alignItems: "center",
        }}
      >
        <span style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              background: "#ffa100",
              clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
              marginRight: 5,
            }}
          ></span>
          Current
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              background: "#31d47d",
              clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
              marginRight: 5,
            }}
          ></span>
          Target
        </span>
      </div>
    </div>
  );
}


--

/* eslint-disable no-console */
import React from "react";
import FileUploadContainer from "./FileUploadContainer";
import KPICalculatorSingle from "./kpi/KPICalculatorSingle";
import KPICalculationScreen1 from "./kpi/KPICalculationScreen1";
import KPICalculationScreen2 from "./kpi/KPICalculationScreen2";
import OTIFWaterfallChart from "./charts/OTIFWaterfallChart";
import WeeklyTrendLineChart from "./charts/WeeklyTrendLineChart";
import MonthlyTrendLineChart from "./charts/MonthlyTrendLineChart";
import OTIFHeatmapModalPreview from "./charts/OTIFHeatmapModalPreview";
import HeatMap from "./common/HeatMap";
import MaturityDetail from "./maturity/MaturityDetail";
import PeerRevenueInventoryAnalysisToggle from "./charts/PeerRevenueInventoryAnalysisToggle";
import RecommendationsChart from "./recommendations/RecommendationsChart";
import FunctionDropdown from "./recommendations/FunctionDropdown";
import BusinessCaseChart from "./charts/BusinessCaseChart";
// import SCTransformationAccordion from "./charts/SCTransformationAccordion";
import ExecutiveSummaryTab from "../components/executive-summary/ExecutiveSummaryTab";
import Loader from "./common/Loader";

const LazyGanttChartPage = React.lazy(() =>
  import("../components/pages/GanttChartPage")
);

export default function getTabConfig({
  state = {},
  handlers = {},
  meta = {},
  user,
} = {}) {
  const {
    selectedKPI,
    selectedKPIs,
    selectedFunction,
    surveyResponseFile,
    roleDeptFile,
    sheetNames,
    selectedSheet,
    setSelectedSheet,
    handleSurveyResponseUpload,

    waterfallData,
    waterfallLoading,
    monthOptions = [],
    channelOptions = [],
    productH1Options = [],
    brandH2Options = [],
    selectedMonth,
    setSelectedMonth,
    selectedChannel,
    setSelectedChannel,
    selectedProductLevel1,
    setSelectedProductLevel1,
    selectedBrand,
    setSelectedBrand,

    trendChannel,
    setTrendChannel,
    trendProductH1,
    setTrendProductH1,
    trendBrand,
    setTrendBrand,

    assessmentType,
    heatmapGranularity,
    setHeatmapGranularity,
    loading,
    error,
    filteredHeatmapData = [],
    columns = [],
    l1CapabilityTracking,
    l1l2CapabilityTracking,
    recommendations,
    peerFinancialData,
    downloadedScreenshots,
    handleDownloadPdfClick,
    GRANULARITIES,
    ASSESSMENT_TYPE_MAPPING,
    overallPotentialSavings,
    businessCaseData,
    recommendationsData,
    npvDataString,

    benchmarkingData,

    trendlineData,
    trendlineLoading,

    execSummaryData,
    execLoading,
    execError,

    heatmapData,
    heatmapLoading,
    heatmapError,
  } = state;

  const { handleKPIChange, handleAssessmentChange } = handlers;
  const { showTooltip, hideTooltip, tooltip } = meta;

  const weeklyDataFromApi = Array.isArray(trendlineData?.weekly)
    ? trendlineData.weekly.map((d) => ({
        year: d.year,
        week: `Week${d.week}`,
        OTIF: d.OTIF,
        period_label: d.period_label,
        month: d.month_name || undefined,
        total_order_qty: d.total_order_qty || 0,
      }))
    : [];

  const monthlyDataFromApi = Array.isArray(trendlineData?.monthly)
    ? trendlineData.monthly.map((d) => ({
        year: d.year,
        month: d.month_name || d.month,
        month_name: d.month_name,
        period: d.period_label,
        OTIF: d.OTIF,
        total_order_qty: d.total_order_qty || 0,
        channel: trendChannel,
        product_h1: trendProductH1,
        brand_h2: trendBrand,
      }))
    : [];

  function buildKeyObservations(recommendationsArray, assessmentTypeValue) {
    if (!Array.isArray(recommendationsArray)) return [];
    const filtered = recommendationsArray.filter(
      (rec) =>
        rec.category?.toLowerCase().includes(assessmentTypeValue.toLowerCase()) ||
        rec.term?.toLowerCase().includes(assessmentTypeValue.toLowerCase())
    );
    const grouped = {};
    filtered.forEach((rec) => {
      if (!grouped[rec.category]) grouped[rec.category] = [];
      grouped[rec.category].push(rec.text);
    });
    return Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }));
  }

  const assessmentTypeString =
    ASSESSMENT_TYPE_MAPPING?.[assessmentType] || assessmentType;
  const keyObservations = buildKeyObservations(
    recommendations,
    assessmentTypeString
  );

  // ✅ Handle backend structure where *_json = companies array directly
  const rawPeerData = peerFinancialData?.data || peerFinancialData || {};

  // Helper to safely extract companies array (handles both direct array and {companies: []})
  const getCompaniesArray = (dataKey) => {
    const rawData = rawPeerData[dataKey] || {};
    return Array.isArray(rawData) ? rawData : rawData.companies || [];
  };

  const cogsCompanies = getCompaniesArray("cogs_json");
  const sgaCompanies = getCompaniesArray("sga_json");
  const invCompanies = getCompaniesArray("inv_json");
  const revCompanies = getCompaniesArray("rev_json");

  // 🔹 NEW: generic peer-median builder from companies[pctField] (e.g., COGS_Revenue) for 3 FYs
  const buildPeerMedianFromCompanies = (companies, percentField) => {
    if (!Array.isArray(companies) || companies.length === 0) return {};
    const clientName =
      rawPeerData?.client_name || "Tata Consumer Products Limited";
    const peers = companies.filter((c) => c.name !== clientName);

    const yearKeys = Array.from(
      new Set(
        companies.flatMap((c) =>
          Object.keys(c[percentField] || {}).filter((k) => !/^CAGR$/i.test(k))
        )
      )
    ).sort();

    const result = {};
    yearKeys.forEach((yk) => {
      const vals = peers
        .map((c) => {
          const raw = c[percentField]?.[yk];
          if (!raw) return null;
          const n = parseFloat(String(raw).replace("%", ""));
          return Number.isNaN(n) ? null : n;
        })
        .filter((v) => v !== null)
        .sort((a, b) => a - b);
      if (!vals.length) return;
      const mid = Math.floor(vals.length / 2);
      const median =
        vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
      result[yk] = median;
    });
    return result;
  };

  // 🔹 Prefer explicit PeerMedian* keys from backend if present, else compute from companies
  const getPeerMedianSeries = (blockKey, companies, percentField) => {
    const block = rawPeerData[blockKey] || {};
    const fromBackend = Object.entries(block)
      .filter(([k]) => /^PeerMedian\s+FY-/i.test(k))
      .reduce((acc, [k, v]) => {
        const fyMatch = k.match(/(FY-\d{2}\/\d{4})/i);
        if (fyMatch) acc[fyMatch[1]] = v;
        return acc;
      }, {});
    const hasBackend = Object.keys(fromBackend).length > 0;
    if (hasBackend) return fromBackend;
    return buildPeerMedianFromCompanies(companies, percentField);
  };

  const cogsPeerMedian = getPeerMedianSeries(
    "cogsjson",
    cogsCompanies,
    "COGS_Revenue"
  ); // ✅ COGS/Revenue peer median series by FY[file:2]
  const sgaPeerMedian = getPeerMedianSeries(
    "sgajson",
    sgaCompanies,
    "SGA_Revenue"
  );
  const invPeerMedian = getPeerMedianSeries(
    "invjson",
    invCompanies,
    "Inventory_Revenue"
  );

  function mergeCOGSAndRevenueCompanies(cogsCompaniesParam, revCompaniesParam) {
    const revLookup = Object.fromEntries(
      (revCompaniesParam || []).map((rc) => [rc.name, rc])
    );
    return (cogsCompaniesParam || []).map((cogsCo) => {
      const revCo = revLookup[cogsCo.name];
      return revCo ? { ...cogsCo, Revenue_USD_mn: revCo.Revenue_USD_mn } : cogsCo;
    });
  }

  // ✅ Merge with revenue data and ensure companies array exists
  const mergedCOGSCompanies =
    cogsCompanies.length > 0 && revCompanies.length > 0
      ? mergeCOGSAndRevenueCompanies(cogsCompanies, revCompanies)
      : cogsCompanies;

  const mergedSGACompanies =
    sgaCompanies.length > 0 && revCompanies.length > 0
      ? mergeCOGSAndRevenueCompanies(sgaCompanies, revCompanies)
      : sgaCompanies;

  const mergedInvCompanies =
    invCompanies.length > 0 && revCompanies.length > 0
      ? mergeCOGSAndRevenueCompanies(invCompanies, revCompanies)
      : invCompanies;

  // ✅ Normalize insights: prefer non-empty array, else drill into data.insights
  let rawInsights = peerFinancialData?.insights;
  if (!rawInsights || (Array.isArray(rawInsights) && rawInsights.length === 0)) {
    const fromData =
      peerFinancialData?.data?.insights ||
      rawPeerData?.insights ||
      {};
    rawInsights = fromData;
  }

  const insightsArray = Array.isArray(rawInsights)
    ? rawInsights
    : Object.values(rawInsights || {}).filter(
        (v) => typeof v === "string" && v.trim()
      );

  // 🔹 merged*Data now carry PeerMedian in the exact shape GroupedBarChart expects
  const mergedCOGSData = {
    companies: mergedCOGSCompanies,
    data: {
      currency: rawPeerData.currency || "USD",
      PeerMedian: cogsPeerMedian, // ✅ company vs peer bars for COGS/Revenue (%)
    },
    PeerMedian: cogsPeerMedian,
    Peer_Median: cogsPeerMedian,
    insights: insightsArray,
    client_name: rawPeerData.client_name, // keep client name for labels
  };

  const mergedSGAData = {
    companies: mergedSGACompanies,
    data: {
      currency: rawPeerData.currency || "USD",
      PeerMedian: sgaPeerMedian,
    },
    PeerMedian: sgaPeerMedian,
    Peer_Median: sgaPeerMedian,
    insights: insightsArray,
    client_name: rawPeerData.client_name,
  };

  const mergedInvData = {
    companies: mergedInvCompanies,
    data: {
      currency: rawPeerData.currency || "USD",
      PeerMedian: invPeerMedian,
    },
    PeerMedian: invPeerMedian,
    Peer_Median: invPeerMedian,
    insights: insightsArray,
    client_name: rawPeerData.client_name,
  };

  const renderMaturitySpider = () => {
    const mappedAssessment =
      ASSESSMENT_TYPE_MAPPING?.[assessmentType] || assessmentType;

    if (loading) {
      return <Loader />;
    }

    if (error) {
      return (
        <div className="alert alert-danger">
          Error {typeof error === "object" ? JSON.stringify(error) : error}
        </div>
      );
    }

    if (!l1CapabilityTracking || !Array.isArray(l1CapabilityTracking)) {
      return (
        <div className="alert alert-warning">
          No maturity data available.
        </div>
      );
    }

    const categories = {};
    l1CapabilityTracking
      .filter((row) => row.Assessment === mappedAssessment)
      .forEach((row) => {
        const key = row["Level 1 Category"];
        if (!categories[key]) categories[key] = [];
        let val = Number(row.overall_score);
        if (isNaN(val)) val = 0;
        categories[key].push(val);
      });

    const spiderChartData = Object.entries(categories)
      .map(([axis, values]) => ({
        axis,
        value:
          values.length === 0
            ? 0
            : values.reduce((a, b) => a + b, 0) / values.length,
      }))
      .sort((a, b) => a.axis.localeCompare(b.axis));

    return (
      <MaturityDetail
        assessmentType={assessmentType}
        spiderChartData={spiderChartData}
        spiderLoading={loading}
        spiderError={error}
        l1Data={l1CapabilityTracking}
        l2Data={l1l2CapabilityTracking}
        recommendations={recommendations}
        keyObservations={keyObservations}
      />
    );
  };

  const tabContent = {
    Templates: [
      {
        title: "",
        description: (
          <FileUploadContainer
            user={user}
            surveyResponseFile={surveyResponseFile}
            roleDeptFile={roleDeptFile}
            sheetNames={sheetNames}
            selectedSheet={selectedSheet}
            setSelectedSheet={setSelectedSheet}
            handleSurveyResponseUpload={handleSurveyResponseUpload}
          />
        ),
      },
    ],

    "KPI-calculation": [
      {
        title: (
          <div>
            <KPICalculatorSingle
              selectedKPI={selectedKPI}
              onKPIChange={handleKPIChange}
            />
            {selectedKPI === "OTIF" && !trendlineLoading && (
              <div>OTIF Weekly & Monthly Trends</div>
            )}
          </div>
        ),

        description: (
          <div className="slide">
            {selectedKPI === "OTIF" ? (
              <>
                <div className="dropdown mb-4 viewassessment-dropdown">
                  <div className="row">
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Channel</label>
                      <select
                        className="form-select form-select-lg"
                        value={trendChannel === "All" ? "All" : trendChannel}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = val === "All" ? ["Overall"] : [val];
                          setTrendChannel(val);
                          setSelectedChannel(next);
                        }}
                      >
                        <option value="All">All</option>
                        {channelOptions
                          .filter((ch) => ch !== "Overall")
                          .map((ch) => (
                            <option key={ch} value={ch}>
                              {ch}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Product</label>
                      <select
                        className="form-select form-select-lg"
                        value={trendProductH1 === "All" ? "All" : trendProductH1}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = val === "All" ? ["Overall"] : [val];
                          setTrendProductH1(val);
                          setSelectedProductLevel1(next);
                        }}
                      >
                        <option value="All">All</option>
                        {productH1Options
                          .filter((opt) => opt !== "Overall")
                          .map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Brand</label>
                      <select
                        className="form-select form-select-lg"
                        value={trendBrand === "All" ? "All" : trendBrand}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = val === "All" ? ["Overall"] : [val];
                          setTrendBrand(val);
                          setSelectedBrand(next);
                        }}
                      >
                        <option value="All">All</option>
                        {brandH2Options
                          .filter((opt) => opt !== "Overall")
                          .map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="chart-section">
                  <h3>Weekly Trend</h3>
                  <WeeklyTrendLineChart
                    data={weeklyDataFromApi}
                    monthlyTrends={trendlineData?.monthly || []}
                  />
                </div>

                <div className="chart-section">
                  <h3>Monthly Trend</h3>
                  <MonthlyTrendLineChart
                    data={monthlyDataFromApi}
                    selectedChannel={trendChannel}
                    selectedProductH1={trendProductH1}
                    selectedBrandH2={trendBrand}
                  />
                </div>
              </>
            ) : (
              <div key="select-prompt">
                Please Select KPI to view trends.
              </div>
            )}
          </div>
        ),
      },
      {
        title: "OTIF Waterfall",
        description: (
          <div className="slide">
            {selectedKPI === "OTIF" ? (
              waterfallLoading ? (
                <Loader key="loading" />
              ) : error ? (
                <div key="error" className="alert alert-danger">
                  {error}
                </div>
              ) : (
                <OTIFWaterfallChart
                  clientData={waterfallData}
                  monthOptions={monthOptions}
                  channelOptions={channelOptions}
                  productOptions={productH1Options}
                  brandOptions={brandH2Options}
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  selectedChannel={selectedChannel}
                  setSelectedChannel={setSelectedChannel}
                  selectedProductLevel1={selectedProductLevel1}
                  setSelectedProductLevel1={setSelectedProductLevel1}
                  selectedBrand={selectedBrand}
                  setSelectedBrand={setSelectedBrand}
                />
              )
            ) : (
              <div key="select-prompt">
                Select a KPI (like OTIF) to load the corresponding chart and
                insights.
              </div>
            )}
          </div>
        ),
      },
      {
        title: "OTIF Heatmap",
        description: (
          <div className="slide">
            {selectedKPI === "OTIF" ? (
              <>
                <div className="dropdown mb-4 viewassessment-dropdown">
                  <label className="form-label fw-bold">
                    Business Granularity
                  </label>
                  <select
                    className="form-select form-select-lg"
                    value={heatmapGranularity}
                    onChange={(e) => setHeatmapGranularity(e.target.value)}
                  >
                    {GRANULARITIES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {heatmapLoading ? (
                  <Loader key="loading" />
                ) : heatmapError ? (
                  <div key="error" className="alert alert-danger">
                    {typeof heatmapError === "object"
                      ? JSON.stringify(heatmapError)
                      : heatmapError}
                  </div>
                ) : heatmapData &&
                  heatmapData.dimensions &&
                  heatmapData.month_order ? (
                  <OTIFHeatmapModalPreview
                    key="heatmap"
                    data={heatmapData}
                    granularity={heatmapGranularity}
                    isLoading={heatmapLoading}
                    error={heatmapError}
                    assessmentType={assessmentType}
                  />
                ) : (
                  <div key="warning" className="alert alert-warning">
                    No heatmap data available.
                  </div>
                )}
              </>
            ) : (
              <div key="select-prompt">
                Please select OTIF to view the heatmap.
              </div>
            )}
          </div>
        ),
      },
    ],

    "kpi-benchmarking": [
      {
        title: "KPI Benchmarking - Organization-Level KPIs",
        description: benchmarkingData?.benchmarkingOne?.isLoading ? (
          <Loader />
        ) : benchmarkingData?.benchmarkingOne?.error ? (
          <div className="alert alert-danger">
            Error loading KPI data {benchmarkingData.benchmarkingOne.error}
          </div>
        ) : (
          <KPICalculationScreen1
            clientData={benchmarkingData?.benchmarkingOne?.data}
            loading={benchmarkingData?.benchmarkingOne?.isLoading}
            error={benchmarkingData?.benchmarkingOne?.error}
            selectedKPI={selectedKPI}
            selectedKPIs={selectedKPIs}
            selectedFunction={selectedFunction}
          />
        ),
      },
      {
        title: "KPI Benchmarking - Multi-Select KPI Dashboard",
        description: benchmarkingData?.benchmarkingTwo?.isLoading ? (
          <Loader />
        ) : benchmarkingData?.benchmarkingTwo?.error ? (
          <div className="alert alert-danger">
            Error loading KPI data {benchmarkingData.benchmarkingTwo.error}
          </div>
        ) : (
          <KPICalculationScreen2
            key="content-branch"
            selectedKPIs={selectedKPIs}
            selectedFunction={selectedFunction}
            clientData={benchmarkingData?.benchmarkingTwo?.data}
            loading={benchmarkingData?.benchmarkingTwo?.isLoading}
            error={benchmarkingData?.benchmarkingTwo?.error}
          />
        ),
      },
    ],

    "maturity-assessment": [
      {
        title: "Detailed Heatmap by L1/L2",
        description: (
          <div className="container mt-4 px-0">
            <div className="dropdown mb-4 viewassessment-dropdown">
              <label htmlFor="functionSelect" className="form-label fw-bold">
                Function selection
              </label>
              <select
                id="functionSelect"
                className="form-select form-select-lg"
                value={assessmentType}
                onChange={(e) =>
                  handlers.handleAssessmentChange(e.target.value)
                }
              >
                <option value="Plan">Plan</option>
                <option value="Source">Source</option>
                <option value="Fulfil">Fulfil</option>
              </select>
            </div>
            {loading ? (
              <Loader key="loading" />
            ) : error ? (
              <div className="alert alert-danger">
                Error loading heatmap data:{" "}
                {typeof error === "object" ? JSON.stringify(error) : error}
              </div>
            ) : filteredHeatmapData.length > 0 ? (
              <HeatMap
                key="heatmap"
                data={filteredHeatmapData}
                columns={columns}
                assessmentType={assessmentType}
              />
            ) : (
              <div key="info" className="alert alert-info">
                No data to display for the selected function.
              </div>
            )}
          </div>
        ),
      },
      {
        title: `Drill Down - Maturity Spider of L1 categories - ${assessmentType}`,
        description: renderMaturitySpider(),
      },
    ],

    // ✅ Uses merged*Companies and merged*Data (with insightsArray)
    "peer-financial-analysis": [
      {
        title: "Peer COGS/Revenue Financial Analysis",
        description: peerFinancialData?.error ? (
          <div className="alert alert-danger">
            Fetch error {peerFinancialData.error}
          </div>
        ) : mergedCOGSCompanies.length > 0 ? (
          <PeerRevenueInventoryAnalysisToggle
            data={mergedCOGSData}
            loading={loading}
            error={error}
            metricType="cogs"
            metricLabel="COGS/Revenue"
            metricField="Revenue_USD_mn"
            inventoryField="COGS_USD_mn"
            percentField="COGS_Revenue"
            chartTitleLeft="Revenue (USD mn)"
            chartTitleRight="COGS (USD mn)"
            percentTitle="COGS/Revenue (%)"
          />
        ) : (
          <div className="alert alert-warning">
            No COGS/Revenue data available.
          </div>
        ),
      },
      {
        title: "Peer SGA/Revenue Financial Analysis",
        description: peerFinancialData?.error ? (
          <div className="alert alert-danger">
            Fetch error {peerFinancialData.error}
          </div>
        ) : mergedSGACompanies.length > 0 ? (
          <PeerRevenueInventoryAnalysisToggle
            data={mergedSGAData}
            loading={loading}
            error={error}
            metricType="sga"
            metricLabel="SGA/Revenue"
            metricField="Revenue_USD_mn"
            inventoryField="SGA_USD_mn"
            percentField="SGA_Revenue"
            chartTitleLeft="Revenue (USD mn)"
            chartTitleRight="SG&A (USD mn)"
            percentTitle="SG&A/Revenue (%)"
          />
        ) : (
          <div className="alert alert-warning">
            No SGA/Revenue data available.
          </div>
        ),
      },
      {
        title: "Peer Inventory/Revenue Financial Analysis",
        description: peerFinancialData?.error ? (
          <div className="alert alert-danger">
            Fetch error {peerFinancialData.error}
          </div>
        ) : mergedInvCompanies.length > 0 ? (
          <PeerRevenueInventoryAnalysisToggle
            data={mergedInvData}
            loading={loading}
            error={error}
            metricType="inv"
            metricLabel="Inventory/Revenue"
            metricField="Revenue_USD_mn"
            inventoryField="Inventory_USD_mn"
            percentField="Inventory_Revenue"
            chartTitleLeft="Revenue (USD mn)"
            chartTitleRight="Inventory (USD mn)"
            percentTitle="Inventory/Revenue (%)"
          />
        ) : (
          <div className="alert alert-warning">
            No Inventory/Revenue data available.
          </div>
        ),
      },
    ],

    recommendations: [
      {
        title: "Recommendations",
        description: (
          <div>
            <FunctionDropdown
              selected={assessmentType}
              onChange={handleAssessmentChange}
            />
            <RecommendationsChart
              data={recommendationsData}
              loading={loading}
              error={error}
              assessmentType={assessmentType}
            />
          </div>
        ),
      },
      {
        title: "Roadmap",
        description: (
          <React.Suspense fallback={<div>Loading roadmap...</div>}>
            <LazyGanttChartPage />
          </React.Suspense>
        ),
      },
    ],

    "business-case": [
      {
        title: "",
        description: (
          <BusinessCaseChart
            data={businessCaseData}
            overallPotentialSavings={overallPotentialSavings}
            loading={loading}
            error={error}
            refresh={user}
          />
        ),
      },
    ],

    "executive-summary": [
      {
        title: "",
        description: (
          <ExecutiveSummaryTab
            downloadedScreenshots={downloadedScreenshots}
            handleDownloadPdfClick={handleDownloadPdfClick}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            tooltip={tooltip}
            execSummaryData={execSummaryData}
            execLoading={execLoading}
            execError={execError}
            overallPotentialSavings={overallPotentialSavings}
            npvDataString={npvDataString}
          />
        ),
      },
      // {
      //   title: "SC Transformation Roadmap",
      //   description: (
      //     <SCTransformationAccordion
      //       recommendationsData={recommendationsData}
      //     />
      //   ),
      // },
    ],
  };

  const tabPages = Object.fromEntries(
    Object.entries(tabContent).map(([key, arr]) => [key, arr.length])
  );

  // 🔹 New meta to help caller control Back / Save & Continue
  const tabMeta = {
    Templates: {
      hideBackButton: true,           // parent can hide Back when this tab is active
      requireUploadedFiles: true,     // parent can disable Save & Continue until files exist
    },
  };

  return { tabContent, tabPages, tabMeta };
}


--

/* eslint-disable no-console */
import React, { useRef, useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { unlockTab } from "../slices/tabAccessSlice";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useLocation, useNavigate } from "react-router-dom";
import { useKPIBenchmarkingTab } from "../hooks/useKPIBenchmarkingTab";
import getTabConfig from "./assessmentTabs";
import Loader from "./common/Loader";
import { useUser } from "../components/usecontext/UserContext";
import "../assets/css/ViewAssessment.css";
import { skipToken } from "@reduxjs/toolkit/query";

import {
  useGetMaturityAssessmentQuery,
  useGetKpiCalculationQuery,
  useGetKpiWaterfallDataQuery,
  useGetKpiTrendlineDataQuery,
  useGetFinancialAnalysisQuery,
  useGetRecommendationsQuery,
  useGetBusinessCaseQuery,
  useGetExecutiveSummaryQuery,
  useGetKpiMonthsQuery,
  useGetKpiChannelsQuery,
  useGetKpiProductH1sQuery,
  useGetKpiBrandH2sQuery,
  setTokenGetter,
} from "../services/kpiApi";

const GRANULARITIES = [
  { label: "Product", value: "product_heirarchy_1-classification" },
  { label: "Category", value: "product_heirarchy_2-super_category" },
  { label: "Brand", value: "product_heirarchy_3-_brand" },
];

const ASSESSMENT_TYPE_MAPPING = {
  Plan: "Planning",
  Source: "Procurement",
  Fulfil: "Fulfillment",
};

function ViewAssessment({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const params = new URLSearchParams(location.search);
  const selectedTab = params.get("tab") || "Templates";
  const { getAccessToken } = useUser();

  // ✅ Register MSAL token getter globally for all kpiApi endpoints
  useEffect(() => {
    setTokenGetter(getAccessToken);
  }, [getAccessToken]);

  const unlockedTabs = useSelector((state) => state.tabAccess.unlockedTabs);
  // 🔹 Read uploaded files from Redux so we can control Save & Continue
  const uploadedFiles = useSelector(
    (state) => state.fileUpload?.files || []
  );
  const hasTemplateFiles = uploadedFiles.length > 0;

  const [visitedTabs, setVisitedTabs] = useState(new Set([selectedTab]));
  const [currentPage, setCurrentPage] = useState(1);
  const [surveyResponseFile, setSurveyResponseFile] = useState(null);
  const [roleDeptFile, setRoleDeptFile] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("Sheet1");
  const [sheetNames, setSheetNames] = useState([]);
  const [assessmentType, setAssessmentType] = useState("Plan");
  const [selectedKPI, setSelectedKPI] = useState("");
  const [selectedKPIs, setSelectedKPIs] = useState([]);
  const [selectedFunction, setSelectedFunction] = useState("");
  const [channelFilter, setChannelFilter] = useState("All");
  const [productH1Filter, setProductH1Filter] = useState("All");
  const [brandH2Filter, setBrandH2Filter] = useState("All");
  const [heatmapGranularity, setHeatmapGranularity] = useState(
    GRANULARITIES[0].value
  );

  // Interactive filters used by dropdowns + waterfall + trendline
  const [selectedMonth, setSelectedMonth] = useState(["Overall"]);
  const [selectedChannel, setSelectedChannel] = useState(["Overall"]);
  const [selectedProductLevel1, setSelectedProductLevel1] =
    useState(["Overall"]);
  const [selectedBrand, setSelectedBrand] = useState(["Overall"]);

  // Base filters used ONLY for /kpi-calculation (never changed on user filter)
  const [baseMonth, setBaseMonth] = useState(["Overall"]);
  const [baseChannel, setBaseChannel] = useState(["Overall"]);
  const [baseProductH1, setBaseProductH1] = useState(["Overall"]);
  const [baseBrandH2, setBaseBrandH2] = useState(["Overall"]);

  // ✅ Trends page local state
  const [trendChannel, setTrendChannel] = useState("All");
  const [trendProductH1, setTrendProductH1] = useState("All");
  const [trendBrand, setTrendBrand] = useState("All");

  const [downloadedScreenshots, setDownloadedScreenshots] = useState({});
  const [tooltip, setTooltip] = useState({
    visible: false,
    message: "",
    x: 0,
    y: 0,
  });

  const showTooltip = (e, message) => {
    const rect = e.target.getBoundingClientRect();
    let x = rect.right + 8;
    let y = rect.top + window.scrollY;
    const tooltipWidth = 260,
      margin = 16;
    if (x + tooltipWidth + margin > window.innerWidth) {
      x = rect.left - tooltipWidth - 8;
      if (x < margin) x = margin;
    }
    setTooltip({ visible: true, message, x, y });
  };
  const hideTooltip = () => setTooltip((t) => ({ ...t, visible: false }));

  const kpiCalculationRef = useRef(null);
  const kpiBenchmarkingRef = useRef(null);
  const maturityAssessmentRef = useRef(null);
  const peerFinancialRef = useRef(null);
  const recommendationsRef = useRef(null);
  const businessCaseRef = useRef(null);

  const tabRefs = {
    "KPI-calculation": kpiCalculationRef,
    "kpi-benchmarking": kpiBenchmarkingRef,
    "maturity-assessment": maturityAssessmentRef,
    "peer-financial-analysis": peerFinancialRef,
    recommendations: recommendationsRef,
    "business-case": businessCaseRef,
  };
  const downloadableTabs = Object.keys(tabRefs);

  // ✅ PAGE-SPECIFIC API CALLS - ONLY 1 CALL PER PAGE!
  const isKpiCalcActive = selectedTab === "KPI-calculation";

  // ✅ Base KPI Calculation (runs first on KPI tab with base filters)
  const shouldCallBaseKpiCalc = isKpiCalcActive && currentPage === 1;

  const kpiCalcArgs = {
    month: baseMonth,
    channel: baseChannel,
    productH1: baseProductH1,
    brandH2: baseBrandH2,
  };

  const {
    data: kpiCalcData,
    isLoading: kpiCalcLoading,
    isFetching: kpiCalcFetching,
    error: kpiCalcError,
  } = useGetKpiCalculationQuery(kpiCalcArgs, {
    skip: !shouldCallBaseKpiCalc,
  });

  // ✅ This flag controls other KPI calls (Waterfall, Trendline, dropdowns)
  const isKpiBaseReady = !!kpiCalcData && !kpiCalcLoading && !kpiCalcError;

  // Heatmap data is derived from kpiCalcData (no separate API call)
  const heatmapResponse = kpiCalcData?.heatmap || {};
  const heatmapApiLoading = kpiCalcLoading;
  const heatmapApiError = kpiCalcError;

  // ✅ Trendline (Page 1 only)
  const isTrendlinePage = isKpiCalcActive && currentPage === 1;
  const trendlineArgs = {
    month: selectedMonth.length ? selectedMonth : ["Overall"],
    channel: selectedChannel.length ? selectedChannel : ["Overall"],
    productH1: selectedProductLevel1.length ? selectedProductLevel1 : ["Overall"],
    brandH2: selectedBrand.length ? selectedBrand : ["Overall"],
  };
  const {
    data: trendlineData,
    isLoading: trendlineLoading,
    isFetching: trendlineFetching,
    error: trendlineError,
  } = useGetKpiTrendlineDataQuery(trendlineArgs, {
    skip: !isTrendlinePage || !isKpiBaseReady,
  });

  // ✅ Waterfall (Page 2 only)
  const isWaterfallPage = isKpiCalcActive && currentPage === 2;
  const waterfallArgs = {
    month: selectedMonth.length ? selectedMonth : ["Overall"],
    channel: selectedChannel.length ? selectedChannel : ["Overall"],
    productH1: selectedProductLevel1.length ? selectedProductLevel1 : ["Overall"],
    brandH2: selectedBrand.length ? selectedBrand : ["Overall"],
  };
  const {
    data: waterfallData,
    isLoading: waterfallLoading,
    isFetching: waterfallFetching,
    error: waterfallError,
  } = useGetKpiWaterfallDataQuery(waterfallArgs, {
    skip: !isWaterfallPage || !isKpiBaseReady,
  });

  // ✅ Cascading dropdowns via RTK Query
  const {
    data: monthApiOptions = [],
    isLoading: monthsLoading,
    isFetching: monthsFetching,
    error: monthsError,
  } = useGetKpiMonthsQuery(undefined, {
    skip: !isKpiCalcActive || !isKpiBaseReady,
  });

  const {
    data: channelApiOptions = [],
    isLoading: channelsLoading,
    isFetching: channelsFetching,
    error: channelsError,
  } = useGetKpiChannelsQuery(
    { month: selectedMonth },
    { skip: !isKpiCalcActive || !isKpiBaseReady }
  );

  const {
    data: productH1ApiOptions = [],
    isLoading: productH1Loading,
    isFetching: productH1Fetching,
    error: productH1Error,
  } = useGetKpiProductH1sQuery(
    { month: selectedMonth, channel: selectedChannel },
    { skip: !isKpiCalcActive || !isKpiBaseReady }
  );

  const {
    data: brandH2ApiOptions = [],
    isLoading: brandH2Loading,
    isFetching: brandH2Fetching,
    error: brandH2Error,
  } = useGetKpiBrandH2sQuery(
    { month: selectedMonth, channel: selectedChannel, productH1: selectedProductLevel1 },
    { skip: !isKpiCalcActive || !isKpiBaseReady }
  );

  const monthOptions = useMemo(
    () => ["Overall", ...monthApiOptions],
    [monthApiOptions]
  );
  const channelOptions = useMemo(
    () => ["Overall", ...channelApiOptions],
    [channelApiOptions]
  );
  const productH1Options = useMemo(
    () => ["Overall", ...productH1ApiOptions],
    [productH1ApiOptions]
  );
  const brandH2Options = useMemo(
    () => ["Overall", ...brandH2ApiOptions],
    [brandH2ApiOptions]
  );

  const dropdownLoading =
    monthsLoading || channelsLoading || productH1Loading || brandH2Loading;

  // ✅ KPI Benchmarking Tab (two screens)
  const isBenchActive = selectedTab === "kpi-benchmarking";
  const benchTwoPayload = useMemo(() => {
    if (!isBenchActive) return {};
    const urlParams = new URLSearchParams(location.search);
    const p = Object.fromEntries(urlParams.entries());
    const { tab, ...payload } = p;
    return payload;
  }, [location.search, isBenchActive]);

  const { screen1: benchOne, screen2: benchTwo } = useKPIBenchmarkingTab(
    isBenchActive,
    benchTwoPayload
  );

  const {
    data: benchmarkingOne,
    isLoading: benchOneLoading,
    isFetching: benchOneFetching,
    error: benchOneError,
  } = benchOne;

  const {
    data: benchmarkingTwo,
    isLoading: benchTwoLoading,
    isFetching: benchTwoFetching,
    error: benchTwoError,
  } = benchTwo;

  const isMaturityActive = selectedTab === "maturity-assessment";
  const {
    data: maturityData,
    isLoading: maturityLoading,
    isFetching: maturityFetching,
    error: maturityError,
  } = useGetMaturityAssessmentQuery(undefined, { skip: !isMaturityActive });

  const isPeerActive = selectedTab === "peer-financial-analysis";

  const {
    data: peerFinancialData,
    isLoading: peerLoading,
    isFetching: peerFetching,
    error: peerError,
  } = useGetFinancialAnalysisQuery(isPeerActive ? undefined : skipToken);

  const isRecActive = selectedTab === "recommendations";
  const {
    data: recRawData,
    isLoading: recLoading,
    isFetching: recFetching,
    error: recError,
  } = useGetRecommendationsQuery(undefined, { skip: !isRecActive });

  let recommendationsData = [];
  if (Array.isArray(recRawData?.recommendations)) {
    recommendationsData = recRawData.recommendations;
  } else if (Array.isArray(recRawData?.content)) {
    recommendationsData = recRawData.content;
  } else if (Array.isArray(recRawData)) {
    recommendationsData = recRawData;
  } else {
    recommendationsData = [];
  }

  const isBizActive = selectedTab === "business-case";
  const {
    data: bizRawData,
    isLoading: bizLoading,
    isFetching: bizFetching,
    error: bizError,
  } = useGetBusinessCaseQuery(undefined, { skip: !isBizActive });
  const businessCaseData = bizRawData?.business_case_data ?? [];
  const overallPotentialSavings = bizRawData?.overallPotentialSavings ?? null;
  const npvDataString = bizRawData?.npvDataString ?? null;

  const isExecActive = selectedTab === "executive-summary";
  const {
    data: execSummaryData,
    isLoading: execLoading,
    isFetching: execFetching,
    error: execError,
  } = useGetExecutiveSummaryQuery(undefined, { skip: !isExecActive });

  // ✅ useEffects
  useEffect(() => {
    setVisitedTabs((prev) => new Set([...prev, selectedTab]));
  }, [selectedTab]);

  useEffect(() => {
    if (isKpiCalcActive) {
      setSelectedMonth(["Overall"]);
      setSelectedChannel(["Overall"]);
      setSelectedProductLevel1(["Overall"]);
      setSelectedBrand(["Overall"]);

      setBaseMonth(["Overall"]);
      setBaseChannel(["Overall"]);
      setBaseProductH1(["Overall"]);
      setBaseBrandH2(["Overall"]);
    }
  }, [selectedTab, currentPage, isKpiCalcActive]);

  useEffect(() => {
    if (currentPage === 2 && isKpiCalcActive) {
      setTrendChannel(
        selectedChannel[0] === "Overall" ? "All" : selectedChannel[0]
      );
      setTrendProductH1(
        selectedProductLevel1[0] === "Overall"
          ? "All"
          : selectedProductLevel1[0]
      );
      setTrendBrand(selectedBrand[0] === "Overall" ? "All" : selectedBrand[0]);
    }
  }, [
    currentPage,
    selectedTab,
    selectedChannel,
    selectedProductLevel1,
    selectedBrand,
    isKpiCalcActive,
  ]);

  useEffect(() => {
    if (selectedTab === "recommendations") setAssessmentType("Plan");
  }, [selectedTab]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedKPIs([]);
    setSelectedFunction("");
    setChannelFilter("All");
    setProductH1Filter("All");
    setBrandH2Filter("All");
    setHeatmapGranularity(GRANULARITIES[0].value);
    if (selectedTab !== "maturity-assessment") {
      setSurveyResponseFile(null);
      setRoleDeptFile(null);
      setSheetNames([]);
    }
  }, [selectedTab]);

  useEffect(() => {
    if (!unlockedTabs.includes(selectedTab)) {
      const lastUnlocked =
        unlockedTabs[unlockedTabs.length - 1] || "Templates";
      if (lastUnlocked !== selectedTab) {
        navigate(`?tab=${lastUnlocked}`, { replace: true });
      }
    }
  }, [selectedTab, unlockedTabs, navigate]);

  // ──────────────────────────────  HEATMAP LOGIC  ────────────────────────────────────
  const { columns, filteredHeatmapData } = useMemo(() => {
    const data = (() => {
      if (
        selectedTab === "maturity-assessment" &&
        maturityData?.l1l2CapabilityTracking
      ) {
        const mappedType =
          ASSESSMENT_TYPE_MAPPING[assessmentType] || assessmentType;
        return maturityData.l1l2CapabilityTracking.filter(
          (item) => item.Assessment === mappedType
        );
      }
      return [];
    })();

    if (!data.length) return { columns: [], filteredHeatmapData: [] };

    const grouped = {};
    data.forEach((row) => {
      const col = row["Level 1 Category"];
      if (!grouped[col]) grouped[col] = [];
      grouped[col].push({
        name: row["Level 2 Category"] ?? "",
        score:
          typeof row["l2_current_state"] === "number"
            ? row["l2_current_state"]
            : null,
      });
    });

    const columnNames = Object.keys(grouped);
    const maxRows = Math.max(...columnNames.map((col) => grouped[col].length));
    const structuredRows = Array.from({ length: maxRows }, (_, i) =>
      Object.fromEntries(
        columnNames.map((col) => [
          col,
          grouped[col][i] || { name: "", score: null },
        ])
      )
    );

    return { columns: columnNames, filteredHeatmapData: structuredRows };
  }, [selectedTab, maturityData, assessmentType]);

  // ──────────────────────────────  UTILS  ─────────────────────────────────────

  const handleKPIChange = ({ kpi, function: func }) => {
    if (Array.isArray(kpi)) setSelectedKPIs(kpi);
    else setSelectedKPI(kpi || "");
    setSelectedFunction(func || "");
  };

  const handleMarkAsDownload = async (tabKey) => {
    const ref = tabRefs[tabKey];
    if (!ref?.current) return;
    const canvas = await html2canvas(ref.current, {
      useCORS: true,
      backgroundColor: "#fff",
    });
    const imgData = canvas.toDataURL("image/png");
    setDownloadedScreenshots((prev) => ({ ...prev, [tabKey]: imgData }));
    alert("Tab content marked for download.");
  };

  const handleDownloadPdfClick = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const tabOrder = downloadableTabs;
    let added = false;
    tabOrder.forEach((key) => {
      if (downloadedScreenshots[key]) {
        if (added) doc.addPage();
        doc.addImage(downloadedScreenshots[key], "PNG", 10, 10, 190, 277);
        added = true;
      }
    });
    if (!added) {
      alert("No tabs have been marked for download yet!");
      return;
    }
    doc.save("Detailed_Report.pdf");
  };

  const tabConfig = getTabConfig({
    state: {
      assessmentType,
      selectedKPI,
      selectedKPIs,
      selectedFunction,
      surveyResponseFile,
      roleDeptFile,

      sheetNames,
      selectedSheet,
      setSelectedSheet,
      handleSurveyResponseUpload: (e) =>
        setSurveyResponseFile(e.target.files[0]),
      waterfallData,
      waterfallLoading,
      monthOptions,
      channelOptions,
      productH1Options,
      brandH2Options,
      channelFilter,
      setChannelFilter,
      productH1Filter,
      setProductH1Filter,
      brandH2Filter,
      setBrandH2Filter,
      selectedMonth,
      setSelectedMonth,
      selectedChannel,
      setSelectedChannel,
      selectedProductLevel1,
      setSelectedProductLevel1,
      selectedBrand,
      setSelectedBrand,
      heatmapGranularity,
      setHeatmapGranularity,
      heatmapData: heatmapResponse,
      heatmapLoading: heatmapApiLoading,
      heatmapError: heatmapApiError,
      l1CapabilityTracking: maturityData?.l1CapabilityTracking,
      l1l2CapabilityTracking: maturityData?.l1l2CapabilityTracking,
      recommendations: maturityData?.recommendations,
      columns,
      filteredHeatmapData,
      peerFinancialData,
      downloadedScreenshots,
      businessCaseData,
      overallPotentialSavings,
      npvDataString,
      GRANULARITIES,
      ASSESSMENT_TYPE_MAPPING,
      recommendationsData,
      benchmarkingData: { benchmarkingOne, benchmarkingTwo },
      execSummaryData,
      execLoading,
      execError,
      trendlineData,
      trendlineLoading,
      trendlineError,
      trendChannel,
      setTrendChannel,
      trendProductH1,
      setTrendProductH1,
      trendBrand,
      setTrendBrand,
    },
    handlers: {
      handleKPIChange,
      handleAssessmentChange: setAssessmentType,
    },
    meta: { showTooltip, hideTooltip, tooltip },
    user,
  });

  const { tabContent, tabPages, tabMeta } = tabConfig;
  const totalPages = tabPages[selectedTab] || 1;

  useEffect(() => window.scrollTo(0, 0), [selectedTab, currentPage]);

  // ✅ Sequential Save & Continue: when finishing a tab, unlock ONLY the next tab
  const handleSaveContinue = () => {
    if (currentPage === totalPages) {
      const tabs = Object.keys(tabPages);
      const currentIndex = tabs.indexOf(selectedTab);

      const nextIndex = currentIndex + 1;
      if (nextIndex < tabs.length) {
        const nextTab = tabs[nextIndex];

        if (!unlockedTabs.includes(nextTab)) {
          dispatch(unlockTab(nextTab));
        }
        navigate(`?tab=${nextTab}`);
      } else {
        navigate(`?tab=${tabs[currentIndex]}`);
      }
    } else {
      setCurrentPage(currentPage + 1);
    }
  };

  const capitalizeFirstLetter = (str) =>
    str
      .replace(/-/g, " ")
      .split(" ")
      .map((word) =>
        word.toUpperCase() === "KPI"
          ? "KPI"
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

  const renderTabContent = () => {
    const dropdownFetching =
      monthsFetching || channelsFetching || productH1Fetching || brandH2Fetching;

    const hasPeerFinancialData = !!peerFinancialData; // ✅ use cache presence

    const loading =
      kpiCalcLoading ||
      kpiCalcFetching ||
      waterfallLoading ||
      waterfallFetching ||
      trendlineLoading ||
      trendlineFetching ||
      heatmapApiLoading ||
      benchOneLoading ||
      benchOneFetching ||
      benchTwoLoading ||
      benchTwoFetching ||
      maturityLoading ||
      maturityFetching ||
      (!hasPeerFinancialData && (peerLoading || peerFetching)) || // ✅ only gate when no cache
      recLoading ||
      recFetching ||
      bizLoading ||
      bizFetching ||
      execLoading ||
      execFetching ||
      dropdownLoading ||
      dropdownFetching;

    const error =
      kpiCalcError ||
      waterfallError ||
      trendlineError ||
      heatmapApiError ||
      benchOneError ||
      benchTwoError ||
      maturityError ||
      peerError ||
      recError ||
      bizError ||
      execError ||
      monthsError ||
      channelsError ||
      productH1Error ||
      brandH2Error;

    if (loading) {
      return (
        <div
          className="loader-container"
          style={{ textAlign: "center", marginTop: "50px" }}
        >
          <Loader />
        </div>
      );
    }

    if (error) {
      return (
        <div className="alert alert-danger">
          Error loading data:{" "}
          {typeof error === "object" ? JSON.stringify(error) : error}.
          <button
            onClick={() => navigate(`?tab=${selectedTab}`)}
            className="btn btn-sm btn-secondary ms-2"
            type="button"
          >
            Retry
          </button>
        </div>
      );
    }

    const currentTabMeta = tabMeta?.[selectedTab] || {};
    const hideBackButton = currentTabMeta.hideBackButton === true;
    const requireFiles = currentTabMeta.requireUploadedFiles === true;
    const disableSaveOnThisTab =
      selectedTab === "Templates" && requireFiles && !hasTemplateFiles;

    return (
      <>
        <div
          className="tab-heading"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "15px"
          }}
        >
          {capitalizeFirstLetter(selectedTab.replace(/-/g, " "))}
          {downloadableTabs.includes(selectedTab) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => handleMarkAsDownload(selectedTab)}
                className="btn btn-primary"
                disabled={!!downloadedScreenshots[selectedTab]}
                onMouseEnter={(e) =>
                  showTooltip(
                    e,
                    downloadedScreenshots[selectedTab]
                      ? "Tab already marked"
                      : "Mark this tab for PDF export"
                  )
                }
                onMouseLeave={hideTooltip}
                style={
                  downloadedScreenshots[selectedTab] ? { opacity: 0.65 } : {}
                }
                type="button"
              >
                {downloadedScreenshots[selectedTab] ? "Marked" : "Mark as Download"}
              </button>
              {selectedTab === "executive-summary" && (
                <button
                  onClick={handleDownloadPdfClick}
                  className="btn btn-success"
                  style={{ marginLeft: 8 }}
                  type="button"
                >
                  Download Detailed Report (PDF)
                </button>
              )}
            </div>
          )}
        </div>

        <div className="page-content">
          {tabContent[selectedTab]?.[currentPage - 1] ? (
            <div className="container mt-4 px-0">
              {downloadableTabs.includes(selectedTab) ? (
                <div ref={tabRefs[selectedTab]}>
                  {tabContent[selectedTab][currentPage - 1].title && (
                    <h3>{tabContent[selectedTab][currentPage - 1].title}</h3>
                  )}
                  <div>
                    {tabContent[selectedTab][currentPage - 1].description}
                  </div>
                </div>
              ) : (
                <>
                  {tabContent[selectedTab][currentPage - 1].title && (
                    <h3>{tabContent[selectedTab][currentPage - 1].title}</h3>
                  )}
                  <div>
                    {tabContent[selectedTab][currentPage - 1].description}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="alert alert-info">
              No content available for this tab.
            </div>
          )}
        </div>

        <div className="pagination-controls">
          {/* Left side: Back (hidden on Templates) */}
          <div className="pagination-left">
            {!hideBackButton && (
              <button
                onClick={() => {
                  if (currentPage === 1) {
                    const tabs = Object.keys(tabPages);
                    const prevIndex =
                      (tabs.indexOf(selectedTab) - 1 + tabs.length) % tabs.length;
                    navigate(`?tab=${tabs[prevIndex]}`);
                  } else {
                    setCurrentPage(currentPage - 1);
                  }
                }}
                className="btn back-button"
                type="button"
              >
                Back
              </button>
            )}
          </div>

          {/* Right side: Save & Continue */}
          <div className="pagination-right">
            {currentPage === totalPages ? (
              <button
                onClick={handleSaveContinue}
                className="btn save-button"
                type="button"
                disabled={disableSaveOnThisTab}
                title={
                  disableSaveOnThisTab
                    ? "Upload at least one template before continuing."
                    : ""
                }
              >
                Save &amp; Continue
              </button>
            ) : (
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                className="btn save-button"
                type="button"
                disabled={disableSaveOnThisTab}
                title={
                  disableSaveOnThisTab
                    ? "Upload at least one template before continuing."
                    : ""
                }
              >
                Save &amp; Continue
              </button>
            )}
          </div>
        </div>

        {tooltip.visible && (
          <div
            className="custom-tooltip"
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              zIndex: 9999,
              background: "#222",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 14,
              maxWidth: 260,
            }}
          >
            {tooltip.message}
          </div>
        )}
      </>
    );
  };

    return (
    <div className="assessment-launcher">
      <div className="view-assessment-container container p-0 overflow-hidden">
        {/* Added d-flex wrapper here instead of mixing row and container */}
        <div className="d-flex flex-column flex-lg-row w-100">
          
          <div className="tabs view-assessment-tabs col-12 col-lg-3">
            {Object.keys(tabPages).map((tab) => {
              const isUnlocked = unlockedTabs.includes(tab);
              const isActive = selectedTab === tab;
              const isVisited = visitedTabs.has(tab) && selectedTab !== tab;

              return (
                <button
                  key={tab}
                  className={`tab
                  ${isActive ? "active" : ""}
                  ${isVisited ? "focus" : ""}
                  ${!isUnlocked ? "tab-disabled" : ""}`.replace(/\s+/g, " ")}
                  onClick={() => {
                    if (!isUnlocked) return;
                    navigate(`?tab=${tab}`);
                  }}
                  disabled={!isUnlocked}
                  title={
                    isUnlocked
                      ? ""
                      : "Complete previous steps before accessing this tab."
                  }
                  type="button"
                >
                  {capitalizeFirstLetter(tab.replace(/-/g, " "))}
                </button>
              );
            })}
          </div>
          
          <div className="tab-content col-12 col-lg-9">
            {renderTabContent()}
          </div>
          
        </div>
      </div>
    </div>
  );
}

export default ViewAssessment;
 