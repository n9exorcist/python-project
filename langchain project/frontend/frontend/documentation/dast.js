// src/hooks/useOTIFData.js
import { useState, useEffect } from "react";
import otifJson from "../components/data/OTIF-waterfall.json"; // Local file

const useOTIFData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // 1️⃣ Try local file first
      try {
        if (!otifJson || typeof otifJson !== "object") {
          throw new Error("Invalid local OTIF data format");
        }
        setData(otifJson);
        setLoading(false);
        return; // Success: Skip fallback
      } catch (localErr) {

      }

      // 2️⃣ Fallback to API fetch
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/2024`);
        if (!response.ok) throw new Error("Network error");

        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default useOTIFData;
-----

export const fetchKpiData = async (
  setKpiData,
  setKpiLoading,
  setKpiError,
  setClientData,
  setClientHeatData,
  setWeeklyData,
  setRawData,
  setChannelOptions,
  setProductH1Options,
  setBrandH2Options,
  getAccessToken
) => {
  setKpiLoading(true);
  setKpiError(null);

  try {
    // Fetch token if getAccessToken is provided
    let accessToken = "";
    if (typeof getAccessToken === "function") {
      accessToken = await getAccessToken();
  
    }

    const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const response = await fetch(`${API_BASE}/kpi-calculation`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const responseData = await response.json();
    

    // Defensive: handle alternate key names from API
    const kpiWaterfall = responseData.waterfall_json || responseData.waterfall || responseData.otifData || {};
    const kpiHeatmap = responseData.heatmap_json || responseData.heatmap || {};
    const kpiTrendline = responseData.trendline_json || responseData.trendline || {};

    setKpiData({
      otifData: kpiWaterfall,
      trendlineData: kpiTrendline,
      heatmapData: kpiHeatmap,
    });

    setClientData(kpiWaterfall);
    setClientHeatData(kpiHeatmap);

    // Build weekly metrics (fixed: camelCase keys, correct inner props)
    let allWeeklyMetrics = [];
    Object.keys(kpiTrendline).forEach((year) => {
      Object.keys(kpiTrendline[year]).forEach((month) => {
        const monthlyData = kpiTrendline[year][month] || {};
        if (monthlyData.WeeklyMetrics) {  // Fixed: camelCase
          allWeeklyMetrics = allWeeklyMetrics.concat(
            monthlyData.WeeklyMetrics.map((metric) => ({
              week: metric.week || metric.Week || "",
              OTIF: metric.OTIF ?? metric["OTIF%"] ?? 0,
              year,
              month,
              channel: "All",
              product_h1: "All",  // Note: kept as product_h1 for consistency with chart props
              brand_h2: "All"
            }))
          );
        }
      });
    });
    
    setWeeklyData(allWeeklyMetrics);

    // Build raw monthly data (unchanged, already correct)
    let allRawData = [];
    Object.keys(kpiTrendline).forEach((year) => {
      Object.keys(kpiTrendline[year]).forEach((month) => {
        const monthlyData = kpiTrendline[year][month] || {};
        if (monthlyData.OverallMonthlyMetrics) {
          allRawData.push({
            year,
            month,
            ...monthlyData.OverallMonthlyMetrics,
          });
        }
      });
    });
    setRawData(allRawData);

    // Extract unique filter dropdown options (fixed: camelCase arrays, no underscores in props)
    const channelSet = new Set(["All"]);
    const productH1Set = new Set(["All"]);
    const brandH2Set = new Set(["All"]);
    Object.keys(kpiTrendline).forEach((year) => {
      Object.keys(kpiTrendline[year]).forEach((month) => {
        const monthlyData = kpiTrendline[year][month] || {};
        (monthlyData.ChannelMetrics || []).forEach((metric) => {  // Fixed: camelCase
          if (metric.channel) channelSet.add(metric.channel);
        });
        (monthlyData.ProductHierarchy1Metrics || []).forEach((metric) => {  // Fixed: camelCase
          if (metric.producth1) productH1Set.add(metric.producth1);  // Fixed: no underscore
        });
        (monthlyData.ProductHierarchy2Metrics || []).forEach((metric) => {  // Fixed: camelCase
          if (metric.brandh2) brandH2Set.add(metric.brandh2);  // Fixed: no underscore
        });
      });
    });

    setChannelOptions(Array.from(channelSet));
    setProductH1Options(Array.from(productH1Set));
    setBrandH2Options(Array.from(brandH2Set));
  } catch (err) {
    setKpiError(`Fetch failed: ${err.message}`);
  } finally {
    setKpiLoading(false);
  }
};
---

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || `${process.env.REACT_APP_API_URL}/api`;

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "API request failed");
  }
  return response.json();
};

export const apiService = {
  getOTIFData: async (year = "2024") => {
    const response = await fetch(`${API_BASE}/${year}`);
    const jsonData = await handleResponse(response);

    // Transform data here instead of in the component
    const transformedData = {};
    Object.keys(jsonData).forEach((month) => {
      transformedData[month] = {
        Channel_Metrics: jsonData[month].Channel_Metrics || [],
        Overall_Monthly_Metrics: jsonData[month].Overall_Monthly_Metrics || {},
      };
    });

    return transformedData;
  },

  getCapabilities: async () => {
    const response = await fetch(`${API_BASE}/capabilities`);
    return handleResponse(response);
  },

  // Add caching layer
  getCachedOTIFData: (() => {
    let cache = null;
    return async (year) => {
      if (!cache) {
        cache = await apiService.getOTIFData(year);
      }
      return cache;
    };
  })(),
};
-----

// src/hooks/useDropdownStructure.js
import { useState, useEffect } from "react";
import kpiStructureJson from "../components/data/kpi_structure.json"; // local copy

const useDropdownStructure = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      /* 1️⃣ Try the local file first */
      try {
        if (!kpiStructureJson || typeof kpiStructureJson !== "object") {
          throw new Error("Invalid local KPI structure format");
        }
        setData(kpiStructureJson);
        setLoading(false);
        return; // success ⇒ skip the fallback
      } catch (localErr) {

      }

      /* 2️⃣ Fallback to the backend API */
      try {
        const url = `${process.env.REACT_APP_API_URL}/api/kpi_structure`;
      
        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Network error: ${response.status} ${response.statusText} – ${errorText}`
          );
        }

        const json = await response.json();
        setData(json);
      } catch (fetchErr) {

        setError(fetchErr.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default useDropdownStructure;
----

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
--
   
/* eslint-disable no-console */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { REHYDRATE } from "redux-persist";

// --------------------------
// TOKEN HANDLER (MSAL Integration)
// --------------------------
let globalGetAccessToken = null;

export const setTokenGetter = (getAccessToken) => {
  globalGetAccessToken = getAccessToken;
};

// --------------------------
// BASE QUERY WITH AUTH
// --------------------------
const baseQueryWithAuth = async (args, api, extraOptions) => {
  let token = "";

  try {
    if (typeof globalGetAccessToken === "function") {
      token = await globalGetAccessToken();
    }
  } catch (err) {
    // Error caught but not exposed to the browser console
  }

  const baseQuery = fetchBaseQuery({
    baseUrl: process.env.REACT_APP_API_URL,
    credentials: "include",
    prepareHeaders: (headers) => {
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  });

  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    try {
      const refreshedToken = await globalGetAccessToken();
      if (refreshedToken) {
        const retryBaseQuery = fetchBaseQuery({
          baseUrl: process.env.REACT_APP_API_URL,
          credentials: "include",
          prepareHeaders: (headers) => {
            headers.set("Authorization", `Bearer ${refreshedToken}`);
            headers.set("Content-Type", "application/json");
            return headers;
          },
        });
        result = await retryBaseQuery(args, api, extraOptions);
      } else {
        // Error caught but not exposed to the browser console
      }
    } catch (refreshError) {
      // Error caught but not exposed to the browser console
    }
  }

  return result;
};

// --------------------------
// CREATE KPI API SERVICE
// --------------------------
export const kpiApi = createApi({
  reducerPath: "kpiApi",
  baseQuery: baseQueryWithAuth,
  keepUnusedDataFor: 86400,
  refetchOnMountOrArgChange: false,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  tagTypes: [
    "KPIData",
    "KPIBenchmarking",
    "MaturityData",
    "MaturityAssessmentData",
    "PeerFinancial",
    "Recommendations",
    "BusinessCase",
    "TrendlineData",
    "HeatmapData",
    "Files",
    "Months",
    "Channels",
    "ProductH1s",
    "BrandH2s",
    "Waterfall",
    "FinancialAnalysis",
    "ExecutiveSummary",
    "KpiDropdown",
    "ChatHistory",
  ],
  endpoints: (build) => ({
    uploadFile: build.mutation({
      query: (formData) => ({
        url: "/validate-and-summarize",
        method: "POST",
        body: formData,
        credentials: "include",
      }),
      invalidatesTags: [
        { type: "Files" },
        { type: "KPIData" },
        { type: "HeatmapData" },
        { type: "Waterfall" },
        { type: "TrendlineData" },
        { type: "BusinessCase" },
        { type: "Recommendations" },
        { type: "ExecutiveSummary" },
      ],
    }),

    getKpiCalculation: build.query({
      query: ({ month, channel, productH1, brandH2 } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi-calculation${suffix}`;
      },
      providesTags: ["KPIData", "HeatmapData"],
      transformResponse: (resp) => {
        const heatmap = resp?.heatmap_json || {};
        return {
          raw: resp,
          heatmap,
        };
      },
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    getKpiWaterfallData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("brand_h2", val);
        });
        return `/kpi/waterfall/data?${q.toString()}`;
      },
      providesTags: ["Waterfall"],
      transformResponse: (resp) => (Array.isArray(resp) ? resp : []),
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    getKpiTrendlineData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            q.append("brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/trandline/data${suffix}`;
      },
      providesTags: ["TrendlineData"],
      transformResponse: (resp) => {
        const weekly = Array.isArray(resp?.weekly_trends)
          ? resp.weekly_trends
          : [];
        const monthly = Array.isArray(resp?.monthly_trends)
          ? resp.monthly_trends
          : [];
        const metadata = resp?.metadata || null;
        return {
          weekly,
          monthly,
          metadata,
        };
      },
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    getKpiMonths: build.query({
      query: () => "/kpi/dropdown/month",
      providesTags: ["Months"],
      transformResponse: (resp) =>
        Array.isArray(resp?.options) ? resp.options : [],
    }),

    getKpiChannels: build.query({
      query: ({ month } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/channel${suffix}`;
      },
      providesTags: ["Channels"],
      transformResponse: (resp) =>
        Array.isArray(resp?.options) ? resp.options : [],
    }),

    getKpiProductH1s: build.query({
      query: ({ month, channel } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") q.append("channel", c);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/product_h1${suffix}`;
      },
      providesTags: ["ProductH1s"],
      transformResponse: (resp) =>
        Array.isArray(resp?.options) ? resp.options : [],
    }),

    getKpiBrandH2s: build.query({
      query: ({ month, channel, productH1 } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") q.append("channel", c);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((p) => {
          if (p && p !== "Overall" && p !== "All") q.append("product_h1", p);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/brand_h2${suffix}`;
      },
      providesTags: ["BrandH2s"],
      transformResponse: (resp) =>
        Array.isArray(resp?.options) ? resp.options : [],
    }),

    getKPIBenchmarkingOne: build.query({
      query: () => "/screen1-benchmarking",
      providesTags: ["KPIBenchmarking"],
      transformResponse: (response) => response,
    }),

    getKpiDropdown: build.query({
      query: () => "/screen2-kpi-dropdown",
      providesTags: ["KpiDropdown"],
      transformResponse: (response) => response,
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    getKPIBenchmarkingTwo: build.query({
      query: (payload) => ({
        url: "/screen2-benchmarking",
        method: "POST",
        body: payload,
      }),
      providesTags: ["KPIBenchmarking"],
      transformResponse: (raw) => {
        if (!raw || typeof raw !== "object") {
          return {
            "KPI Payload": [],
            "Dropdown Structure": {},
            "Overall Insight": "",
          };
        }

        const kpiPayload =
          raw["KPI Payload"] ||
          raw.screen2_data?.["KPI Payload"] ||
          raw.kpi_payload ||
          [];

        const dropdownStructure =
          raw["Dropdown Structure"] ||
          raw.structure_data ||
          raw.screen2_data?.["Dropdown Structure"] ||
          {};

        const overallInsight =
          raw["Overall Insight"] || raw.screen2_data?.["Overall Insight"] || "";

        return {
          "KPI Payload": Array.isArray(kpiPayload) ? kpiPayload : [],
          "Dropdown Structure": dropdownStructure,
          "Overall Insight": overallInsight,
        };
      },
    }),

    getMaturityAssessment: build.query({
      query: () => "/maturity-assessment",
      providesTags: ["MaturityAssessmentData"],
      transformResponse: (rawResponse) => {
        if (!rawResponse || typeof rawResponse !== "object") {
          return {
            l1CapabilityTracking: null,
            l1l2CapabilityTracking: null,
            recommendations: [],
          };
        }

        return {
          l1CapabilityTracking: rawResponse.l1_capability_tracking ?? null,
          l1l2CapabilityTracking: rawResponse.l1_l2_capability_tracking ?? null,
          recommendations: Array.isArray(rawResponse.maturity_leading_practices)
            ? rawResponse.maturity_leading_practices
            : [],
        };
      },
    }),

    getFinancialAnalysis: build.query({
      query: () => "/financial-analyze",
      providesTags: [{ type: "FinancialAnalysis", id: "SINGLE" }],
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
      transformResponse: (raw) => ({
        data: raw?.data ?? null,
        insights: raw?.insights ?? [],
      }),
    }),

    getRecommendations: build.query({
      query: () => "/recomendation",
      providesTags: ["Recommendations"],
      transformResponse: (json) => {
        const arr = Array.isArray(json.roadmap_json)
          ? json.roadmap_json
          : Array.isArray(json.content)
            ? json.content
            : [];
        const recommendations = [];
        Object.entries(arr).forEach(([_, content]) => {
          if (typeof content === "object" && content !== null) {
            [
              "Short-term Recommendation",
              "Mid-term Recommendation",
              "Long-term Recommendation",
            ].forEach((term) => {
              if (content[term]) {
                const recs = Array.isArray(content[term])
                  ? content[term]
                  : content[term]
                      .split(/\n|,/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                recs.forEach((text) => {
                  recommendations.push({
                    category: content["Assessment"],
                    term,
                    text,
                    "Level 1 Category": content["Level 1 Category"],
                    Enhancedhypothesis: content["Enhanced_hypothesis"],
                  });
                });
              }
            });
          }
        });

        return {
          recommendations,
          roadmap_json: json.roadmap_json || null,
          raw: json,
        };
      },
    }),

    getBusinessCase: build.query({
      query: () => "/business-case",
      providesTags: ["BusinessCase"],
      transformResponse: (result) => result,
    }),

    getExecutiveSummary: build.query({
      query: () => "/executive-summary",
      providesTags: ["ExecutiveSummary"],
      transformResponse: (json) => json ?? null,
    }),

    downloadPpt: build.mutation({
      query: () => ({
        url: "/generate-ppt/download",
        method: "GET",
        responseHandler: async (response) => {
          const blob = await response.blob();

          let fileName = "SC Rapid Diagnostic Assessment Report.pptx";

          const disposition = response.headers.get("Content-Disposition");
          if (disposition && disposition.includes("filename=")) {
            fileName = disposition.split("filename=")[1].replace(/"/g, "");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          return { success: true };
        },
        cache: "no-cache",
      }),
    }),

    uploadPpt: build.mutation({
      query: (formData) => ({
        url: "/upload-ppt/",
        method: "POST",
        body: formData,
        credentials: "include",
      }),
      invalidatesTags: [
        "ExecutiveSummary",
        "Recommendations",
        "BusinessCase",
        "FinancialAnalysis",
      ],
    }),

    // ── GET all threads for the logged-in user ───────────────────
    // FIX: maps last_updated (backend field) → lastMessageAt (frontend field)
    getChatThreads: build.query({
      query: () => "/chat/history/threads",
      providesTags: ["ChatHistory"],
      transformResponse: (resp) => {
        const threadsMap = {};
        (resp?.threads || []).forEach((t) => {
          threadsMap[t.thread_id] = {
            threadId: t.thread_id,
            // Backend returns title directly — no need to prefetch messages
            title: t.title || null,
            messageCount: t.message_count || 0,
            createdAt: t.last_updated,        // best approximation available
            lastMessageAt: t.last_updated,    // FIX: backend field is last_updated
            messages: [],
          };
        });
        return threadsMap;
      },
    }),

    // ── GET messages of a specific thread ───────────────────────
    getChatThreadMessages: build.query({
      query: (threadId) => `/chat/history/${threadId}`,
      providesTags: (result, error, threadId) => [
        { type: "ChatHistory", id: threadId },
      ],
      transformResponse: (resp) => resp?.messages || [],
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    // ── DELETE a specific thread ─────────────────────────────────
    deleteChatThread: build.mutation({
      query: (threadId) => ({
        url: `/chat/history/${threadId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    // ── DELETE all threads for the logged-in user ────────────────
    // FIX: was missing entirely — now wired to DELETE /chat/history
    deleteAllChatHistory: build.mutation({
      query: () => ({
        url: "/chat/history",
        method: "DELETE",
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        return response;
      },
    }),

    // ── POST send a chat message ─────────────────────────────────
    sendChatMessage: build.mutation({
      query: ({ message, threadId }) => ({
        url: "/chat",
        method: "POST",
        body: {
          user_message: message,
          // FIX: ensure null threadId is never serialised as string "null"
          thread_id: threadId || undefined,
        },
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        return response;
      },
    }),
  }),
  extractRehydrationInfo(action, { reducerPath }) {
    if (action.type === REHYDRATE) {
      return action.payload?.[reducerPath] ?? undefined;
    }
    return undefined;
  },
});

// --------------------------
// EXPORT HOOKS
// --------------------------
export const {
  useUploadFileMutation,
  useGetKpiCalculationQuery,
  useGetKpiWaterfallDataQuery,
  useGetKpiTrendlineDataQuery,
  useGetKpiMonthsQuery,
  useGetKpiChannelsQuery,
  useGetKpiProductH1sQuery,
  useGetKpiBrandH2sQuery,
  useGetKPIBenchmarkingOneQuery,
  useGetKPIBenchmarkingTwoQuery,
  useGetMaturityAssessmentQuery,
  useGetFinancialAnalysisQuery,
  useGetRecommendationsQuery,
  useGetBusinessCaseQuery,
  useGetExecutiveSummaryQuery,
  useDownloadPptMutation,
  useUploadPptMutation,
  useGetKpiDropdownQuery,
  useGetChatThreadsQuery,
  useGetChatThreadMessagesQuery,
  useDeleteChatThreadMutation,
  useDeleteAllChatHistoryMutation,   // ← NEW export
  useSendChatMessageMutation,
} = kpiApi;