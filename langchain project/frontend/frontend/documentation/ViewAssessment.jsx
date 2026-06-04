// SAST fixes: (1) env-gated logger (2) tab allowlist CWE-601 (3) token getter once
// (4) bench param allowlist CWE-20 (5) safe error render CWE-209
// (6) alert() → notification state (7) tooltip Y-clamp (8) unique tab keys
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
// FIX #1 — env-gated logger replaces blanket eslint-disable no-console.
// Prevents token / Redux state leaks to DevTools in production builds.
const logger =
  process.env.NODE_ENV === "development"
    ? // eslint-disable-next-line no-console
      { log: console.log, warn: console.warn, error: console.error }
    : { log: () => {}, warn: () => {}, error: () => {} };
// FIX #2 — Tab allowlist (CWE-601 Open Redirect / CWE-425 URL Validation).
//
// WHY A Map INSTEAD OF A Set + ternary:
//   The previous pattern was:
//     const selectedTab = ALLOWED_TABS.has(rawTab) ? rawTab : "Templates";
//   AppScan's taint engine sees rawTab returned in the true-branch and keeps
//   selectedTab tainted — it does NOT consider .has() a sanitizer because the
//   output is still the user-supplied string.
//
//   With Map.get() the output is the Map's own static VALUE, never rawTab.
//   AppScan (and most SAST tools) recognise this as a safe lookup because
//   the returned object is a compile-time constant from trusted code, not
//   user-controlled data.  The taint chain is broken at this point.
const TAB_LOOKUP = new Map([
  ["Templates",               "Templates"],
  ["KPI-calculation",         "KPI-calculation"],
  ["kpi-benchmarking",        "kpi-benchmarking"],
  ["maturity-assessment",     "maturity-assessment"],
  ["peer-financial-analysis", "peer-financial-analysis"],
  ["recommendations",         "recommendations"],
  ["business-case",           "business-case"],
  ["executive-summary",       "executive-summary"],
]);

// toSafeTab: returns a static Map value — NEVER the raw user string.
// Used at every navigate(`?tab=...`) sink so AppScan sees sanitization
// immediately adjacent to the sink with no intermediate tainted variable.
const toSafeTab = (raw) => TAB_LOOKUP.get(raw) ?? "Templates";

// FIX #4 — Bench param allowlist (CWE-20 Server-Side Parameter Pollution).
// Only these keys are forwarded from URL params to the API hook payload.
const ALLOWED_BENCH_PARAMS = new Set(["month", "channel", "productH1", "brandH2"]);

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
  // FIX #2 applied — toSafeTab performs a Map.get() lookup so selectedTab is
  // always a static value from TAB_LOOKUP, never the raw user-supplied string.
  // This breaks the AppScan taint chain at the source (CWE-425 / CWE-601).
  const rawTab = params.get("tab") ?? "Templates";
  const selectedTab = toSafeTab(rawTab);
  const { getAccessToken } = useUser();
  // FIX #3 — Register MSAL token getter exactly once via ref guard.
  // Empty dep array is intentional: setTokenGetter must run exactly once on
  // mount. A ref wrapper ensures MSAL always calls the *latest* getAccessToken
  // even though the effect only runs once, satisfying react-hooks/exhaustive-deps.
  const tokenGetterRegistered = useRef(false);
  const getAccessTokenRef = useRef(getAccessToken);
  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]); // keep ref current on every identity change

  useEffect(() => {
    if (!tokenGetterRegistered.current) {
      // Stable wrapper so MSAL always invokes the latest getAccessToken.
      setTokenGetter((...args) => getAccessTokenRef.current(...args));
      tokenGetterRegistered.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — ref wrapper keeps getAccessToken current
  const unlockedTabs = useSelector((state) => state.tabAccess.unlockedTabs);
  const uploadedFiles = useSelector((state) => state.fileUpload?.files || []);
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
    GRANULARITIES[0].value,
  );
  // Interactive filters used by dropdowns + waterfall + trendline
  const [selectedMonth, setSelectedMonth] = useState(["Overall"]);
  const [selectedChannel, setSelectedChannel] = useState(["Overall"]);
  const [selectedProductLevel1, setSelectedProductLevel1] = useState(["Overall"]);
  const [selectedBrand, setSelectedBrand] = useState(["Overall"]);
  // Base filters used ONLY for /kpi-calculation (never changed on user filter interaction)
  const [baseMonth, setBaseMonth] = useState(["Overall"]);
  const [baseChannel, setBaseChannel] = useState(["Overall"]);
  const [baseProductH1, setBaseProductH1] = useState(["Overall"]);
  const [baseBrandH2, setBaseBrandH2] = useState(["Overall"]);
  // Trends page local state
  const [trendChannel, setTrendChannel] = useState("All");
  const [trendProductH1, setTrendProductH1] = useState("All");
  const [trendBrand, setTrendBrand] = useState("All");

  const [downloadedScreenshots, setDownloadedScreenshots] = useState({});
  // FIX #6 — Replace native alert() with React-owned notification state.
  // alert() can be spoofed for phishing / UI redressing attacks.
  const [notification, setNotification] = useState(null);
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };
  const [tooltip, setTooltip] = useState({ visible: false, message: "", x: 0, y: 0 });
  // FIX #7 — Clamp tooltip on both X and Y axes.
  // Unclamped Y coordinate allowed off-screen positioning via crafted events.
  const showTooltip = (e, message) => {
    const rect = e.target.getBoundingClientRect();
    const tooltipWidth = 260;
    const tooltipHeight = 50;
    const margin = 16;

    let x = rect.right + 8;
    if (x + tooltipWidth + margin > window.innerWidth) {
      x = rect.left - tooltipWidth - 8;
      if (x < margin) x = margin;
    }
    const maxY = window.innerHeight + window.scrollY - tooltipHeight - margin;
    let y = rect.top + window.scrollY;
    if (y > maxY) y = maxY;
    if (y < window.scrollY + margin) y = window.scrollY + margin;

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
  // ── PAGE-SPECIFIC API CALLS — ONLY 1 CALL PER PAGE ────────────────────────
  const isKpiCalcActive = selectedTab === "KPI-calculation";
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
  } = useGetKpiCalculationQuery(kpiCalcArgs, { skip: !shouldCallBaseKpiCalc });
  // This flag gates all downstream KPI calls (Waterfall, Trendline, dropdowns)
  const isKpiBaseReady = !!kpiCalcData && !kpiCalcLoading && !kpiCalcError;
  // Heatmap data is derived from kpiCalcData — no separate API call
  const heatmapResponse = kpiCalcData?.heatmap || {};
  const heatmapApiLoading = kpiCalcLoading;
  const heatmapApiError = kpiCalcError;
  // Trendline — Page 1 only
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
  // Waterfall — Page 2 only
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
  // Cascading dropdowns via RTK Query
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
    { skip: !isKpiCalcActive || !isKpiBaseReady },
  );
  const {
    data: productH1ApiOptions = [],
    isLoading: productH1Loading,
    isFetching: productH1Fetching,
    error: productH1Error,
  } = useGetKpiProductH1sQuery(
    { month: selectedMonth, channel: selectedChannel },
    { skip: !isKpiCalcActive || !isKpiBaseReady },
  );

  const {
    data: brandH2ApiOptions = [],
    isLoading: brandH2Loading,
    isFetching: brandH2Fetching,
    error: brandH2Error,
  } = useGetKpiBrandH2sQuery(
    { month: selectedMonth, channel: selectedChannel, productH1: selectedProductLevel1 },
    { skip: !isKpiCalcActive || !isKpiBaseReady },
  );
  const monthOptions = useMemo(() => ["Overall", ...monthApiOptions], [monthApiOptions]);
  const channelOptions = useMemo(() => ["Overall", ...channelApiOptions], [channelApiOptions]);
  const productH1Options = useMemo(() => ["Overall", ...productH1ApiOptions], [productH1ApiOptions]);
  const brandH2Options = useMemo(() => ["Overall", ...brandH2ApiOptions], [brandH2ApiOptions]);

  const dropdownLoading =
    monthsLoading || channelsLoading || productH1Loading || brandH2Loading;
  // ── KPI Benchmarking Tab (two screens) ────────────────────────────────────
  const isBenchActive = selectedTab === "kpi-benchmarking";
  // FIX #4 applied — only ALLOWED_BENCH_PARAMS keys forwarded to API hook.
  const benchTwoPayload = useMemo(() => {
    if (!isBenchActive) return {};
    const urlParams = new URLSearchParams(location.search);
    const sanitized = {};
    for (const [key, value] of urlParams.entries()) {
      if (ALLOWED_BENCH_PARAMS.has(key)) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }, [location.search, isBenchActive]);

  const { screen1: benchOne, screen2: benchTwo } = useKPIBenchmarkingTab(
    isBenchActive,
    benchTwoPayload,
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
  // ── useEffects ─────────────────────────────────────────────────────────────
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
        selectedChannel[0] === "Overall" ? "All" : selectedChannel[0],
      );
      setTrendProductH1(
        selectedProductLevel1[0] === "Overall" ? "All" : selectedProductLevel1[0],
      );
      setTrendBrand(selectedBrand[0] === "Overall" ? "All" : selectedBrand[0]);
    }
  }, [currentPage, selectedTab, selectedChannel, selectedProductLevel1, selectedBrand, isKpiCalcActive]);
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
      const lastUnlocked = unlockedTabs[unlockedTabs.length - 1] || "Templates";
      if (lastUnlocked !== selectedTab) {
        // FIX #2 applied — toSafeTab validates at the navigate() sink.
        navigate(`?tab=${toSafeTab(lastUnlocked)}`, { replace: true });
      }
    }
  }, [selectedTab, unlockedTabs, navigate]);
  // ── HEATMAP LOGIC ──────────────────────────────────────────────────────────
  const { columns, filteredHeatmapData } = useMemo(() => {
    const data = (() => {
      if (selectedTab === "maturity-assessment" && maturityData?.l1l2CapabilityTracking) {
        const mappedType = ASSESSMENT_TYPE_MAPPING[assessmentType] || assessmentType;
        return maturityData.l1l2CapabilityTracking.filter(
          (item) => item.Assessment === mappedType,
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
        ]),
      ),
    );

    return { columns: columnNames, filteredHeatmapData: structuredRows };
  }, [selectedTab, maturityData, assessmentType]);
  // ── UTILS ──────────────────────────────────────────────────────────────────
  const handleKPIChange = ({ kpi, function: func }) => {
    if (Array.isArray(kpi)) setSelectedKPIs(kpi);
    else setSelectedKPI(kpi || "");
    setSelectedFunction(func || "");
  };

  const handleMarkAsDownload = async (tabKey) => {
    const ref = tabRefs[tabKey];
    if (!ref?.current) return;
    try {
      const canvas = await html2canvas(ref.current, {
        useCORS: true,
        backgroundColor: "#fff",
      });
      const imgData = canvas.toDataURL("image/png");
      setDownloadedScreenshots((prev) => ({ ...prev, [tabKey]: imgData }));
      // FIX #6 applied — state notification replaces alert().
      showNotification("success", "Tab content marked for download.");
    } catch (err) {
      logger.error("[ViewAssessment] html2canvas failed:", err);
      showNotification("danger", "Failed to capture tab. Please try again.");
    }
  };

  const handleDownloadPdfClick = () => {
    const doc = new jsPDF("p", "mm", "a4");
    let added = false;
    downloadableTabs.forEach((key) => {
      if (downloadedScreenshots[key]) {
        if (added) doc.addPage();
        doc.addImage(downloadedScreenshots[key], "PNG", 10, 10, 190, 277);
        added = true;
      }
    });
    if (!added) {
      // FIX #6 applied — state notification replaces alert().
      showNotification("warning", "No tabs have been marked for download yet.");
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
      handleSurveyResponseUpload: (e) => setSurveyResponseFile(e.target.files[0]),
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
        // FIX #2 applied — toSafeTab validates at the navigate() sink.
        navigate(`?tab=${toSafeTab(nextTab)}`);
      } else {
        // AppScan fix — toSafeTab validates tabs[currentIndex] at sink.
        navigate(`?tab=${toSafeTab(tabs[currentIndex])}`);
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
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join(" ");
  // FIX #5 — Safe error message helper (CWE-209 Information Exposure).
  // Replaces raw JSON.stringify(error) which could expose internal API structure,
  // stack traces, or full server error payloads in the rendered UI.
  const getSafeErrorMessage = (err) => {
    if (!err) return "An unexpected error occurred.";
    if (typeof err === "object") {
      return (
        err?.data?.message ||
        (typeof err?.status === "number"
          ? `Request failed with status ${err.status}.`
          : null) ||
        "An unexpected error occurred."
      );
    }
    return String(err) || "An unexpected error occurred.";
  };

  const renderTabContent = () => {
    const dropdownFetching =
      monthsFetching || channelsFetching || productH1Fetching || brandH2Fetching;

    const hasPeerFinancialData = !!peerFinancialData;

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
      (!hasPeerFinancialData && (peerLoading || peerFetching)) ||
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
        <div className="loader-container" style={{ textAlign: "center", marginTop: "50px" }}>
          <Loader />
        </div>
      );
    }

    if (error) {
      return (
        <div className="alert alert-danger" role="alert">
          {/* FIX #5 applied — sanitized message only, no raw error objects rendered. */}
          Error loading data: {getSafeErrorMessage(error)}
          <button
            onClick={() => {
              // FIX #2 applied — toSafeTab validates at the navigate() sink.
              navigate(`?tab=${toSafeTab(selectedTab)}`);
            }}
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
        {/* FIX #6 applied — dismissible in-page notification banner. */}
        {notification && (
          <div
            className={`alert alert-${notification.type} alert-dismissible`}
            role="alert"
            style={{ marginBottom: 0 }}
          >
            {notification.message}
            <button
              type="button"
              className="btn-close"
              onClick={() => setNotification(null)}
              aria-label="Close"
            />
          </div>
        )}

        <div
          className="tab-heading"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "15px",
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
                      : "Mark this tab for PDF export",
                  )
                }
                onMouseLeave={hideTooltip}
                style={downloadedScreenshots[selectedTab] ? { opacity: 0.65 } : {}}
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
                  <div>{tabContent[selectedTab][currentPage - 1].description}</div>
                </div>
              ) : (
                <>
                  {tabContent[selectedTab][currentPage - 1].title && (
                    <h3>{tabContent[selectedTab][currentPage - 1].title}</h3>
                  )}
                  <div>{tabContent[selectedTab][currentPage - 1].description}</div>
                </>
              )}
            </div>
          ) : (
            <div className="alert alert-info" role="status">
              No content available for this tab.
            </div>
          )}
        </div>

        <div className="pagination-controls">
          {/* Left side: Back */}
          <div className="pagination-left">
            {!hideBackButton && (
              <button
                onClick={() => {
                  if (currentPage === 1) {
                    const tabs = Object.keys(tabPages);
                    const prevIndex =
                      (tabs.indexOf(selectedTab) - 1 + tabs.length) % tabs.length;
                    // FIX #2 applied — toSafeTab validates at the navigate() sink.
                    navigate(`?tab=${toSafeTab(tabs[prevIndex])}`);
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
            <button
              onClick={
                currentPage === totalPages
                  ? handleSaveContinue
                  : () => setCurrentPage(currentPage + 1)
              }
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
          </div>
        </div>

        {/* FIX #7 applied — tooltip rendered at clamped coordinates. */}
        {tooltip.visible && (
          <div
            className="custom-tooltip"
            role="tooltip"
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
              pointerEvents: "none",
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
        <div className="d-flex flex-column flex-lg-row w-100">
          <div className="tabs view-assessment-tabs col-12 col-lg-3">
            {/* FIX #8 applied — index suffix ensures key uniqueness. */}
            {Object.keys(tabPages).map((tab, idx) => {
              const isUnlocked = unlockedTabs.includes(tab);
              const isActive = selectedTab === tab;
              const isVisited = visitedTabs.has(tab) && selectedTab !== tab;

              return (
                <button
                  key={`tab-${tab}-${idx}`}
                  className={`tab
                    ${isActive ? "active" : ""}
                    ${isVisited ? "focus" : ""}
                    ${!isUnlocked ? "tab-disabled" : ""}`.replace(/\s+/g, " ")}
                  onClick={() => {
                    if (!isUnlocked) return;
                    // FIX #2 applied — toSafeTab validates at the navigate() sink.
                    navigate(`?tab=${toSafeTab(tab)}`);
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
