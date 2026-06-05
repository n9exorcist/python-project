// SAST fixes carried forward:
//   (1) getSafeErrorMessage() — CWE-209 Information Exposure
//   (2) JSON.stringify(error) replaced throughout
//   (3) Raw error objects never rendered in JSX
//   (4) peerFinancialData.error rendered safely
//   (5) Benchmarking errors rendered safely
//   (6) heatmapError rendered safely
//   (7) Maturity spider error rendered safely
//
// NEW fix in this version:
//   (8) CWE-1321 Prototype Pollution — getPeerMedianSeries()
//       Root cause: `acc[fyMatch[1]] = v` writes a regex-captured key
//       (derived from API response data) directly into a plain object
//       accumulator.  If the API response contains a key whose regex
//       match group resolves to "__proto__", "constructor", or "prototype",
//       this pollutes Object.prototype for the entire application.
//
//       Fix: guard every dynamic key assignment with a hasOwnProperty-safe
//       check using Object.prototype.hasOwnProperty via a local helper, and
//       reject any key that matches the known prototype-pollution sinks.
//       Additionally use Object.create(null) for the accumulator so it has
//       NO prototype at all — pollution is structurally impossible.

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

const LazyGanttChartPage = React.lazy(
  () => import("../components/pages/GanttChartPage"),
);

// ---------------------------------------------------------------------------
// CWE-209 fix — Centralised safe error message helper.
// RTK Query errors: { status, data: { message } }.
// Plain strings returned as-is. Objects sanitised to a safe message.
// ---------------------------------------------------------------------------
function getSafeErrorMessage(err) {
  if (!err) return "An unexpected error occurred.";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    return (
      err?.data?.message ||
      (typeof err?.status === "number"
        ? `Request failed with status ${err.status}.`
        : null) ||
      "An unexpected error occurred."
    );
  }
  return "An unexpected error occurred.";
}

// ---------------------------------------------------------------------------
// CWE-1321 fix — Prototype-pollution-safe key guard.
//
// WHY Object.create(null) IS NOT ENOUGH ON ITS OWN:
//   Even with a null-prototype accumulator the value `v` (from the API
//   response) is still written under a key derived from user/API-controlled
//   data.  AppScan traces the taint through the regex match group all the
//   way to the assignment.  The explicit key-safety check below breaks the
//   taint chain at the assignment site.
//
// SAFE_KEY_RE: allows only the FY date format the regex is designed to
// capture (e.g. "FY-24/2024").  Any other string — including "__proto__",
// "constructor", "prototype" — is rejected before the assignment.
// ---------------------------------------------------------------------------
const SAFE_KEY_RE = /^FY-\d{2}\/\d{4}$/;

/**
 * Returns true only when `key` is a known-safe string for use as an object
 * property name — i.e., it matches the expected FY date format AND is not
 * one of the well-known prototype-pollution sinks.
 */
function isSafeObjectKey(key) {
  if (typeof key !== "string") return false;
  // Explicit blocklist — defence-in-depth on top of the allowlist below.
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    return false;
  }
  // Allowlist: only accept the canonical "FY-YY/YYYY" format.
  return SAFE_KEY_RE.test(key);
}

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
        rec.category
          ?.toLowerCase()
          .includes(assessmentTypeValue.toLowerCase()) ||
        rec.term?.toLowerCase().includes(assessmentTypeValue.toLowerCase()),
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
    assessmentTypeString,
  );

  // Handle backend structure where *_json = companies array directly
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

  // Generic peer-median builder from companies[pctField] for 3 FYs
  const buildPeerMedianFromCompanies = (companies, percentField) => {
    if (!Array.isArray(companies) || companies.length === 0) return {};
    const clientName =
      rawPeerData?.client_name || "Tata Consumer Products Limited";
    const peers = companies.filter((c) => c.name !== clientName);

    const yearKeys = Array.from(
      new Set(
        companies.flatMap((c) =>
          Object.keys(c[percentField] || {}).filter((k) => !/^CAGR$/i.test(k)),
        ),
      ),
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

  // ---------------------------------------------------------------------------
  // CWE-1321 fix applied here — getPeerMedianSeries()
  //
  // Original vulnerable pattern (line 235 in the pre-fix file):
  //   .reduce((acc, [k, v]) => {
  //     const fyMatch = k.match(/(FY-\d{2}\/\d{4})/i);
  //     if (fyMatch) acc[fyMatch[1]] = v;   ← PROTOTYPE POLLUTION SINK
  //     return acc;
  //   }, {});
  //
  // AppScan taint trace:
  //   peerFinancialData (API response, user-controlled)
  //     → rawPeerData[blockKey]
  //     → Object.entries(block)
  //     → k (object key from API data)
  //     → fyMatch[1] (regex capture group — still tainted)
  //     → acc[fyMatch[1]] = v   ← SINK
  //
  // Two-layer fix:
  //   1. Use Object.create(null) for the accumulator — it has NO prototype,
  //      so __proto__ pollution is structurally impossible on the accumulator
  //      itself.
  //   2. Call isSafeObjectKey(fyMatch[1]) before every assignment — breaks
  //      the taint chain at the sink and explicitly blocks all
  //      prototype-pollution sink names (__proto__ / constructor / prototype).
  //      AppScan recognises this as sanitisation because the assignment only
  //      occurs inside the truthy branch of the validation function.
  // ---------------------------------------------------------------------------
  const getPeerMedianSeries = (blockKey, companies, percentField) => {
    const block = rawPeerData[blockKey] || {};

    const fromBackend = Object.entries(block)
      .filter(([k]) => /^PeerMedian\s+FY-/i.test(k))
      .reduce((acc, [k, v]) => {
        const fyMatch = k.match(/(FY-\d{2}\/\d{4})/i);
        if (fyMatch) {
          const candidateKey = fyMatch[1];
          // CWE-1321 fix: validate key against strict allowlist before
          // any assignment — breaks AppScan taint chain at the sink.
          if (isSafeObjectKey(candidateKey)) {
            acc[candidateKey] = v; // safe: accumulator has null prototype
          }
        }
        return acc;
      }, Object.create(null)); // CWE-1321 fix: null-prototype accumulator

    const hasBackend = Object.keys(fromBackend).length > 0;
    if (hasBackend) {
      // Convert null-prototype object to a regular object for downstream consumers.
      return Object.assign({}, fromBackend);
    }
    return buildPeerMedianFromCompanies(companies, percentField);
  };

  const cogsPeerMedian = getPeerMedianSeries(
    "cogsjson",
    cogsCompanies,
    "COGS_Revenue",
  );
  const sgaPeerMedian = getPeerMedianSeries(
    "sgajson",
    sgaCompanies,
    "SGA_Revenue",
  );
  const invPeerMedian = getPeerMedianSeries(
    "invjson",
    invCompanies,
    "Inventory_Revenue",
  );

  function mergeCOGSAndRevenueCompanies(cogsCompaniesParam, revCompaniesParam) {
    const revLookup = Object.fromEntries(
      (revCompaniesParam || []).map((rc) => [rc.name, rc]),
    );
    return (cogsCompaniesParam || []).map((cogsCo) => {
      const revCo = revLookup[cogsCo.name];
      return revCo
        ? { ...cogsCo, Revenue_USD_mn: revCo.Revenue_USD_mn }
        : cogsCo;
    });
  }

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

  // Normalize insights: prefer non-empty array, else drill into data.insights
  let rawInsights = peerFinancialData?.insights;
  if (
    !rawInsights ||
    (Array.isArray(rawInsights) && rawInsights.length === 0)
  ) {
    const fromData =
      peerFinancialData?.data?.insights || rawPeerData?.insights || {};
    rawInsights = fromData;
  }

  const insightsArray = Array.isArray(rawInsights)
    ? rawInsights
    : Object.values(rawInsights || {}).filter(
        (v) => typeof v === "string" && v.trim(),
      );

  // merged*Data carry PeerMedian in the exact shape GroupedBarChart expects
  const mergedCOGSData = {
    companies: mergedCOGSCompanies,
    data: {
      currency: rawPeerData.currency || "USD",
      PeerMedian: cogsPeerMedian,
    },
    PeerMedian: cogsPeerMedian,
    Peer_Median: cogsPeerMedian,
    insights: insightsArray,
    client_name: rawPeerData.client_name,
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
      // CWE-209 fix — raw error object never passed to JSX; sanitised message only.
      return (
        <div className="alert alert-danger" role="alert">
          {getSafeErrorMessage(error)}
        </div>
      );
    }

    if (!l1CapabilityTracking || !Array.isArray(l1CapabilityTracking)) {
      return (
        <div className="alert alert-warning">No maturity data available.</div>
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
              <div>OTIF Weekly &amp; Monthly Trends</div>
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
                        value={
                          trendProductH1 === "All" ? "All" : trendProductH1
                        }
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
              <div key="select-prompt">Please Select KPI to view trends.</div>
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
                // CWE-209 fix — raw error never interpolated; sanitised string only.
                <div key="error" className="alert alert-danger" role="alert">
                  {getSafeErrorMessage(error)}
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
                  // CWE-209 fix — heatmapError sanitised.
                  <div key="error" className="alert alert-danger" role="alert">
                    {getSafeErrorMessage(heatmapError)}
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
          // CWE-209 fix — benchmarking error sanitised.
          <div className="alert alert-danger" role="alert">
            {getSafeErrorMessage(benchmarkingData.benchmarkingOne.error)}
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
          // CWE-209 fix — benchmarking error sanitised.
          <div className="alert alert-danger" role="alert">
            {getSafeErrorMessage(benchmarkingData.benchmarkingTwo.error)}
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
              // CWE-209 fix — JSON.stringify(error) replaced with getSafeErrorMessage().
              <div className="alert alert-danger" role="alert">
                {getSafeErrorMessage(error)}
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

    // Uses merged*Companies and merged*Data (with insightsArray)
    "peer-financial-analysis": [
      {
        title: "Peer COGS/Revenue Financial Analysis",
        description: peerFinancialData?.error ? (
          // CWE-209 fix — peerFinancialData.error sanitised.
          <div className="alert alert-danger" role="alert">
            {getSafeErrorMessage(peerFinancialData.error)}
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
          // CWE-209 fix — peerFinancialData.error sanitised.
          <div className="alert alert-danger" role="alert">
            {getSafeErrorMessage(peerFinancialData.error)}
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
            chartTitleRight="SG&amp;A (USD mn)"
            percentTitle="SG&amp;A/Revenue (%)"
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
          // CWE-209 fix — peerFinancialData.error sanitised.
          <div className="alert alert-danger" role="alert">
            {getSafeErrorMessage(peerFinancialData.error)}
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
    Object.entries(tabContent).map(([key, arr]) => [key, arr.length]),
  );

  // Tab meta to help caller control Back / Save & Continue behaviour
  const tabMeta = {
    Templates: {
      hideBackButton: true,
      requireUploadedFiles: true,
    },
  };

  return { tabContent, tabPages, tabMeta };
}
