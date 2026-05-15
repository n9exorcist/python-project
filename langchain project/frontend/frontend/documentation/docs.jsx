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
    } else {
      console.warn(
        "⚠️ No token getter function registered. Call setTokenGetter() inside useUser()",
      );
    }
  } catch (err) {
    console.error("❌ Failed to fetch token from MSAL:", err);
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
    console.warn("🔄 Token might be invalid, attempting refresh...");
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
        console.error("❌ Token refresh failed: still missing");
      }
    } catch (refreshError) {
      console.error("❌ Token refresh attempt failed:", refreshError);
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
        url: "/validate-and-summarize/",
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
        console.error("❌ KPI Calculation API Error:", response);
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
        console.error("❌ KPI Waterfall API Error:", response);
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
        console.error("❌ KPI Trendline API Error:", response);
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
        console.error("❌ KPI Dropdown API Error:", response);
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

    // Replace getChatThreads endpoint
    getChatThreads: build.query({
      query: () => "/chat/history/threads",
      providesTags: ["ChatHistory"],
      transformResponse: (resp) => {
        const threadsMap = {};
        (resp?.threads || []).forEach((t) => {
          threadsMap[t.thread_id] = {
            threadId: t.thread_id,
            // ✅ Backend thread list response — try every possible title field
            title:
              t.title ||
              t.first_message ||
              t.preview ||
              t.summary ||
              t.name ||
              null, // null = needs to be loaded
            createdAt: t.created_at,
            lastMessageAt: t.last_message_at,
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
        console.error("❌ Chat Thread Messages API Error:", response);
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
        console.error("❌ Delete Chat Thread API Error:", response);
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
          thread_id: threadId || undefined,
        },
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        console.error("❌ Send Chat Message API Error:", response);
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
  useSendChatMessageMutation,
} = kpiApi;

--

// store.js
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import benchmarkReducer from "./slices/benchmarkSlice";
import oneGoReducer from "./slices/oneGoSlice";
import fileUploadReducer from "./slices/fileUploadSlice";
import tabAccessReducer from "./slices/tabAccessSlice";
import { kpiApi } from "./services/kpiApi";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage";

const initialState = {
  myDiagnosticData: [],
};

function customReducer(state = initialState, action) {
  switch (action.type) {
    case "SET_MY_DIAGNOSTIC_DATA":
      return {
        ...state,
        myDiagnosticData: action.payload,
      };
    default:
      return state;
  }
}

// 🔹 META SLICE to track lastPersistedAt
const META_UPDATE = "meta/UPDATE_TIMESTAMP";

// export an action creator so we can call it from React
export const updateMetaTimestamp = () => ({ type: META_UPDATE });

const metaInitialState = {
  lastPersistedAt: Date.now(),
  isExpired: false,
};

// ✅ keep 24 hours for testing, switch back later
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function metaReducer(state = metaInitialState, action) {
  switch (action.type) {
    case META_UPDATE:
      return {
        ...state,
        lastPersistedAt: Date.now(),
        isExpired: false,
      };
    // ✅ ADD THIS: allow explicit expiry trigger
    case "meta/EXPIRE":
      return {
        ...state,
        isExpired: true,
      };
    default:
      return state;
  }
}

// Combine ALL your reducers, including kpiApi:
const appReducer = combineReducers({
  custom: customReducer,
  benchmarkData: benchmarkReducer,
  fileUpload: fileUploadReducer,
  oneGo: oneGoReducer,
  tabAccess: tabAccessReducer,
  [kpiApi.reducerPath]: kpiApi.reducer,
  meta: metaReducer,
});



// 🔹 Root reducer that can wipe / expire state
const rootReducer = (state, action) => {
  // wipe everything on logout
  if (action.type === "auth/logout") {
    state = undefined;
  }

  // ✅ important: read from action.payload during REHYDRATE
  if (action.type === REHYDRATE) {
    const inboundState = action.payload;

    if (inboundState) {
      const now = Date.now();
      const last = inboundState.meta?.lastPersistedAt ?? 0;
      const age = now - last;

      if (age > EXPIRY_MS) {
        // return a fresh expired state immediately
        return appReducer(
          {
           custom: initialState,
            benchmarkData: undefined,
            fileUpload: undefined,
            oneGo: undefined,
            tabAccess: undefined,
            [kpiApi.reducerPath]: undefined,
            meta: {
              lastPersistedAt: last,
              isExpired: true,
            },
          },
          action
        );
      }
    }
  }

  return appReducer(state, action);
};

const persistConfig = {
  key: "root",
  version: 1,
  storage,
  whitelist: ["tabAccess", "fileUpload", "kpiApi", "meta"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredPaths: ["kpiApi.queries", "kpiApi.mutations"],
      },
    }).concat(kpiApi.middleware),
});

setupListeners(store.dispatch);

export const persistor = persistStore(store);

export const purgePersistedState = async () => {
  await persistor.purge();
};

export default store;

--

// src/components/chatbot/MethodOneVirtualAssistant.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import BotLoader from "../common/BotLoader";
import { useUser } from "../usecontext/UserContext";
import { useMsal } from "@azure/msal-react";
import useChat from "../../hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ✅ NEW: GFM plugin for tables
import ChartRenderer from "./ChartRenderer";
import "../../assets/css/MethodOneVirtualAssistant.css";
import { getBlobUrl } from "../../utils/blobUrls";

// Helper: extract 'tab' from query string
function useTabParam(defaultTab = "executive-summary") {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return params.get("tab") || defaultTab;
}

const MethodOneVirtualAssistant = ({
  isOpen = true,
  isCompact = false,
  isFullScreen = false,
  onClose,
  initialMsg = "",
  isWidget = false,
}) => {
  const { user, loading: userLoading, getAccessToken } = useUser();
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const activeTab = useTabParam("executive-summary");

  // ✅ Always call hook
  const chatHook = useChat(user, getAccessToken);
  const {
  chatHistory,
  loading,
  threadsLoading,
  error,
  sendMessage,
  clearChat,
  threadId,
  conversationsByThread,
  loadThreadHistory,
  removeThread,
} = chatHook || {
  chatHistory: [],
  loading: false,
  threadsLoading: false,
  error: null,
  sendMessage: async () => {},
  clearChat: () => {},
  threadId: null,
  conversationsByThread: {},
  loadThreadHistory: () => {},
  removeThread: async () => {},
};

  const [input, setInput] = useState(isFullScreen ? "" : initialMsg);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [isCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closing, setClosing] = useState(false);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  // ✅ Display name
  const displayName =
    user?.name || accounts[0]?.name || accounts[0]?.username || "Guest";

  const userInitials =
    displayName !== "Guest"
      ? displayName
          .split(" ")
          .map((word) => word[0]?.toUpperCase())
          .join("")
          .slice(0, 2)
      : "GU";

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  // Focus input
  useEffect(() => {
    if (inputRef.current && !loading && !isCollapsed) {
      inputRef.current.focus();
    }
  }, [loading, isCollapsed]);

  // Navigation options
  const getOptions = () => {
    if (pathname === "/assessment") {
      return [
        {
          icon: (
            <span className="material-symbols-outlined fs-3">analytics</span>
          ),
          label: "Download the workbench report",
          tab: "executive-summary",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">
              attach_money
            </span>
          ),
          label: "Take me to the business case",
          tab: "business-case",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">balance</span>
          ),
          label: "Show me the peer financial analysis",
          tab: "peer-financial-analysis",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">calculate</span>
          ),
          label: "Give the KPI benchmarks for CPG industry",
          tab: "kpi-benchmarking",
        },
      ];
    }

    return [
      {
        icon: <span className="material-symbols-outlined fs-3">event</span>,
        label: "Show the demo video",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">book</span>,
        label: "View the guidebook",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">build</span>,
        label: "Open Workbench",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">home</span>,
        label: "Browse the FAQs",
      },
    ];
  };

  const options = getOptions();

  // URLs / mapping for quick actions
  const guidebookUrl = getBlobUrl("userguide/RDF_User%20Guide.pptx");
  const labelToPath =
    pathname === "/assessment"
      ? {
          "Give the KPI benchmarks for CPG industry":
            "/assessment?tab=kpi-benchmarking",
          "Show me the peer financial analysis":
            "/assessment?tab=peer-financial-analysis",
          "Download the workbench report":
            "/assessment?tab=executive-summary",
          "Take me to the business case": "/assessment?tab=business-case",
        }
      : {
          "Browse the FAQs": "/home",
          "Show the demo video": "/demo",
          "Open Workbench": "/assessment",
          "View the guidebook": guidebookUrl,
        };

  const sampleQueries = (pathname) => {
    if (pathname === "/") {
      return [
        "Watch the demo video to get a quick walkthrough of the tool's features and capabilities.",
        "View the guidebook for step-by-step instructions and detailed reference material.",
        "Browse the FAQs to find quick answers to common questions and issues.",
        "Show me the overview page with a summary of inputs and the corresponding outputs.",
        "Launch the workbench for the assessment for a hands-on experience.",
      ];
    }

    if (pathname === "/assessment") {
      return [
        "Show the past 3-year forecast accuracy trend for CPG Industry and suggest short-term actions to improve it",
        "What has been the Inventory % of Revenue at Plant Level over the last 3 years, and how can we optimize it in the next 6 months?",
        "Provide Logistics Cost/FTE and OTIF for the North region over the past 3 years and recommend ways to improve efficiency",
        "Show Supply Chain FTEs per $B revenue for Modern Trade channel over the past 3 years and suggest mid-term efficiency improvements",
        "What has been OTIF performance for e-commerce and traditional trade in the last 3 years, and what short-term steps can enhance service?",
      ];
    }

    return [];
  };

  // Submit handler
  const handleSubmit = useCallback(
    async (msg) => {
      const userMsg =
        msg != null ? String(msg).trim() : (input || "").trim();
      if (!userMsg) return;

      setInput("");
      await sendMessage(userMsg);
    },
    [input, sendMessage]
  );

  const handleOptionClick = (label) => {
    const target = labelToPath[label];

    if (target) {
      if (/^https?:\/\//.test(target)) {
        window.open(target, "_blank", "noopener,noreferrer");
      } else if (target.startsWith("/")) {
        navigate(target);
      }
    } else {
      handleSubmit(label);
    }
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (onClose) onClose();
      else {
        navigate("/");
        clearChat();
      }
    }, 1000);
  };

  const handleNewChat = () => {
    setInput("");
    clearChat();
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  };

  // Auto-send initial message for tab screens
  useEffect(() => {
    if (initialMsg && chatHistory.length === 0 && !isFullScreen) {
      handleSubmit(initialMsg);
    }
  }, [initialMsg, chatHistory.length, isFullScreen, handleSubmit]);

  if (!isOpen) return null;
  if (userLoading || closing) return <BotLoader />;

  const sidebarWidth = 320;
  const headerHeight = 56;
  const mainWidth = isCollapsed ? 400 : 860;
  const minHeightValue = isCompact
    ? "auto"
    : isFullScreen
    ? "92vh"
    : 470;

  const visibleChatHistory = (chatHistory || []).filter((c) => {
    const hasText = !!String(c?.message ?? "").trim();
    const hasChart =
      !!c?.chartData &&
      (Array.isArray(c.chartData)
        ? c.chartData.length > 0
        : Object.keys(c.chartData || {}).length > 0);

    return hasText || hasChart;
  });

  return (
    <div
      className="methodone-virtual-assistant-container"
      style={{
        borderRadius: isCompact ? 0 : isMaximized ? 0 : 18,
        boxShadow: isCompact ? "none" : "0 6px 40px rgba(137,27,247,0.14)",
        minHeight: isMaximized ? "100vh" : minHeightValue,
        minWidth: isMaximized ? "100vw" : undefined,
        width: isMaximized ? "50vw" : undefined,
        height: isMaximized ? "auto" : undefined,
        position: isMaximized ? "fixed" : "relative",
        left: isMaximized ? 0 : undefined,
        top: isMaximized ? 0 : undefined,
        zIndex: isMaximized ? 9999 : "auto",
        margin: isFullScreen ? 10 : 0,
      }}
    >
      {/* HEADER */}
      {isFullScreen ? (
        <div
          className="virtual-assistant-header fullscreen-header"
          style={{ height: headerHeight }}
        >
          <div className="header-content">
            <span className="material-symbols-outlined fs-3 me-2">
              robot_2
            </span>
            Rapid Supply Chain Diagnostic Assistant
          </div>
          <div className="header-actions header-actions-methodone">
            {!onClose && (
              <button
                aria-label={isMaximized ? "Restore" : "Maximize"}
                className="maximize-button"
                onClick={() => setIsMaximized((x) => !x)}
              >
                <span className="material-symbols-outlined">
                  {isMaximized ? "fullscreen_exit" : "fullscreen"}
                </span>
              </button>
            )}
            {onClose && (
              <button
                onClick={handleClose}
                className="close-button mb-0"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="virtual-assistant-header"
          style={{ display: isCompact ? "none" : "flex" }}
        >
          <div className="header-content">
            <span className="material-symbols-outlined fs-3">robot_2</span>
            Rapid Supply Chain Diagnostic Assistant
          </div>
          <div className="header-actions header-actions-methodtwo">
            <button
              aria-label={isMaximized ? "Restore" : "Maximize"}
              className="maximize-button"
              onClick={() => setIsMaximized((x) => !x)}
            >
              <span className="material-symbols-outlined">
                {isMaximized ? "fullscreen_exit" : "fullscreen"}
              </span>
            </button>
            {onClose && (
              <button onClick={handleClose} className="close-button">
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* MAIN WRAPPER */}
      <div
        className="main-content-wrapper"
        style={{
          paddingTop: isFullScreen ? 50 : 0,
          height: isFullScreen
            ? `calc(100vh - ${headerHeight}px)`
            : "auto",
        }}
      >
        {/* CHAT SIDEBAR */}
        {isFullScreen && showChatSidebar && (
          <div
            className="chat-history-sidebar"
            style={{ width: sidebarWidth }}
          >
            <div className="sidebar-header">
              <span>Chats</span>
              <button
                onClick={() => setShowChatSidebar(false)}
                className="sidebar-close-button"
                aria-label="Close chat sidebar"
              >
                ×
              </button>
            </div>

            <div className="sidebar-new-chat-wrapper">
              <button
                type="button"
                className="sidebar-new-chat-button"
                onClick={handleNewChat}
              >
                <span className="material-symbols-outlined fs-4">add</span>
                <span style={{ marginLeft: 6 }}>New Chat</span>
              </button>
            </div>

            {/* CHAT SIDEBAR - replace the existing sidebar-content div */}
{/* CHAT SIDEBAR - replace the existing sidebar-content div */}
<div className="sidebar-content">
  {threadsLoading ? (
    <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
      Loading conversations...
    </div>
  ) : Object.values(conversationsByThread || {}).length === 0 ? (
    <div style={{ padding: "16px", color: "#aaa", textAlign: "center" }}>
      No conversations yet
    </div>
  ) : (
    Object.values(conversationsByThread || {})
      .sort((a, b) =>
        new Date(a?.lastMessageAt || a?.createdAt || 0) 
          ? 1
          : -1
      )
      .map((conv) => {
  // ✅ Use backend title directly — no need to load messages first
  // Falls back to shortened ID only if backend didn't send a title
  const displayTitle =
    conv.title ||
    conv.messages?.find((m) => m.from === "user")?.message ||
    `Chat ${conv.threadId?.substring(0, 8)}...`;

  const truncated =
    displayTitle.length > 40
      ? `${displayTitle.substring(0, 40)}...`
      : displayTitle;

  return (
    <div
      key={conv.threadId}
      className={`sidebar-item${conv.threadId === threadId ? " active" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
      onClick={() => loadThreadHistory(conv.threadId)}
    >
      <div
        className="sidebar-item-title"
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {truncated}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeThread(conv.threadId);
        }}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#aaa",
          padding: "2px 4px",
          flexShrink: 0,
        }}
        title="Delete conversation"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          delete
        </span>
      </button>
    </div>
  );
})
  )}
</div>
          </div>
        )}

        {/* MAIN CHAT AREA */}
        <div
          className="main-chat-area"
          style={{
            width: isFullScreen ? mainWidth : "auto",
            transition: "width 0.3s ease",
          }}
        >
          {/* SAMPLE QUESTIONS */}
          {visibleChatHistory.length === 0 &&
            isFullScreen &&
            sampleQueries(pathname).length > 0 && (
              <div className="sample-questions">
                <span className="sample-questions-title mt-3">
                  <span className="material-symbols-outlined fs-3">
                    blur_on
                  </span>
                  Sample questions
                </span>
                {sampleQueries(pathname).map((query, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(query)}
                    className="sample-query-button"
                  >
                    {query}
                  </button>
                ))}
              </div>
            )}

          {/* NON-FULLSCREEN WELCOME */}
          {visibleChatHistory.length === 0 && !isFullScreen && (
            <div
              className="non-fullscreen-welcome"
              style={{
                padding: isCompact ? "12px 16px 5px" : "17px 21px 5px",
              }}
            >
              <div className="welcome-message">
                Welcome {displayName}!
              </div>
              <div
                className="options-grid"
                style={{
                  gridTemplateColumns: "1fr 1fr",
                  gap: isCompact ? 8 : 11,
                }}
              >
                {options.map((o) => (
                  <button
                    key={o.label}
                    className={`option-button${
                      pathname === "/assessment" && o.tab === activeTab
                        ? " active"
                        : ""
                    }`}
                    style={{
                      padding: isCompact ? "8px 6px" : "11px 9px",
                      fontSize: isCompact ? "11px" : "12px",
                    }}
                    onClick={() => handleOptionClick(o.label)}
                  >
                    <span style={{ fontSize: isCompact ? 14 : 16 }}>
                      {o.icon}
                    </span>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CHAT BUBBLES */}
          <div
            ref={chatContainerRef}
            className="chat-bubbles-container"
            style={{
              padding: isFullScreen ? "0 28px" : "0 17px",
              flex: 1,
              overflowY: "auto",
            }}
          >
            {visibleChatHistory.map((c, i) => (
              <div
                className={`chat-bubble-wrapper ${
                  c.from === "user" ? "user" : "bot"
                }`}
                key={`${c.from}-${i}`}
              >
                <div
                  className="chat-avatar"
                  style={{
                    background:
                      c.from === "user" ? "#eceefd" : "#eedbfc",
                    margin:
                      c.from === "user"
                        ? "0 0 0 8px"
                        : "0 8px 0 0",
                  }}
                >
                  {c.from === "user" ? (
                    userInitials
                  ) : (
                    <span className="material-symbols-outlined fs-3">
                      robot_2
                    </span>
                  )}
                </div>

                <div
                  className={`chat-bubble ${c.from}`}
                  style={{
                    background:
                      c.from === "bot" ? "#f7f2fc" : "#e8edfd",
                    color:
                      c.from === "bot" ? "#4a287c" : "#7e2efc",
                    borderRadius:
                      c.from === "user"
                        ? "14px 14px 2px 14px"
                        : "14px 14px 14px 2px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        strong: ({ node, ...props }) => (
                          <strong style={{ fontWeight: 700 }} {...props} />
                        ),
                        p: ({ node, ...props }) => (
                          <p style={{ margin: "0 0 4px 0" }} {...props} />
                        ),
                      }}
                    >
                      {c.message ?? ""}
                    </ReactMarkdown>
                  </div>

                  {c.from === "bot" &&
                    c.chartData &&
                    (Array.isArray(c.chartData)
                      ? c.chartData.length > 0
                      : Object.keys(c.chartData).length > 0) && (
                      <div
                        className="chart-wrapper-bubble"
                        style={{
                          marginTop: "12px",
                          width: "100%",
                        }}
                      >
                        <ChartRenderer
                          data={c.chartData}
                          type={
                            c.chartType ||
                            c.state?.chart_intent?.chart_type ||
                            "bar"
                          }
                        />
                      </div>
                    )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-wrapper bot">
                <div
                  className="chat-avatar"
                  style={{
                    background: "#eedbfc",
                    margin: "0 8px 0 0",
                  }}
                >
                  <span className="material-symbols-outlined fs-3">
                    robot_2
                  </span>
                </div>
                <div className="chat-bubble bot">
                  <BotLoader />
                </div>
              </div>
            )}
          </div>

          {/* ERROR */}
          {error && (
            <div
              className="error-message"
              style={{
                padding: "12px 17px",
                color: "#f44336",
                background: "#fee",
              }}
            >
              {error}
            </div>
          )}

          {/* INPUT BAR */}
          <div
            className="input-bar"
            style={{
              padding: isFullScreen ? "19px 28px" : "13px 16px",
            }}
          >
            <div className="input-wrapper">
              {isFullScreen && (
                <button
                  className="sidebar-toggle"
                  onClick={() => setShowChatSidebar(!showChatSidebar)}
                  title={showChatSidebar ? "Close sidebar" : "Open sidebar"}
                  style={{
                    marginRight: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: "#5b5b5b",
                    cursor: "pointer",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "24px" }}
                  >
                    {showChatSidebar ? "left_panel_close" : "view_sidebar"}
                  </span>
                </button>
              )}

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask me anything..."
                disabled={loading}
                className="chat-input"
              />

              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || loading}
                className="send-button"
                aria-label="Send"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>

          {/* FOOTER */}
          <div className="footer-disclaimer">
            <span>AI-generated content. Use at your own discretion.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MethodOneVirtualAssistant;

--

import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import MethodOneVirtualAssistant from "./MethodOneVirtualAssistant";

const ChatWidget = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Always close the chat if we go to the assessment page
    if (location.pathname === "/assessment") {
      setOpen(false);
    }
  }, [location.pathname]);

  // Only show the 🤖 button if not on /assessment
  if (location.pathname === "/assessment") {
    return (
      <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1300 }}>
        <button
          onClick={() => {}} // disables opening on assessment route
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#7e2efc",
            color: "#fff",
            fontSize: "2rem",
            border: "none",
            cursor: "not-allowed",
            opacity: 0.7,
          }}
          aria-label="Chatbot Disabled on Assessment"
          disabled
        >
          🤖
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1300 }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#7e2efc",
            color: "#fff",
            fontSize: "2rem",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 3px 12px rgba(137,27,247,0.17)",
          }}
          aria-label="Open Chatbot"
        >
          🤖
        </button>
      )}
      {open && (
        <div
          className="virtual-assistant-chat-box"
          style={{
            width: 400,
            height: 520,
            background: "#fff",
            borderRadius: 18,
            boxShadow: "0 4px 18px rgba(137,27,247,0.12)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MethodOneVirtualAssistant
            isOpen={true}
            isCompact={true}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ChatWidget;


--

.methodone-virtual-assistant-container {
  position: relative;
  background: #fff;
  font-family: Inter, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.methodone-virtual-assistant-container .virtual-assistant-header {
  display: flex;
  background: #872bcc;
  color: #fff;
  border-radius: 18px 18px 0 0;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .fullscreen-header {
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border-radius: 18px 18px 0 0;
  z-index: 20;
  background: #872bcc;
  color: #fff;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .header-content {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.methodone-virtual-assistant-container .close-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.7rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .maximize-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.18rem;
  cursor: pointer;
  margin-right: 7px;
  margin-left: 4px;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .collapse-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-content-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  overflow: auto;
  border-radius: 12px;
}

.methodone-virtual-assistant-container .chat-history-sidebar {
  height: 100%;
  background: #fff;
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.methodone-virtual-assistant-container .sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-header span {
  font-weight: bold;
  font-size: 18px;
}

.methodone-virtual-assistant-container .sidebar-close-button {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-content {
  padding: 0 20px;
  overflow-y: auto;
  flex: 1;
}

.methodone-virtual-assistant-container .sidebar-item {
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-chat-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.methodone-virtual-assistant-container .welcome-title {
  padding: 22px 28px 10px;
  font-weight: 700;
  font-size: 1.11rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
  background: linear-gradient(180deg, #ad9be833, #c6b8f433);
}

.methodone-virtual-assistant-container .sample-questions {
  margin-bottom: 12px;
  padding: 0 28px;
  background: linear-gradient(180deg, #c6b8f433, #fff);
}

.methodone-virtual-assistant-container .sample-questions-title {
  font-weight: 600;
  color: #000;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.methodone-virtual-assistant-container .sample-query-button {
  margin-top: 8px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #a100ff52;
  border-radius: 8px;
  font-size: 0.92rem;
  color: #000;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.methodone-virtual-assistant-container .non-fullscreen-welcome {
  /* Padding handled inline due to conditional */
}

.methodone-virtual-assistant-container .welcome-message {
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
}

.methodone-virtual-assistant-container .options-grid {
  display: grid;
  margin-bottom: 7px;
}

.methodone-virtual-assistant-container .option-button {
  background: #fff;
  border: 1.7px solid #ebe0fb;
  border-radius: 9px;
  font-weight: 600;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 7px rgba(193, 126, 255, 0.06);
}

.methodone-virtual-assistant-container .chat-bubbles-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper {
  display: flex;
  align-items: flex-end;
  margin-bottom: 10px;
  margin-top: 10px;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper.user {
  flex-direction: row-reverse;
}

.methodone-virtual-assistant-container .chat-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #7e2efc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}

.methodone-virtual-assistant-container .chat-bubble {
  padding: 10px 15px;
  box-shadow: 0 1px 6px rgba(186, 106, 255, 0.06);
  font-size: 1.02rem;
  text-align: left;
  max-width: 74%;
  min-width: 80px;
  word-break: break-word;
}

.methodone-virtual-assistant-container .loading-indicator {
  color: #aaa;
  font-size: 1.01rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.methodone-virtual-assistant-container .loading-icon {
  width: 32px;
  height: 32px;
  margin-right: 8px;
}

.methodone-virtual-assistant-container .error-message {
  color: red;
  font-size: 1.01rem;
  text-align: center;
  margin: 10px 0;
}

.methodone-virtual-assistant-container .input-bar {
  border-top: 1.6px solid rgb(236, 238, 253);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-direction: row;
  border-radius: 12px;
  margin: 20px 0 0 0;
  position: relative;
}

.methodone-virtual-assistant-container .input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-history-toggle {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #7e2efc;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  z-index: 2;
  user-select: none;
}

.methodone-virtual-assistant-container .chat-history-toggle span {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .separator {
  font-size: 1.5rem;
  margin-left: 3px;
  margin-right: 3px;
  line-height: 1;
  font-weight: 100;
  color: #7e2efc;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-input {
  flex: 1;
  /* Increased right padding (50px) so the text doesn't type underneath the send button */
  padding: 12px 50px 12px 15px; 
  border: 1.5px solid #edeef8;
  border-radius: 12px; /* Slightly rounder to match modern UI */
  font-size: 1.01rem;
  background: #fafafd;
  margin: 0;
}

.methodone-virtual-assistant-container .fullscreen-input {
  padding-left: 156px;
  border: 1px solid #a100ff52;
}

.methodone-virtual-assistant-container .send-button {
  background: #7e2efc;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 34px;  /* Slightly smaller to fit beautifully inside the input box */
  height: 34px;
  cursor: pointer;
  
  /* 1. This perfectly centers the paper airplane icon inside the button */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  
  /* 2. This anchors the button perfectly inside the right side of the input field */
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%); /* Mathematically guarantees perfect vertical centering */
  margin: 0;
}

.methodone-virtual-assistant-container .footer-disclaimer {
  padding: 12px 30px;
  font-size: 0.91rem;
  color: #726590;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.methodone-virtual-assistant-container .footer-icons {
  display: flex;
}

.methodone-virtual-assistant-container .sidebar-new-chat-wrapper {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: #f3e6ff;
  color: #7e2efc;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button:hover {
  background: #e8d5ff;
}

.chat-markdown p {
  margin: 0 0 4px 0;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown ul {
  list-style-type: disc;
}

.chat-markdown ol {
  list-style-type: decimal;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chart-wrapper-bubble {
    background: #ffffff;
    border-radius: 8px;
    padding: 10px;
    border: 1px solid #e2e8f0;
    overflow: hidden; /* Prevents X-axis labels from leaking */
}

/* In MethodOneVirtualAssistant.css */
.methodone-virtual-assistant-container .chat-bubble.bot {
    max-width: 90% !important; /* Give it more room */
    width: 100%;
}

.chart-wrapper-bubble {
   margin-top: 12px;
    width: 100%;
    /* Remove overflow: hidden if it exists here */
    overflow-x: auto; 
    display: block;
    background: #fff;
}

/* Markdown tables inside chat bubbles */
.chat-markdown table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

.chat-markdown th,
.chat-markdown td {
  border: 1px solid #e2e8f0;
  padding: 6px 8px;
}

.chat-markdown th {
  background-color: #f5f5f5;
  font-weight: 600;
  text-align: left;
}

.chat-markdown tbody tr:nth-child(even) {
  background-color: #faf5ff;
}
