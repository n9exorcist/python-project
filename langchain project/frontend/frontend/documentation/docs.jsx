// src/hooks/useChat.js
import { useState, useCallback, useEffect } from "react";

const API_URL = `${process.env.REACT_APP_API_URL}/chat`;

const useChat = (user, getAccessToken) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ✅ Track current thread id for this conversation
  const [threadId, setThreadId] = useState(null);

  // ✅ All conversations grouped by thread_id
  const [conversationsByThread, setConversationsByThread] = useState({});

  // ✅ Per-user storage key so different users don't clash
  const storageKey = user?.email ? `conversationsByThread_${user.email}` : null;

  // ✅ Load from localStorage when user changes (or on first mount)
  useEffect(() => {
    if (!storageKey) {
      setConversationsByThread({});
      setChatHistory([]);
      setThreadId(null);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConversationsByThread(parsed || {});
        const threads = Object.values(parsed || {});
        if (threads.length > 0) {
          // ✅ Restore most recently created/updated thread
          const last = threads.sort((a, b) =>
            new Date(a?.createdAt || 0) < new Date(b?.createdAt || 0) ? 1 : -1,
          )[0];
          setThreadId(last.threadId);
          setChatHistory(last.messages || []);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  // ✅ Persist conversations to localStorage whenever they change
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversationsByThread));
    } catch {
      // ignore storage errors
    }
  }, [storageKey, conversationsByThread]);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      // ✅ Optimistically add user message
      setChatHistory((prev) => [...prev, { from: "user", message }]);
      setLoading(true);
      setError(null);

      try {
        const token = getAccessToken ? await getAccessToken() : null;

        // ✅ Pass current thread_id, or start a new thread when null
        const payload = {
          user_message: message,
          thread_id: threadId || undefined,
        };

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();

        // ✅ Ensure we always know which thread this message belongs to
        const effectiveThreadId =
          data.thread_id || threadId || "unknown_thread";
        if (effectiveThreadId !== threadId) {
          setThreadId(effectiveThreadId);
        }

        // ✅ FORMAT BOT RESPONSE AS MARKDOWN
        const raw = data.assistant_response || "No response received";

        const formattedResponse = raw
          // turn inline " • Item" bullets into real markdown list items
          .replace(/\s*•\s*/g, "\n- ")
          // treat your '---' separators as blank lines / new paragraphs
          .replace(/---/g, "\n\n")
          // normalize line endings
          .replace(/\r\n/g, "\n");

        const botMessage = {
          from: "bot",
          message: formattedResponse,
          thread_id: data.thread_id,
          user_id: data.user_id,
          state: data.state,
          timestamp: data.timestamp,
        };

        // ✅ Append bot response to flat history for current view
        setChatHistory((prev) => [...prev, botMessage]);

        // ✅ Update per-thread conversation cache
        setConversationsByThread((prev) => {
          const existing = prev[effectiveThreadId];

          // ✅ Optionally hydrate from backend state (if present)
          const backendMessages =
            Array.isArray(data.state?.messages) &&
            data.state.messages.length > 0
              ? data.state.messages.map((m) => ({
                  from: m.role === "user" ? "user" : "bot",
                  // if the backend message is from assistant, also format it
                  message:
                    m.role === "assistant"
                      ? (m.content || "")
                          .replace(/\s*•\s*/g, "\n- ")
                          .replace(/---/g, "\n\n")
                          .replace(/\r\n/g, "\n")
                      : m.content,
                  timestamp: m.timestamp,
                }))
              : null;

          const newMessages = existing
            ? [...existing.messages, { from: "user", message }, botMessage]
            : backendMessages || [{ from: "user", message }, botMessage];

          // ✅ First message timestamp or backend timestamp as createdAt
          const createdAt =
            existing?.createdAt ||
            (data.state?.messages?.[0]?.timestamp ?? data.timestamp);

          // ✅ Use first user message as title (fallback to latest message)
          const title =
            existing?.title ||
            (data.state?.messages || []).find((m) => m.role === "user")
              ?.content ||
            message;

          return {
            ...prev,
            [effectiveThreadId]: {
              threadId: effectiveThreadId,
              userId: data.user_id,
              messages: newMessages,
              createdAt,
              title,
            },
          };
        });
      } catch (err) {
        setError(err.message || "Chat error occurred");
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, threadId],
  );

  const clearChat = useCallback(() => {
    // ✅ Clear only the visible chat; keep past threads in cache
    setChatHistory([]);
    setError(null);
    setThreadId(null);
  }, []);

  // ✅ NEW: load messages for a given thread into chatHistory
  const loadThreadHistory = useCallback(
    (tId) => {
      if (!tId) return;
      const conv = conversationsByThread[tId];
      if (conv && Array.isArray(conv.messages)) {
        // ✅ Switch visible chat to this thread's messages
        setChatHistory(conv.messages);
      } else {
        // if no messages found, show empty chat for that thread
        setChatHistory([]);
      }
    },
    [conversationsByThread],
  );

  return {
    chatHistory,
    loading,
    error,
    sendMessage,
    clearChat,
    threadId,
    setThreadId,
    conversationsByThread,
    loadThreadHistory, // ✅ expose helper
  };
};

export default useChat;
---

// src/components/ValueGridChart.jsx
import React from "react";
import DOMPurify from "dompurify";
import { ValueTreeData } from "../data/ValueTree";
import "../../assets/css/ValueGridChart.css";

const ValueBox = ({ title, bullets, summary }) => (
  <div className="value-box-chart-container">
    <div className={`value-box${summary ? " value-box-summary" : ""}`}>
      {title && <div className="value-box-title">{title}</div>}
      {bullets && (
        <ul>
          {bullets.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      )}
      {summary && (
        <ul>
          {summary.map((item, idx) => {
            const sanitizedHTML = DOMPurify.sanitize(item); // Sanitize before rendering
            return (
              <li
                key={idx}
                dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
              />
            );
          })}
        </ul>
      )}
    </div>
  </div>
);

export default function ValueGridChart() {
  const columns = ValueTreeData.children;

  return (
    <div className="value-grid-root-container">
      <div className="value-grid-root">
        <div className="value-header">{ValueTreeData.name}</div>

        {/* SVG and structure remain unchanged */}
        <svg className="value-grid-arrows" width="900" height="70">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#CCCCCC" />
            </marker>
          </defs>
          <line
            x1="450"
            y1="0"
            x2="450"
            y2="100"
            stroke="#CCCCCC"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
          <line
            x1="450"
            y1="100"
            x2="338"
            y2="100"
            stroke="#CCCCCC"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
          <line
            x1="450"
            y1="100"
            x2="562"
            y2="100"
            stroke="#CCCCCC"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
        </svg>

        <div className="value-columns">
          {columns.map((col, i) => (
            <div className="value-column" key={col.name}>
              <div className="value-column-title">{col.name}</div>
              <div className="arrow-down"></div>
              {col.children.map((node, idx) =>
                node.bullets ? (
                  <React.Fragment key={idx}>
                    <ValueBox title={node.name} bullets={node.bullets} />
                    <div className="arrow-down" />
                  </React.Fragment>
                ) : node.summary ? (
                  <ValueBox key={idx} summary={node.summary} />
                ) : null
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
--

/* eslint-disable no-console */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { REHYDRATE } from "redux-persist"; // <-- add this at the top

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
        "⚠️ No token getter function registered. Call setTokenGetter() inside useUser()"
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
        // { type: "FinancialAnalysis" },
        { type: "BusinessCase" },
        { type: "Recommendations" },
        { type: "ExecutiveSummary" },
      ],


    }),


    // 🔹 SINGLE KPI-CALCULATION ENDPOINT (base + heatmap_json)
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

    // 🔹 KPI Waterfall Data endpoint using /kpi/waterfall/data
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

    // 🔹 KPI Trendline Data endpoint using /kpi/trandline/data
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

        // NOTE: backend path spelling is /kpi/trandline/data
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

    // KPI Dropdown endpoints
    getKpiMonths: build.query({
      query: () => "/kpi/dropdown/month",
      providesTags: ["Months"],
      transformResponse: (resp) =>
        Array.isArray(resp?.options) ? resp.options : [],
    }),

    getKpiChannels: build.query({
      // accept month array, pass as query
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
      // accept month + channel
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
      // accept month + channel + product_h1
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

    // SCREEN 1: KPI BENCHMARKING
    getKPIBenchmarkingOne: build.query({
      query: () => "/screen1-benchmarking",
      providesTags: ["KPIBenchmarking"],
      transformResponse: (response) => {
        return response;
      },
    }),

    // SCREEN 2: KPI BENCHMARKING (POST)
    getKPIBenchmarkingTwo: build.query({
      query: (payload) => ({
        url: "/screen2-benchmarking",
        method: "POST",
        body: payload,
      }),
      providesTags: ["KPIBenchmarking"],
      transformResponse: (raw) => {


        // ✅ handle null / empty responses gracefully
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
          raw["Overall Insight"] ||
          raw.screen2_data?.["Overall Insight"] ||
          "";

        return {
          "KPI Payload": Array.isArray(kpiPayload) ? kpiPayload : [],
          "Dropdown Structure": dropdownStructure,
          "Overall Insight": overallInsight,
        };
      },
    }),


    // MATURITY ASSESSMENT DATA
    getMaturityAssessment: build.query({
      query: () => "/maturity-assessment",
      providesTags: ["MaturityAssessmentData"],
      transformResponse: (rawResponse) => {


        // If backend sent null / non‑object, just return an empty shape instead of throwing
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
      transformResponse: (result) => {
        return result;
      },
    }),

    getExecutiveSummary: build.query({
      query: () => "/executive-summary",
      providesTags: ["ExecutiveSummary"],
      transformResponse: (json) => json ?? null,
    }),

    // 🔹 NEW: Download PPT mutation
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


    // In kpiApi.js - UPDATE the uploadPpt endpoint:
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


  }),
  extractRehydrationInfo(action, { reducerPath }) {
    if (action.type === REHYDRATE) {
      return (action).payload?.[reducerPath] ?? undefined;
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
} = kpiApi;
--
import React, { useState } from "react";
import "../../assets/css/recommendations.css";

// Helper: highlight "Hypothesis" & "Recommendations" in plain text content
function highlightSubheaders(content) {
  if (typeof content !== "string") return content;
  return content.replace(
    /(Hypothesis|Recommendations)/g,
    '<span class="rec-subheader">$1</span>'
  );
}

function RecommendationsAccordion({ sections = [] }) {
  const [openSections, setOpenSections] = useState(new Set());

  // Toggle one section
  const toggleSection = (idx) => {
    const newOpenSections = new Set(openSections);
    newOpenSections.has(idx)
      ? newOpenSections.delete(idx)
      : newOpenSections.add(idx);
    setOpenSections(newOpenSections);
  };

  // Expand/Collapse all
  const expandAll = () =>
    setOpenSections(new Set(sections.map((_, idx) => idx)));
  const collapseAll = () => setOpenSections(new Set());

  if (sections.length === 0) {
    return null; // Or <div>No sections available.</div>
  }

  return (
    <div className="rec-accordion">
      <div className="rec-controls" style={{ marginBottom: "10px" }}>
        <button
          className="rec-expand-btn"
          onClick={expandAll}
          style={{ marginRight: "10px" }}
        >
          Expand All
        </button>
        <button className="rec-expand-btn" onClick={collapseAll}>
          Collapse All
        </button>
      </div>
      {sections.map(({ title, content }, idx) => {
        const isOpen = openSections.has(idx);
        return (
          <div className="rec-accordion-section" key={title || idx}>
            <button
              className={`rec-accordion-header${isOpen ? " open" : ""}`}
              onClick={() => toggleSection(idx)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                background: "none",
                border: "none",
                padding: "16px",
                fontSize: "1.1rem",
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: "bold" }}>
                {title || "Untitled Section"}
              </span>
              <span
                className="rec-accordion-toggle"
                aria-label={isOpen ? "Collapse" : "Expand"}
                style={{
                  marginLeft: "auto",
                  color: isOpen ? "#7500c0" : "#000",
                  fontWeight: "bold",
                }}
              >
                {isOpen ? "–" : "+"}
              </span>
            </button>
            {isOpen && (
              <div
                className="rec-accordion-content"
                dangerouslySetInnerHTML={
                  typeof content === "string"
                    ? { __html: highlightSubheaders(content) }
                    : undefined
                }
              >
                {typeof content !== "string" ? content : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default RecommendationsAccordion;
--

import React from "react";

const tabMap = {
  Demo: "/assistant/demo",
  Industries: "/assistant/industries",
  Stage0: "/assistant/stage-0",
  GuideBook: "/assistant/guidebook",
};

// Utility to validate whether the URL is safe (starts with / or https)
const isSafeUrl = (url) => /^\/|^https?:\/\//.test(url);

const AssistantLinkButton = ({ label, tab }) => {
  // Defensive check for valid tab key and safe URL
  const url = tabMap[tab];
  const handleClick = () => {
    if (url && isSafeUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer"); // safer open
    } else {
      // eslint-disable-next-line no-console
      console.warn("Attempted to open unsafe or invalid URL:", url);
    }
  };

  return (
    <button
      className="assistant-link-btn"
      onClick={handleClick}
      style={{
        margin: "8px",
        minWidth: "150px",
        padding: "16px 24px",
        background: "#f4f4fc",
        border: "none",
        borderRadius: "12px",
        fontWeight: "bold",
        color: "#4a287c",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(87,34,202,0.09)",
      }}
    >
      {label}
    </button>
  );
};

export default AssistantLinkButton;
--

// src/components/chatbot/MethodOneVirtualAssistant.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import BotLoader from "../common/BotLoader";
import { useUser } from "../usecontext/UserContext";
import { useMsal } from "@azure/msal-react";
import useChat from "../../hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    sortedThreads,      // ← FIX: use pre-sorted array from hook
    loadThreadHistory,
    removeThread,
    removeAllThreads,   // ← NEW: wired to DELETE /chat/history
  } = chatHook || {
    chatHistory: [],
    loading: false,
    threadsLoading: false,
    error: null,
    sendMessage: async () => {},
    clearChat: () => {},
    threadId: null,
    sortedThreads: [],
    loadThreadHistory: () => {},
    removeThread: async () => {},
    removeAllThreads: async () => {},
  };

  const [input, setInput] = useState(isFullScreen ? "" : initialMsg);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [isCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
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
        "Show Supply Chain FTEs per $B revenue for Modern Trade channel over the past 3 years and suggest mid-term efficiency improvements",
        "Show me the trendline chart?",
        "I want to see the percentage contribution of OTIF miss by brand?",
        "Give me three years trs growth of top 3 company",
        "feedback: One of the Leading practice for forecasting for consumer goods is to forecast at a monthly level",
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

  // Handle clear all with inline confirmation
  const handleClearAll = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }
    setShowClearConfirm(false);
    await removeAllThreads();
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

            {/* NEW CHAT + CLEAR ALL BUTTONS */}
            <div className="sidebar-new-chat-wrapper">
              <button
                type="button"
                className="sidebar-new-chat-button"
                onClick={handleNewChat}
              >
                <span className="material-symbols-outlined fs-4">add</span>
                <span style={{ marginLeft: 6 }}>New Chat</span>
              </button>

              {/* FIX: Clear all button — wired to DELETE /chat/history */}
              {sortedThreads.length > 0 && (
                <button
                  type="button"
                  className="sidebar-clear-all-button"
                  onClick={handleClearAll}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: showClearConfirm ? "#ffe0e0" : "#f5f5f5",
                    color: showClearConfirm ? "#c0392b" : "#888",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, marginRight: 5 }}
                  >
                    delete_sweep
                  </span>
                  {showClearConfirm ? "Confirm clear all?" : "Clear all chats"}
                </button>
              )}
            </div>

            {/* CHAT HISTORY LIST */}
            {/* FIX: uses sortedThreads (pre-sorted DESC by lastMessageAt) */}
            <div className="sidebar-content">
              {threadsLoading ? (
                <div
                  style={{
                    padding: "16px",
                    color: "#888",
                    textAlign: "center",
                  }}
                >
                  Loading conversations...
                </div>
              ) : sortedThreads.length === 0 ? (
                <div
                  style={{
                    padding: "16px",
                    color: "#aaa",
                    textAlign: "center",
                  }}
                >
                  No conversations yet
                </div>
              ) : (
                sortedThreads.map((conv) => {
                  // Backend title is used directly — no message prefetch needed
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
                      className={`sidebar-item${
                        conv.threadId === threadId ? " active" : ""
                      }`}
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
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
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
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16 }}
                        >
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

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

const MAIN_COLOR = "#2A2D84";
const PEER_COLOR = "#D3D3D3";


// Utility to escape HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeNumber(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val.replace("%", ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export default function GroupedBarChart({
   data,
  width = 880,
  height = 420,
  highlightedCompany,
  metricField = "Revenue_USD_mn",
  inventoryField = undefined,
  percentField = "Inventory_Revenue",
  chartTitleLeft = "Revenue",
  chartTitleRight = "Inventory",
  percentTitle = "Revenue/Inventory (%)",
}) {
  const svgRef = useRef();
  const tooltipRef = useRef();

  useEffect(() => {
    const tooltip = d3
      .select(tooltipRef.current)
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "#fafbfc")
      .style("border", "1px solid #e0e0e0")
      .style("padding", "7px 12px")
      .style("border-radius", "6px")
      .style("pointer-events", "none")
      .style("font-size", "13px")
      .style("z-index", "10");

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (
      !data ||
      !data.companies ||
      !Array.isArray(data.companies) ||
      data.companies.length === 0
    ) {
      svg.attr("width", width).attr("height", height);
      return;
    }

    const allYearSets = data.companies.map((c) =>
      Object.keys(c[metricField] || c[inventoryField] || {})
    );
    const effectiveYearSets = allYearSets.map((years) =>
      years.filter((y) => !/^CAGR$/i.test(y))
    );
    const allYears = Array.from(new Set(effectiveYearSets.flat())).sort();

    // Only last 3 years
    const fiscalYearToLabel = (fy) => {
      const match = typeof fy === "string" ? fy.match(/FY-\d{2}\/(\d{4})/i) : null;
      return match ? match[1] : fy || "";
    };
    let allYearLabels = allYears.map(fiscalYearToLabel);
    let years = allYearLabels.slice(-3);

    const labelToFiscalYear = {};
    years.forEach((label, i) => {
      const pos = allYears.length - years.length + i;
      if (label !== "" && allYears[pos] !== undefined)
        labelToFiscalYear[label] = allYears[pos];
    });

    const company =
      data.companies.find((c) => c.name === highlightedCompany) ||
      data.companies[0];

    const clientName = data?.client_name;
    // const companyName = clientName
    //   ? (clientName.includes("(")
    //       ? clientName.split("(")[1].replace(")", "").trim()
    //       : clientName)
    //   : company?.name || "Unknown Company";

    const companyName = clientName
      ? (clientName.includes("(")
        ? clientName.split("(")[1].replace(")", "").trim()
        : clientName)
      : company?.name || "Unknown Company";

    // Build chartData (one entry for each year)
    const chartData = years.map((label) => {
      const fiscalYear = labelToFiscalYear[label];
      let percentRaw = company[percentField]?.[fiscalYear];
      let metricRaw = company[metricField]?.[fiscalYear];
      let inventoryRaw =
        inventoryField && company[inventoryField]
          ? company[inventoryField][fiscalYear]
          : undefined;

      let percent = safeNumber(percentRaw);
      let metric = safeNumber(metricRaw);
      let Inventory =
        inventoryField && inventoryRaw !== undefined
          ? safeNumber(inventoryRaw)
          : undefined;

      if (
        (metric === 0 || !isFinite(metric)) &&
        metricField === "Revenue_USD_mn" &&
        Inventory !== undefined &&
        percent > 0
      ) {
        metric = Inventory / (percent / 100);
      } else if (
        (Inventory === 0 || !isFinite(Inventory)) &&
        inventoryField === "Revenue_USD_mn" &&
        metric !== undefined &&
        percent > 0
      ) {
        Inventory = metric / (percent / 100);
      }

      return {
        year: label,
        metric: isFinite(metric) ? metric : 0,
        Inventory: Inventory !== undefined && isFinite(Inventory) ? Inventory : 0,
        percent: isFinite(percent) ? percent : 0,
      };
    });

     // === Build peer data from backend PeerMedian ===
    const peerData = years.map((year) => {
      const fiscalYear = labelToFiscalYear[year];
      const peerM = safeNumber(
        data.PeerMedian?.[fiscalYear] ||
          data.Peer_Median?.[fiscalYear] ||
          data.data?.PeerMedian?.[fiscalYear] ||
          data.data?.Peer_Median?.[fiscalYear] ||
          company.PeerMedian?.[fiscalYear] ||
          ""
      );
      return { year, value: peerM };
    });



    // Keep for y-axis scale
    const peerMedians = peerData.map((d) => d.value);

    // Remove entries with NaN or non-numeric years if any (defensive)
    const filteredChartData = chartData.filter(
      (d) =>
        typeof d.year === "string" &&
        d.year !== "" &&
        isFinite(d.metric) &&
        isFinite(d.percent) &&
        (inventoryField ? isFinite(d.Inventory) : true)
    );

    const margin = { top: 60, right: 70, bottom: 100, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const topHeight = innerHeight * 0.4;
    const bottomHeight = innerHeight * 0.45;
    const gap = 60;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const chartSpacing = 60;
    const bandTop = d3
      .scaleBand()
      .domain(years)
      .range([
        0,
        inventoryField ? innerWidth / 2 - chartSpacing / 2 : innerWidth,
      ])
      .padding(0.4);
    const bandBottom = d3
      .scaleBand()
      .domain(years)
      .range([0, innerWidth])
      .padding(0.4);

    const yMetric = d3
      .scaleLinear()
      .domain([0, d3.max(filteredChartData, (d) => d.metric) * 1.15])
      .range([topHeight, 0]);
    const yInventory =
      inventoryField &&
        filteredChartData.some(
          (d) => d.Inventory !== undefined && d.Inventory !== null
        )
        ? d3
          .scaleLinear()
          .domain([
            0,
            d3.max(filteredChartData, (d) => d.Inventory || 0) * 1.15,
          ])
          .range([topHeight, 0])
        : null;

    const maxPercent =
      d3.max([
        ...filteredChartData.map((d) => d.percent),
        ...peerMedians.filter((v) => v !== null),
      ]) * 1.15 || 100;

    const yPercent = d3
      .scaleLinear()
      .domain([0, maxPercent])
      .range([bottomHeight, 0]);

    // X-axes
    g.append("g")
      .attr("transform", `translate(0,${topHeight})`)
      .call(d3.axisBottom(bandTop).tickSize(0))
      .selectAll("text")
      .attr("font-size", "12px")
      .attr("fill", "#444");
    if (inventoryField && yInventory) {
      g.append("g")
        .attr("transform", `translate(${innerWidth / 2},${topHeight})`)
        .call(d3.axisBottom(bandTop).tickSize(0))
        .selectAll("text")
        .attr("font-size", "12px")
        .attr("fill", "#444");
    }
    g.append("g")
      .attr("transform", `translate(0,${topHeight + gap + bottomHeight})`)
      .call(d3.axisBottom(bandBottom).tickSize(0))
      .selectAll("text")
      .attr("font-size", "12px")
      .attr("fill", "#444");

    // Y-axes
    g.append("g")
      .call(
        d3
          .axisLeft(yMetric)
          .ticks(6)
          .tickFormat((d) =>
            d === 0 ? "" : `${d3.format(",")(Math.round(d))}`
          )
      )
      .selectAll("text")
      .attr("font-size", "10px");
    if (inventoryField && yInventory) {
      g.append("g")
        .attr("transform", `translate(${innerWidth / 2}, 0)`)
        .call(
          d3
            .axisLeft(yInventory)
            .ticks(6)
            .tickFormat((d) =>
              d === 0 ? "" : `${d3.format(",")(Math.round(d))}`
            )
        )
        .selectAll("text")
        .attr("font-size", "10px");
    }
    g.append("g")
      .attr("transform", `translate(0, ${topHeight + gap})`)
      .call(
        d3
          .axisLeft(yPercent)
          .ticks(5)
          .tickFormat((d) => d + "%")
      )
      .selectAll("text")
      .attr("font-size", "10px");

    // Chart titles
    g.append("text")
      .attr(
        "x",
        inventoryField ? innerWidth / 4 : innerWidth / 2
      )
      .attr("y", -25)
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .attr("font-size", 15)
      .text(chartTitleLeft);

    if (inventoryField && yInventory) {
      g.append("text")
        .attr("x", (3 * innerWidth) / 4)
        .attr("y", -25)
        .attr("text-anchor", "middle")
        .attr("font-weight", "bold")
        .attr("font-size", 15)
        .text(chartTitleRight);
    }

    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", topHeight + gap - 18)
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .attr("font-size", 15)
      .text(percentTitle);

    // Main metric bars
    g.selectAll(".metric-bar")
      .data(filteredChartData)
      .join("rect")
      .attr("class", "metric-bar")
      .attr("x", (d) => bandTop(d.year))
      .attr("y", (d) => yMetric(d.metric))
      .attr("width", bandTop.bandwidth())
      .attr("height", (d) => topHeight - yMetric(d.metric))
      .attr("fill", MAIN_COLOR)
      .attr("rx", 4)
      .on("mouseover", (event, d) => {
        tooltip
          .style("visibility", "visible")
          .html(
            `<b>Year:</b> ${escapeHtml(d.year)}<br/><b>${escapeHtml(
              chartTitleLeft
            )}:</b> $${escapeHtml(d3.format(",")(d.metric))} mn`
          );
      })
      .on("mousemove", (event) => {
        const svgRect = svgRef.current.getBoundingClientRect();
        const tip = tooltipRef.current;
        const tipWidth = tip.offsetWidth || 140;
        const tipHeight = tip.offsetHeight || 44;
        let left = event.clientX - svgRect.left + 12;
        let top = event.clientY - svgRect.top - tipHeight - 14;
        if (left + tipWidth > svgRect.width)
          left = svgRect.width - tipWidth - 8;
        if (left < 0) left = 8;
        if (top < 0) top = 8;
        if (top + tipHeight > svgRect.height)
          top = svgRect.height - tipHeight - 8;
        tooltip.style("left", left + "px").style("top", top + "px");
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    g.selectAll(".metric-label")
      .data(filteredChartData)
      .join("text")
      .attr("x", (d) => bandTop(d.year) + bandTop.bandwidth() / 2)
      .attr("y", (d) => yMetric(d.metric) - 7)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#222")
      .text((d) => d3.format(",")(Math.round(d.metric)));

    if (inventoryField && yInventory) {
      g.selectAll(".inventory-bar")
        .data(filteredChartData)
        .join("rect")
        .attr("class", "inventory-bar")
        .attr("x", (d) => bandTop(d.year) + innerWidth / 2)
        .attr("y", (d) => yInventory(d.Inventory))
        .attr("width", bandTop.bandwidth())
        .attr("height", (d) => topHeight - yInventory(d.Inventory))
        .attr("fill", MAIN_COLOR)
        .attr("rx", 4)
        .on("mouseover", (event, d) => {
          tooltip
            .style("visibility", "visible")
            .html(
              `<b>Year:</b> ${escapeHtml(d.year)}<br/><b>${escapeHtml(
                chartTitleRight
              )}:</b> $${escapeHtml(d3.format(",")(d.Inventory))} mn`
            );
        })
        .on("mousemove", (event) => {
          const svgRect = svgRef.current.getBoundingClientRect();
          const tip = tooltipRef.current;
          const tipWidth = tip.offsetWidth || 140;
          const tipHeight = tip.offsetHeight || 44;
          let left = event.clientX - svgRect.left + 12;
          let top = event.clientY - svgRect.top - tipHeight - 14;
          if (left + tipWidth > svgRect.width)
            left = svgRect.width - tipWidth - 8;
          if (left < 0) left = 8;
          if (top < 0) top = 8;
          if (top + tipHeight > svgRect.height)
            top = svgRect.height - tipHeight - 8;
          tooltip.style("left", left + "px").style("top", top + "px");
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

      g.selectAll(".inventory-label")
        .data(filteredChartData)
        .join("text")
        .attr(
          "x",
          (d) => bandTop(d.year) + innerWidth / 2 + bandTop.bandwidth() / 2
        )
        .attr("y", (d) => yInventory(d.Inventory) - 7)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("fill", "#222")
        .text((d) => d3.format(",")(Math.round(d.Inventory)));
    }

    // Percent bars (Company)
    g.selectAll(".percent-bar")
      .data(filteredChartData)
      .join("rect")
      .attr("x", (d) => bandBottom(d.year))
      .attr("y", (d) => topHeight + gap + yPercent(d.percent))
      .attr("width", bandBottom.bandwidth() / 2)
      .attr("height", (d) => bottomHeight - yPercent(d.percent))
      .attr("fill", MAIN_COLOR)
      .attr("rx", 4)
      .on("mouseover", (event, d) => {
        tooltip
          .style("visibility", "visible")
          .html(
            `<b>${escapeHtml(companyName)}</b><br/><b>Year:</b> ${escapeHtml(
              d.year
            )}<br/><b>${escapeHtml(
              percentTitle.replace(" (%)", "")
            )}:</b> ${escapeHtml(d.percent.toFixed(1))}%`
          );
      })
      .on("mousemove", (event) => {
        const svgRect = svgRef.current.getBoundingClientRect();
        const tip = tooltipRef.current;
        const tipWidth = tip.offsetWidth || 140;
        const tipHeight = tip.offsetHeight || 44;
        let left = event.clientX - svgRect.left + 12;
        let top = event.clientY - svgRect.top - tipHeight - 14;
        if (left + tipWidth > svgRect.width)
          left = svgRect.width - tipWidth - 8;
        if (left < 0) left = 8;
        if (top < 0) top = 8;
        if (top + tipHeight > svgRect.height)
          top = svgRect.height - tipHeight - 8;
        tooltip.style("left", left + "px").style("top", top + "px");
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    g.selectAll(".percent-label")
      .data(filteredChartData)
      .join("text")
      .attr("x", (d) => bandBottom(d.year) + bandBottom.bandwidth() / 4)
      .attr("y", (d) => topHeight + gap + yPercent(d.percent) - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#222")
      .text((d) => `${d.percent.toFixed(1)}%`);

    // === Peer Median bars ===
    g.selectAll(".peer-percent-bar")
      .data(peerData.filter((d) => d.value > 0))
      .join("rect")
      .attr("class", "peer-percent-bar")
      .attr("x", (d) => bandBottom(d.year) + bandBottom.bandwidth() / 2)
      .attr("y", (d) => topHeight + gap + yPercent(d.value))
      .attr("width", bandBottom.bandwidth() / 2)
      .attr("height", (d) => bottomHeight - yPercent(d.value))
      .attr("fill", PEER_COLOR)
      .attr("rx", 4)
      .on("mouseover", (event, d) => {
        tooltip
          .style("visibility", "visible")
          .html(
            `<b>Peer Median</b><br/><b>Year:</b> ${escapeHtml(
              d.year
            )}<br/><b>${escapeHtml(
              percentTitle.replace(" (%)", "")
            )}:</b> ${d.value.toFixed(2)}%`
          );
      })
      .on("mousemove", (event) => {
        const svgRect = svgRef.current.getBoundingClientRect();
        const tip = tooltipRef.current;
        const tipWidth = tip.offsetWidth || 140;
        const tipHeight = tip.offsetHeight || 44;
        let left = event.clientX - svgRect.left + 12;
        let top = event.clientY - svgRect.top - tipHeight - 14;
        if (left + tipWidth > svgRect.width) left = svgRect.width - tipWidth - 8;
        if (left < 0) left = 8;
        if (top < 0) top = 8;
        if (top + tipHeight > svgRect.height) top = svgRect.height - tipHeight - 8;
        tooltip.style("left", left + "px").style("top", top + "px");
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    // === Peer Median labels ===
    g.selectAll(".peer-percent-label")
      .data(peerData.filter((d) => d.value > 0))
      .join("text")
      .attr("x", (d) => bandBottom(d.year) + (bandBottom.bandwidth() * 3) / 4)
      .attr("y", (d) => topHeight + gap + yPercent(d.value) - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#222")
      .text((d) => `${d.value.toFixed(1)}%`);

    // Legend
    const legendY = topHeight + gap + bottomHeight + 40;
    g.append("rect")
      .attr("x", innerWidth / 2 - 120)
      .attr("y", legendY)
      .attr("width", 18)
      .attr("height", 18)
      .attr("fill", MAIN_COLOR)
      .attr("rx", 5);
    g.append("text")
      .attr("x", innerWidth / 2 - 95)
      .attr("y", legendY + 13)
      .attr("font-size", "13px")
      .text(companyName);

    g.append("rect")
      .attr("x", innerWidth / 2 + 100)
      .attr("y", legendY)
      .attr("width", 18)
      .attr("height", 18)
      .attr("fill", PEER_COLOR)
      .attr("rx", 5);
    g.append("text")
      .attr("x", innerWidth / 2 + 120)
      .attr("y", legendY + 13)
      .attr("font-size", "13px")
      .text("Peer Median");
  }, [
    data,
    width,
    height,
    highlightedCompany,
    metricField,
    inventoryField,
    percentField,
    chartTitleLeft,
    chartTitleRight,
    percentTitle,
  ]);

  return (
    <div
      style={{
        position: "relative",
        width: width,
        minHeight: height,
        margin: "0 auto",
        background: "#fff",
      }}
    >
      <svg ref={svgRef} width={width} height={height}></svg>
      <div ref={tooltipRef}></div>
    </div>
  );
}
--
import React, { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import "../../assets/css/RoadmapSwimlane.css";


// Utility to split long text for goal and phase labels
function splitText(text, maxLength = 35) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if ((current + word).length < maxLength) {
      current += (current ? " " : "") + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}


// Utility to escape HTML entities to prevent XSS
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


export default function RoadmapSwimlane({
  data, // { nodes, lanes, xBands, legend, phases, goal }
  functionName,
  kpi,
  width = 1400,
  height = 1200,
}) {
  const svgRef = useRef(null);

  const legendWidth = 240; // space reserved for legend so nodes don't overlap

  const layout = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      return null;
    }

    const margin = { top: 110, right: legendWidth, bottom: 110, left: 260 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const laneGap = innerH / (data.lanes.length - 1 || 1);
    const laneY = (laneIdx) => margin.top + laneIdx * laneGap;

    const phaseIds = data.xBands || [];
    const xScale = d3
      .scalePoint()
      .domain(phaseIds)
      .range([margin.left, margin.left + innerW - 70]) // 70px safety for legend
      .padding(0.5);

    const color = d3
      .scaleOrdinal()
      .domain(data.legend.map((l) => l.id))
      .range(data.legend.map((l) => l.color));

    // Group items by lane, then sort by phase order
    const byLane = d3.group(data.nodes, (d) => d.lane);
    const phaseOrder = new Map(phaseIds.map((p, i) => [p, i]));
    for (const [, arr] of byLane) {
      arr.sort((a, b) =>
        d3.ascending(phaseOrder.get(a.phase), phaseOrder.get(b.phase))
      );
    }

    // Position nodes, with vertical stacking if multiple lines per label
    const positions = new Map();
    for (const [laneName, arr] of byLane) {
      const iLane = data.lanes.indexOf(laneName);
      const y = laneY(iLane);

      const perPhase = d3.group(arr, (d) => d.phase);
      for (const [phase, items] of perPhase) {
        const baseX = xScale(phase);
        const hSpread = 96; // reduce so nodes don't run over legend!
        const vSpread = 25;
        const hStart = -((items.length - 1) * hSpread) / 2;
        const vStart = y - ((items.length - 1) * vSpread) / 2;
        items.forEach((d, j) => {
          positions.set(d.id, {
            x: baseX + hStart + j * hSpread,
            y: vStart + j * vSpread,
            laneIdx: iLane,
          });
        });
      }
    }

    // Links
    const links = [];
    for (const [laneName, arr] of byLane) {
      for (let i = 1; i < arr.length; i += 1) {
        links.push({
          source: arr[i - 1].id,
          target: arr[i].id,
          lane: laneName,
          toGoal: false,
        });
      }
    }
    const goal = {
      x: width - legendWidth,
      y: margin.top + innerH * 0.5,
      r: 75,
    };
    for (const [laneName, arr] of byLane) {
      const last = arr[arr.length - 1];
      links.push({
        source: last.id,
        target: "__GOAL__",
        lane: laneName,
        toGoal: true,
      });
    }
    return {
      margin,
      innerW,
      innerH,
      laneY,
      xScale,
      color,
      positions,
      links,
      goal,
      byLane,
    };
  }, [data, width, height]);

  useEffect(() => {
    if (!layout) {
      const svg = d3
        .select(svgRef.current)
        .attr("viewBox", `0 0 ${width} ${height}`);
      svg.selectAll("*").remove();
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("class", "no-data-message")
        .text(
          `No roadmap data available for ${functionName}${
            kpi ? ` - ${kpi}` : ""
          }`
        );
      return;
    }

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // PHASE BANDS
    layout.xScale.domain().forEach((phase, i) => {
      const x = layout.xScale(phase);
      const prev =
        i === 0
          ? layout.xScale(phase) - 120
          : layout.xScale(layout.xScale.domain()[i - 1]);
      const next =
        i === layout.xScale.domain().length - 1
          ? x + 120
          : layout.xScale(layout.xScale.domain()[i + 1]);
      const left = (x + prev) / 2;
      const right = (x + next) / 2;
      const bandW = right - left;

      g.append("rect")
        .attr("x", left - 10)
        .attr("y", layout.margin.top - 80)
        .attr("width", bandW + 20)
        .attr("height", layout.innerH + 140)
        .attr("rx", 18)
        .attr("class", `phase-band phase-${phase}`);

      // PHASE LABELS (multi-line)
      const labelText =
        data.phases?.find((p) => p.id === phase)?.label ?? phase;
      const lines = splitText(labelText, 36);

      const phaseText = g
        .append("text")
        .attr("x", x)
        .attr("y", layout.margin.top - 75)
        .attr("text-anchor", "middle")
        .attr("class", "phase-label");

      phaseText
        .selectAll("tspan")
        .data(lines)
        .enter()
        .append("tspan")
        .attr("x", x)
        .attr("dy", (_, i) => (i === 0 ? "0" : "1.2em"))
        .text((d) => d.trim());
    });

    // LANE LABELS
    data.lanes.forEach((lane, iLane) => {
      const y = layout.laneY(iLane);
      g.append("text")
        .attr("x", layout.margin.left - 45)
        .attr("y", y + 4)
        .attr("text-anchor", "end")
        .attr("class", "lane-label")
        .style("font-size", "21px")
        .text(lane);

      g.append("path")
        .attr(
          "d",
          d3.line()([
            [layout.margin.left - 20, y],
            [layout.margin.left + layout.innerW + 50, y],
          ])
        )
        .attr("class", "lane-spine");
    });

    // CONNECTORS
    const linkPath = (a, b, isGoal) => {
      if (isGoal) {
        const dx = b.x - a.x;
        const curvature = 0.65;
        const c1x = a.x + dx * curvature;
        const c2x = b.x - dx * curvature;
        return `M${a.x},${a.y} C${c1x},${a.y} ${c2x},${b.y} ${b.x},${b.y}`;
      } else {
        return `M${a.x},${a.y} L${b.x},${b.y}`;
      }
    };

    const allNodes = new Map([...layout.positions.entries()]);
    allNodes.set("__GOAL__", { x: layout.goal.x, y: layout.goal.y });

    g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(layout.links)
      .enter()
      .append("path")
      .attr("class", "connector")
      .attr("d", (d) => {
        const s = allNodes.get(d.source);
        const t = allNodes.get(d.target);
        return linkPath(s, t, d.toGoal);
      });

    // NODES
    const nodeG = g.append("g").attr("class", "nodes");
    const nodes = data.nodes.map((d) => ({
      ...d,
      ...layout.positions.get(d.id),
    }));

    // TOOLTIP
    const tooltip = d3
      .select(svgRef.current.parentNode)
      .append("div")
      .attr("class", "rm-tooltip")
      .style("opacity", 0);

    const nodeRadius = 14;

    // Node group rendering
    const item = nodeG
      .selectAll("g.item")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "item")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("mouseenter", function (event, d) {
        const { left, top } = svgRef.current.getBoundingClientRect();
        tooltip
          .style("opacity", 1)
          .html(
            `<div style='font-weight:bold;font-size:18px;'>${escapeHtml(
              d.lane
            )}</div>` +
              `<div style='font-size:17px;'>${d.label
                .split("\n")
                .map((l) => `<div>${escapeHtml(l)}</div>`)
                .join("")}</div>` +
              (d.enhanced_hypothesis
                ? `<div style='margin-top:6px;color:#666;font-size:13px;'>${escapeHtml(
                    d.enhanced_hypothesis
                  )}</div>`
                : "")
          )
          .style("left", event.clientX - left + nodeRadius + 15 + "px")
          .style("top", event.clientY - top - nodeRadius + "px");
      })
      .on("mousemove", function (event) {
        const { left, top } = svgRef.current.getBoundingClientRect();
        tooltip
          .style("left", event.clientX - left + nodeRadius + 15 + "px")
          .style("top", event.clientY - top - nodeRadius + "px");
      })
      .on("mouseleave", function () {
        tooltip.style("opacity", 0);
      });

    item
      .append("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => layout.color(d.tag))
      .attr("stroke", "#2f2f2f")
      .attr("stroke-width", 1.4);

    // *Multi-line SVG*
    item
      .append("text")
      .attr("x", 0)
      .attr("y", nodeRadius + 9)
      .attr("text-anchor", "middle")
      .attr("class", "item-label")
      .style("font-size", "17px")
      .style("font-weight", "500")
      .style("fill", "#222")
      .selectAll("tspan")
      .data((d) => d.label.split("\n"))
      .enter()
      .append("tspan")
      .attr("x", 0)
      .attr("dy", (line, i) => (i === 0 ? 0 : "1.25em"))
      .text((line) => line.trim());

    // GOAL BADGE
    const goalG = g
      .append("g")
      .attr("transform", `translate(${layout.goal.x},${layout.goal.y})`);

    goalG
      .append("circle")
      .attr("r", layout.goal.r)
      .attr("class", "goal-circle");

    const goalText = data.goal?.label || "Best in class planning ecosystem";
    const goalLines = splitText(goalText, 22);
    const txt = goalG
      .append("text")
      .attr("class", "goal-text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-size", "21px");
    txt
      .selectAll("tspan")
      .data(goalLines)
      .enter()
      .append("tspan")
      .attr("x", 0)
      .attr("dy", (_, i) => (i === 0 ? "0" : "1.7em"))
      .text((d) => d);

    // LEGEND OUTSIDE NODE RENDER AREA
    const legendG = svg
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width - legendWidth + 20}, ${70})`);
    legendG.append("text").attr("class", "legend-title").text("Legend");

    const rows = legendG
      .selectAll("g.row")
      .data(data.legend)
      .enter()
      .append("g")
      .attr("class", "row")
      .attr("transform", (_, i) => `translate(0, ${36 + i * 26})`);
    rows
      .append("rect")
      .attr("width", 16)
      .attr("height", 16)
      .attr("rx", 4)
      .attr("fill", (d) => d.color)
      .attr("stroke", "#333")
      .attr("stroke-width", 0.7);
    rows
      .append("text")
      .attr("x", 25)
      .attr("y", 13)
      .attr("class", "legend-label")
      .style("font-size", "15px")
      .text((d) => d.label);
  }, [layout, data, width, height, functionName, kpi]);

  return (
    <div className="roadmap-wrapper" style={{ position: "relative" }}>
      <svg ref={svgRef} className="roadmap-svg" />
    </div>
  );
}
--

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";

const getOTIF = (d) =>
  d["OTIF%"] !== undefined ? d["OTIF%"] :
  d["OTIF"] !== undefined ? d["OTIF"] : 0;

export default function WeeklyTrendLineChart({
  data = [],              // weekly_trends
  monthlyTrends = [],     // monthly_trends
}) {
  const svgRef = useRef();
  const [selectedMonth, setSelectedMonth] = useState("All");

  const hasWeekly = Array.isArray(data) && data.length > 0;
  const hasMonthly = Array.isArray(monthlyTrends) && monthlyTrends.length > 0;
  const hasData = hasWeekly || hasMonthly;

  // Latest year from weekly trends (fallback to current year)
  const latestYear = useMemo(() => {
    if (!hasWeekly) return new Date().getFullYear();
    const years = data.map(d => Number(d.year)).filter(y => !isNaN(y));
    return years.length ? Math.max(...years) : new Date().getFullYear();
  }, [data, hasWeekly]);

  // Build list of months from monthlyTrends for latestYear
  const availableMonths = useMemo(() => {
    if (!hasMonthly) return ["All"];
    const months = monthlyTrends
      .filter(m => Number(m.year) === latestYear)
      .map(m => m.month_name)
      .filter(Boolean);
    const unique = Array.from(new Set(months));
    return ["All", ...unique];
  }, [monthlyTrends, latestYear, hasMonthly]);

  useEffect(() => {
    setSelectedMonth("All");
  }, [data, monthlyTrends]);

  useEffect(() => {
    if (!hasData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 900;
    const height = 450;
    const margin = { top: 40, right: 100, bottom: 90, left: 70 };
    svg.attr("width", width).attr("height", height);

    // 1. Build the series to plot based on selectedMonth
    let weeklyDataRaw;

    if (selectedMonth === "All") {
      // Use full weekly_trends for latestYear
      weeklyDataRaw = (data || []).filter(
        d => Number(d.year) === latestYear
      );
    } else {
      // Find the monthlyTrends entry and use its weekly_breakdown
      const monthEntry = (monthlyTrends || []).find(
        m =>
          Number(m.year) === latestYear &&
          m.month_name === selectedMonth
      );

      weeklyDataRaw = monthEntry?.weekly_breakdown || [];
    }

    // Normalize weeks to numbers for sorting and labels
    const weeklyData = weeklyDataRaw
      .map(d => {
        let weekNum;
        if (typeof d.week === "number") {
          weekNum = d.week;
        } else if (typeof d.week === "string") {
          const match = d.week.match(/(\d+)/);
          weekNum = match ? parseInt(match[1], 10) : NaN;
        } else {
          weekNum = NaN;
        }
        return {
          ...d,
          weekNum,
          otif: parseFloat(getOTIF(d)) || 0,
        };
      })
      .filter(d => !isNaN(d.weekNum))
      .sort((a, b) => a.weekNum - b.weekNum);

    if (!weeklyData.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("font-weight", "600")
        .text(
          `No weekly OTIF data available for ${latestYear}${
            selectedMonth !== "All" ? ` — ${selectedMonth}` : ""
          }`
        );
      return;
    }

    // ------------------------ X SCALE WITH EXTRA GAP ------------------------
    const rawWeeks = weeklyData.map(d => d.weekNum);

    // Build a domain that inserts an empty slot after 52 when 53 exists
    const xDomain = [];
    rawWeeks.forEach((wk, idx) => {
      xDomain.push(wk);
      const next = rawWeeks[idx + 1];
      if (wk === 52 && next === 53) {
        xDomain.push("gap_52_53"); // dummy band for extra spacing
      }
    });

    const xScale = d3
      .scaleBand()
      .domain(xDomain)
      .range([margin.left, width - margin.right - 10])
      .padding(0.3);

    // Helper to get X for a real week number (ignores the gap key)
    const getXForWeek = (weekNum) =>
      xScale(weekNum) + xScale.bandwidth() / 2;

    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const visibleTicks = xDomain.filter(v => v !== "gap_52_53");

    const xAxis =
      selectedMonth === "All"
        ? d3
            .axisBottom(xScale)
            .tickValues(
              visibleTicks.filter(
                (wk, i) =>
                  i % 3 === 0 || i === 0 || i === visibleTicks.length - 1
              )
            )
            .tickFormat(weekNum => `Week${weekNum}`)
        : d3
            .axisBottom(xScale)
            .tickValues(visibleTicks)
            .tickFormat(weekNum => `wk${weekNum}`);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(xAxis)
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-0.8em")
      .attr("dy", "0.15em")
      .style("font-size", "14px");

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).tickFormat(d3.format(".0f")));

    // ------------------------ LINE & DOTS (NO BREAKS FOR ZERO) ------------------------
    const line = d3
      .line()
      .x(d => getXForWeek(d.weekNum))
      .y(d => yScale(d.otif));

    svg
      .append("path")
      .datum(weeklyData)
      .attr("fill", "none")
      .attr("stroke", "#224BFF")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // Tooltip
    let tooltip = d3
      .select(svgRef.current.parentNode)
      .select(".d3-tooltip");
    if (tooltip.empty()) {
      tooltip = d3
        .select(svgRef.current.parentNode)
        .append("div")
        .attr("class", "d3-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px")
        .style("padding", "8px 12px")
        .style("font-size", "14px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
        .style("pointer-events", "none")
        .style("z-index", "1000");
    }

    svg
      .selectAll(".dot")
      .data(weeklyData)
      .enter()
      .append("circle")
      .attr("cx", d => getXForWeek(d.weekNum))
      .attr("cy", d => yScale(d.otif))
      .attr("r", 5)
      .attr("fill", "#224BFF")
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const label =
          selectedMonth === "All"
            ? `Week${d.weekNum}`
            : `wk${d.weekNum}`;
        tooltip
          .style("visibility", "visible")
          .html(
            `<strong>${label}</strong><br/>OTIF: ${d.otif.toFixed(2)}%`
          );
      })
      .on("mousemove", event => {
        const svgRect = svgRef.current.getBoundingClientRect();
        const tooltipWidth = 140;
        const tooltipHeight = 60;
        let left = event.clientX - svgRect.left + 15;
        let top = event.clientY - svgRect.top - 28;
        if (left + tooltipWidth > svgRect.width) left -= tooltipWidth + 30;
        if (top < 0) top = 0;
        if (top + tooltipHeight > svgRect.height) top -= tooltipHeight;
        tooltip.style("left", `${left}px`).style("top", `${top}px`);
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "18px")
      .style("font-weight", "600")
      .text(
        `Weekly OTIF Trend (${latestYear})${
          selectedMonth !== "All" ? ` — ${selectedMonth}` : ""
        }`
      );

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text("Week");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text("OTIF (%)");
  }, [hasData, data, monthlyTrends, selectedMonth, latestYear]);

  if (!hasData) {
    return (
      <div className="alert alert-info" style={{ margin: "2rem 0" }}>
        <strong>No weekly trend data available</strong> for the current selection.
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "20px 0",
        position: "relative",
        overflow: "visible",
      }}
    >
      <div style={{ marginBottom: "16px", fontSize: "16px" }}>
        <label style={{ fontWeight: "600" }}>
          Select Month:{" "}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{
              marginLeft: "8px",
              padding: "6px 12px",
              fontSize: "15px",
              borderRadius: "4px",
            }}
          >
            {availableMonths.map(month => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height="450"
        style={{ maxWidth: "100%", overflow: "visible" }}
      />
    </div>
  );
}
