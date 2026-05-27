// hooks/useMonthlyMetrics.js
import { useState, useEffect } from "react";
import otifJson from "../components/data/OTIF-waterfall.json"; // Local file for fallback

export function useMonthlyMetrics(month) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // 1️⃣ Try local file first
      try {
        if (
          !otifJson ||
          typeof otifJson !== "object" ||
          !otifJson["2024"] ||
          !otifJson["2024"][month]
        ) {
          throw new Error(
            "Invalid or missing local OTIF data for the specified month"
          );
        }
        const localMetrics = otifJson["2024"][month]?.Overall_Monthly_Metrics;
        if (!localMetrics) {
          throw new Error("Missing Overall_Monthly_Metrics in local data");
        }
        setMetrics(localMetrics);
        setLoading(false);
        return; // Success: Skip fallback
      } catch (localErr) {

      }

      // 2️⃣ Fallback to API fetch for the specific month
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/2024/${month}`
        );
        if (!response.ok) {
          throw new Error(`Network error: ${response.status}`);
        }
        const json = await response.json();
        const fetchedMetrics = json?.Overall_Monthly_Metrics;
        if (!fetchedMetrics) {
          throw new Error("Missing Overall_Monthly_Metrics in API response");
        }
        setMetrics(fetchedMetrics);
      } catch (fetchErr) {

        setError(fetchErr.message);
      } finally {
        setLoading(false);
      }
    };

    if (month) {
      loadData();
    } else {
      setError("Month parameter is required");
      setLoading(false);
    }
  }, [month]);

  return { metrics, loading, error };
}
--

// src/hooks/useTrendlineData.js
import { useState, useEffect } from "react";
import trendlineJson from "../components/data/OTIF-trendline.json"; // Local file

const useTrendlineData = (
  channelFilter = "Overall",
  productH1Filter = "All",
  brandH2Filter = "All"
) => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [rawData, setRawData] = useState(null);
  const [channelOptions, setChannelOptions] = useState(["Overall"]);
  const [productH1Options, setProductH1Options] = useState(["All"]);
  const [brandH2Options, setBrandH2Options] = useState(["All"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadAndProcessData = async () => {
      setLoading(true);
      let data = null;

      // 1️⃣ Try local file first
      try {
        if (!trendlineJson || typeof trendlineJson !== "object") {
          throw new Error("Invalid local trendline data format");
        }
        // Basic validation: Check for at least one year key with expected structure
        const years = Object.keys(trendlineJson).filter((key) => !isNaN(key));
        if (
          years.length === 0 ||
          !trendlineJson[years[0]] ||
          typeof trendlineJson[years[0]] !== "object"
        ) {
          throw new Error("Local data missing expected year/month structure");
        }
        data = trendlineJson;
      } catch (localErr) {
        
        // 2️⃣ Fallback to API fetch
        try {
          const response = await fetch(
            `${process.env.REACT_APP_API_URL}/trendline`
          );
          if (!response.ok) {
            throw new Error("Failed to fetch trendline data");
          }
          data = await response.json();
          // Same basic validation for fetched data
          const fetchedYears = Object.keys(data).filter((key) => !isNaN(key));
          if (
            fetchedYears.length === 0 ||
            !data[fetchedYears[0]] ||
            typeof data[fetchedYears[0]] !== "object"
          ) {
            throw new Error(
              "Fetched data missing expected year/month structure"
            );
          }
        } catch (fetchErr) {
          setError(fetchErr.message);
          setLoading(false);
          return; // Exit if both fail
        }
      }

      // If data is loaded (from local or API), process it
      if (data) {
        setRawData(data);

        const monthOrder = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

        // Extract years dynamically
        const years = Object.keys(data).filter((key) => !isNaN(key)); // Assume year keys are numeric (e.g., "2024", "2025")

        // Extract options
        const channels = new Set(["Overall"]);
        const productH1s = new Set(["All"]);
        const brandH2s = new Set(["All"]);
        years.forEach((year) => {
          if (data[year]) {
            Object.values(data[year]).forEach((month) => {
              month.Channel_Metrics?.forEach((channel) =>
                channels.add(channel.channel)
              );
              month.ProductHierarchy1_Metrics?.forEach((p) =>
                productH1s.add(p.product_h1)
              );
              month.ProductHierarchy2_Metrics?.forEach((b) =>
                brandH2s.add(b.brand_h2)
              );
            });
          }
        });
        setChannelOptions(Array.from(channels));
        setProductH1Options(Array.from(productH1s));
        setBrandH2Options(Array.from(brandH2s));

        // Format monthly data
        const formatMonthlyData = (data) => {
          const result = [];
          years.forEach((year) => {
            if (!data[year]) return;
            Object.keys(data[year])
              .sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))
              .forEach((month) => {
                let metrics = data[year][month].OverallMonthlyMetrics;
                if (channelFilter !== "Overall") {
                  const channel = data[year][month].Channel_Metrics?.find(
                    (c) => c.channel === channelFilter
                  );
                  if (!channel) return;
                  metrics = channel;
                }
                if (productH1Filter !== "All") {
                  const product = data[year][
                    month
                  ].ProductHierarchy1_Metrics?.find(
                    (p) => p.product_h1 === productH1Filter
                  );
                  if (!product) return;
                  metrics = product;
                }
                if (brandH2Filter !== "All") {
                  const brand = data[year][
                    month
                  ].ProductHierarchy2_Metrics?.find(
                    (b) => b.brand_h2 === brandH2Filter
                  );
                  if (!brand) return;
                  metrics = brand;
                }
                result.push({
                  period: `${month} ${year}`, // Include year in period
                  OTIF: metrics["OTIF%"] || 0,
                  DIF: metrics["DIF%"] || 0,
                  DOT: metrics["DOT Count %"] || 0,
                });
              });
          });
          return result;
        };

        // Format weekly data with Week 5 for January, March, May
        const formatWeeklyData = (data) => {
          const result = [];
          const monthsWithWeek5 = ["January", "March", "May"];

          years.forEach((year) => {
            if (!data[year]) return;
            Object.keys(data[year])
              .sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))
              .forEach((month) => {
                let metrics = data[year][month].OverallMonthlyMetrics;
                if (channelFilter !== "Overall") {
                  const channel = data[year][month].Channel_Metrics?.find(
                    (c) => c.channel === channelFilter
                  );
                  if (!channel) return;
                  metrics = channel;
                }
                if (productH1Filter !== "All") {
                  const product = data[year][
                    month
                  ].ProductHierarchy1_Metrics?.find(
                    (p) => p.product_h1 === productH1Filter
                  );
                  if (!product) return;
                  metrics = product;
                }
                if (brandH2Filter !== "All") {
                  const brand = data[year][
                    month
                  ].ProductHierarchy2_Metrics?.find(
                    (b) => b.brand_h2 === brandH2Filter
                  );
                  if (!brand) return;
                  metrics = brand;
                }
                const weeklyMetrics = data[year][month].Weekly_Metrics || [];
                const allWeeks = [
                  ...weeklyMetrics,
                  ...(monthsWithWeek5.includes(month)
                    ? [
                        {
                          week: "Week5",
                          "OTIF%": 0, // Default to 0
                          "DIF%": 0,
                          "DOT Count %": 0,
                        },
                      ]
                    : []),
                ].sort((a, b) => {
                  const weekA = parseInt(a.week.replace("Week", ""));
                  const weekB = parseInt(b.week.replace("Week", ""));
                  return weekA - weekB;
                });

                allWeeks.forEach((week) => {
                  const weeklyOTIF =
                    channelFilter !== "Overall" ||
                    productH1Filter !== "All" ||
                    brandH2Filter !== "All"
                      ? metrics["OTIF%"] || 0
                      : week["OTIF%"] || 0;
                  const weeklyDIF =
                    channelFilter !== "Overall" ||
                    productH1Filter !== "All" ||
                    brandH2Filter !== "All"
                      ? metrics["DIF%"] || 0
                      : week["DIF%"] || 0;
                  const weeklyDOT =
                    channelFilter !== "Overall" ||
                    productH1Filter !== "All" ||
                    brandH2Filter !== "All"
                      ? metrics["DOT Count %"] || 0
                      : week["DOT Count %"] || 0;
                  result.push({
                    period: `${month} ${week.week} ${year}`, // Include year in period
                    OTIF: weeklyOTIF,
                    DIF: weeklyDIF,
                    DOT: weeklyDOT,
                  });
                });
              });
          });
          return result;
        };

        setMonthlyData(formatMonthlyData(data));
        setWeeklyData(formatWeeklyData(data));
      }
      setLoading(false);
    };

    loadAndProcessData();
  }, [channelFilter, productH1Filter, brandH2Filter]);

  return {
    monthlyData,
    weeklyData,
    rawData,
    channelOptions,
    productH1Options,
    brandH2Options,
    loading,
    error,
  };
};

export default useTrendlineData;
---

// src/hooks/usePeerSGAData.js
import { useState, useEffect } from "react";
import sgnaJson from "../components/data/sgna.json"; // Local file

const usePeerSGAData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // First try local import
      try {
        if (
          !sgnaJson ||
          typeof sgnaJson !== "object" ||
          !sgnaJson.companies ||
          !Array.isArray(sgnaJson.companies)
        ) {
          throw new Error(
            "Invalid local data format: expected object with companies array"
          );
        }
        setData(sgnaJson);
        setLoading(false);
      } catch (localError) {
        // Fallback to fetching from backend
        try {
          const response = await fetch(
            `${process.env.REACT_APP_API_URL}/sgnachart`
          );
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const json = await response.json();
          // Validate expected structure
          if (!json.companies || !Array.isArray(json.companies)) {
            throw new Error(
              "Invalid fetched format: expected object with companies array"
            );
          }
          setData(json);
          setLoading(false);
        } catch (fetchError) {
          setError(fetchError.message);
          setLoading(false);
        }
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default usePeerSGAData;
--

// src/hooks/usePeerInventoryData.js
import { useState, useEffect } from "react";
import inventoryJson from "../components/data/inventory.json"; // Local file

const usePeerInventoryData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // First try local import
      try {
        if (
          !inventoryJson ||
          typeof inventoryJson !== "object" ||
          !inventoryJson.companies ||
          !Array.isArray(inventoryJson.companies)
        ) {
          throw new Error(
            "Invalid local data format: expected object with companies array"
          );
        }
        setData(inventoryJson);
        setLoading(false);
      } catch (localError) {

        // Fallback to fetching from backend
        try {
          const response = await fetch(
            `${process.env.REACT_APP_API_URL}/inventory`
          );
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const json = await response.json();
          // Validate expected structure
          if (!json.companies || !Array.isArray(json.companies)) {
            throw new Error(
              "Invalid fetched format: expected object with companies array"
            );
          }
          setData(json);
          setLoading(false);
        } catch (fetchError) {

          setError(fetchError.message);
          setLoading(false);
        }
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default usePeerInventoryData;

--

  import { useState, useCallback } from "react";

const API_URL = `${process.env.REACT_APP_API_URL}/financial-analyze`;

const useFinancialAnalysis = (user, getAccessToken) => {
  const [financialData, setFinancialData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalysis = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_URL}?${queryString}` : API_URL;

      let accessToken = "";
      if (typeof getAccessToken === "function") {
        accessToken = await getAccessToken();
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        credentials: "include", // Include cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      const processedData = data.data || null;

      if (processedData) {
        if (!processedData.cogs_json || processedData.cogs_json.length === 0) {
          // TODO: Handle empty COGS data
        }
        if (!processedData.sga_json || processedData.sga_json.length === 0) {
          // TODO: Handle empty SGA data
        }
        if (!processedData.inv_json || processedData.inv_json.length === 0) {
          // TODO: Handle empty INV data
        }
      } else {
        // TODO: Handle no processed data
      }

      setFinancialData(processedData);
    } catch (err) {
      setError(err.message || "An error occurred while fetching analysis.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]); // ✅ Fixed: Removed unused 'user' dependency

  const clearData = useCallback(() => {
    setFinancialData(null);
    setError(null);
  }, []);

  return {
    financialData,
    loading,
    error,
    fetchAnalysis,
    clearData,
  };
};

export default useFinancialAnalysis;

--

// src/hooks/usePeerFinancialData.js
import { useState, useEffect } from "react";
import cogsJson from "../components/data/cogs.json"; // Local file

const usePeerFinancialData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // First try local import
      try {
        if (
          !cogsJson ||
          typeof cogsJson !== "object" ||
          !cogsJson.companies ||
          !Array.isArray(cogsJson.companies)
        ) {
          throw new Error(
            "Invalid local data format: expected object with companies array"
          );
        }
        setData(cogsJson);
        setLoading(false);
      } catch (localError) {

        // Fallback to fetching from backend
        try {
          const response = await fetch(
            `${process.env.REACT_APP_API_URL}/cogschart`
          );
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const json = await response.json();
          // Validate expected structure
          if (!json.companies || !Array.isArray(json.companies)) {
            throw new Error(
              "Invalid fetched format: expected object with companies array"
            );
          }
          setData(json);
          setLoading(false);
        } catch (fetchError) {
      
          setError(fetchError.message);
          setLoading(false);
        }
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default usePeerFinancialData;

--

  import { useState, useEffect } from "react";
import heatmapJson from "../components/data/l2_capability_tracking.json";

const useHeatmapData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // First try local import
      try {
        const localData = heatmapJson.capabilities || heatmapJson;
        if (!Array.isArray(localData)) {
          throw new Error("Invalid local data format: expected an array");
        }
        setData(localData);
        setLoading(false);
      } catch (localError) {
  
        // If local loading fails, fallback to fetching from backend
        try {
          const response = await fetch(
            `${process.env.REACT_APP_API_URL}/heatmap`
          );
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const json = await response.json();
          const fetchedData = json.capabilities || json;
          if (!Array.isArray(fetchedData)) {
            throw new Error("Invalid fetched data format: expected an array");
          }
          setData(fetchedData);
          setLoading(false);
        } catch (fetchError) {
   
          setError(fetchError.message);
          setLoading(false);
        }
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

export default useHeatmapData;

--
  
  // src/components/usecontext/UserContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { protectedResources } from "../../authConfig";
import { useDispatch } from "react-redux";
import { kpiApi, setTokenGetter } from "../../services/kpiApi";
import { EventType } from "@azure/msal-browser";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msalReady, setMsalReady] = useState(false);
  const [tokenGetterReady, setTokenGetterReady] = useState(false);
  const navigate = useNavigate();
  const { instance } = useMsal();
  const dispatch = useDispatch();

  // 1️⃣ Initialize MSAL on mount
  useEffect(() => {
    const initializeMsal = async () => {
      try {
        if (instance.initialize) {
          await instance.initialize();
        }
        setMsalReady(true);
      } catch (err) {
        setMsalReady(false);
      }
    };
    initializeMsal();
  }, [instance]);

  // 2️⃣ Token getter (useCallback)
  const getAccessToken = useCallback(async () => {
    try {
      const account = instance.getActiveAccount();
      if (!account) {
        return "";
      }
      const scopes = protectedResources.customApi.scopes;
      const tokenResponse = await instance.acquireTokenSilent({ account, scopes });
      return tokenResponse.accessToken;
    } catch (error) {
      // Try interactive popup
      try {
        const tokenResponse = await instance.acquireTokenPopup({
          scopes: protectedResources.customApi.scopes,
        });
        return tokenResponse.accessToken;
      } catch (interactiveError) {
        return "";
      }
    }
  }, [instance]);

  // 3️⃣ Refresh user (useCallback)
  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setUser(null);
        setLoading(false);
        return;
      }

      let msalAccount = null;
      try {
        msalAccount = instance.getActiveAccount();
      } catch {
        msalAccount = null;
      }

      const resp = await fetch(`${process.env.REACT_APP_API_URL}/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });

      let data = {};
      if (resp.status === 200) {
        data = await resp.json();
      }

      setUser({
        ...data,
        name:
          data.name ||
          (msalAccount && (msalAccount.name || msalAccount.username || msalAccount.email)) ||
          data.username ||
          data.email ||
          "User",
        email: data.email || (msalAccount && msalAccount.username) || null,
      });

    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, instance]);

  // 4️⃣ Logout (useCallback)
  const logout = useCallback(
    async (redirectPath = "/logout") => {
      try {
        dispatch(kpiApi.util.resetApiState());
        try {
          await fetch(`${process.env.REACT_APP_API_URL}/logout`, {
            method: "GET",
            credentials: "include",
          });
        } catch (logoutError) {
          // Backend logout fail
        }

        setUser(null);
        navigate(redirectPath);
      } catch (err) {
        setUser(null);
        navigate(redirectPath);
      }
    },
    [dispatch, navigate]
  );

  // 5️⃣ Login (useCallback)
  const login = useCallback(() => {
    instance.loginRedirect({ redirectUri: "/" });
  }, [instance]);

  // 6️⃣ Context value (useMemo)
  const contextValue = useMemo(
    () => ({
      user,
      loading,
      refreshUser,
      login,
      logout,
      isAuthenticated: !!user,
      getAccessToken,
      tokenGetterReady,
    }),
    [user, loading, refreshUser, login, logout, getAccessToken, tokenGetterReady]
  );

  // 7️⃣ Register token getter with RTK Query
  useEffect(() => {
    if (msalReady && getAccessToken) {
      setTokenGetter(getAccessToken);
      setTokenGetterReady(true);
    }
  }, [msalReady, getAccessToken]);

  // 8️⃣ Refresh user on mount
  useEffect(() => {
    if (msalReady) {
      refreshUser();
    }
  }, [refreshUser, msalReady]);

  // 9️⃣ MSAL event sync (THIS IS THE IMPORTANT FIX)
  useEffect(() => {
    if (!instance) return;
    const callbackId = instance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
        instance.setActiveAccount(event.payload.account);
        refreshUser(); // Auto-update context
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        setUser(null);
      }
    });
    return () => {
      if (callbackId) instance.removeEventCallback(callbackId);
    };
  }, [instance, refreshUser]);

  // 10️⃣ Prevent rendering until ready
  if (!msalReady || !tokenGetterReady) {
    return <div>Initializing authentication...</div>;
  }

  // 11️⃣ Provide context
  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

// Hook export
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

-

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

