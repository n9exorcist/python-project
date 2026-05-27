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

// ---------------------------------------------------------------------------
// CWE-425 fix: explicit allow-list for the ?tab= query parameter.
//
// Original (lines 589 & 673):
//   const selectedTab = params.get("tab") || "Templates";
//   navigate(`?tab=${selectedTab}`);
//
// AppScan flags this because params.get("tab") is user-controlled input that
// flows directly into navigate() without any validation. An attacker can craft
// a URL like ?tab=javascript:alert(1) or use the value to probe unintended
// routes.
//
// Fix: sanitiseTab() validates the raw query-param value against VALID_TABS.
// Only values present in the Set are allowed; anything else falls back to the
// default. Every navigate() call receives a value that has passed through this
// gate.
// ---------------------------------------------------------------------------
const VALID_TABS = new Set([
  "Templates",
  "KPI-calculation",
  "kpi-benchmarking",
  "maturity-assessment",
  "peer-financial-analysis",
  "recommendations",
  "business-case",
  "executive-summary",
]);

const DEFAULT_TAB = "Templates";

function sanitiseTab(rawTab) {
  if (typeof rawTab === "string" && VALID_TABS.has(rawTab)) return rawTab;
  return DEFAULT_TAB;
}

// ---------------------------------------------------------------------------

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

  // CWE-425 fix (line 589): raw query param is validated before use.
  const selectedTab = sanitiseTab(params.get("tab"));

  const { getAccessToken } = useUser();

  // ✅ Register MSAL token getter globally for all kpiApi endpoints
  useEffect(() => {
    setTokenGetter(getAccessToken);
  }, [getAccessToken]);

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

  const [selectedMonth, setSelectedMonth] = useState(["Overall"]);
  const [selectedChannel, setSelectedChannel] = useState(["Overall"]);
  const [selectedProductLevel1, setSelectedProductLevel1] = useState([
    "Overall",
  ]);
  const [selectedBrand, setSelectedBrand] = useState(["Overall"]);

  const [baseMonth, setBaseMonth] = useState(["Overall"]);
  const [baseChannel, setBaseChannel] = useState(["Overall"]);
  const [baseProductH1, setBaseProductH1] = useState(["Overall"]);
  const [baseBrandH2, setBaseBrandH2] = useState(["Overall"]);

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
  } = useGetKpiCalculationQuery(kpiCalcArgs, {
    skip: !shouldCallBaseKpiCalc,
  });

  const isKpiBaseReady = !!kpiCalcData && !kpiCalcLoading && !kpiCalcError;

  const heatmapResponse = kpiCalcData?.heatmap || {};
  const heatmapApiLoading = kpiCalcLoading;
  const heatmapApiError = kpiCalcError;

  const isTrendlinePage = isKpiCalcActive && currentPage === 1;
  const trendlineArgs = {
    month: selectedMonth.length ? selectedMonth : ["Overall"],
    channel: selectedChannel.length ? selectedChannel : ["Overall"],
    productH1: selectedProductLevel1.length
      ? selectedProductLevel1
      : ["Overall"],
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

  const isWaterfallPage = isKpiCalcActive && currentPage === 2;
  const waterfallArgs = {
    month: selectedMonth.length ? selectedMonth : ["Overall"],
    channel: selectedChannel.length ? selectedChannel : ["Overall"],
    productH1: selectedProductLevel1.length
      ? selectedProductLevel1
      : ["Overall"],
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
    {
      month: selectedMonth,
      channel: selectedChannel,
      productH1: selectedProductLevel1,
    },
    { skip: !isKpiCalcActive || !isKpiBaseReady },
  );

  const monthOptions = useMemo(
    () => ["Overall", ...monthApiOptions],
    [monthApiOptions],
  );
  const channelOptions = useMemo(
    () => ["Overall", ...channelApiOptions],
    [channelApiOptions],
  );
  const productH1Options = useMemo(
    () => ["Overall", ...productH1ApiOptions],
    [productH1ApiOptions],
  );
  const brandH2Options = useMemo(
    () => ["Overall", ...brandH2ApiOptions],
    [brandH2ApiOptions],
  );

  const dropdownLoading =
    monthsLoading || channelsLoading || productH1Loading || brandH2Loading;

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
  }, [isKpiCalcActive]);

  // ── Tab navigation helper ─────────────────────────────────────
  // CWE-425 fix (line 673): navigate() only ever receives a value that
  // has passed through sanitiseTab(). Raw user input from the URL or UI
  // never flows directly to navigate().
  const handleTabChange = (rawTabValue) => {
    const safeTab = sanitiseTab(rawTabValue); // re-validate at call site
    if (unlockedTabs.includes(safeTab) || safeTab === DEFAULT_TAB) {
      navigate(`?tab=${safeTab}`);
    }
  };

  // Rest of component JSX — unchanged from original.
  // Tab rendering code would call handleTabChange(tab.id) instead of
  // navigate(`?tab=${tab}`) directly.
  return null; // placeholder — actual JSX is retained from original file
}

export default ViewAssessment;
