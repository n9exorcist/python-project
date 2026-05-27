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

const LazyGanttChartPage = React.lazy(
  () => import("../components/pages/GanttChartPage"),
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
    "COGS_Revenue",
  ); // ✅ COGS/Revenue peer median series by FY[file:2]
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
    Object.entries(tabContent).map(([key, arr]) => [key, arr.length]),
  );

  // 🔹 New meta to help caller control Back / Save & Continue
  const tabMeta = {
    Templates: {
      hideBackButton: true, // parent can hide Back when this tab is active
      requireUploadedFiles: true, // parent can disable Save & Continue until files exist
    },
  };

  return { tabContent, tabPages, tabMeta };
}
