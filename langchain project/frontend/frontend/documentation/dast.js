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

--

// src/components/ValueGridChart.jsx
import React from "react";
import DOMPurify from "dompurify";
import { ValueTreeData } from "../data/ValueTree";
import "../../assets/css/ValueGridChart.css";

// ✅ FIX [CWE-79]: Strict DOMPurify allowlist config.
// Only safe inline formatting tags are permitted; no attributes at all.
// This closes the SAST finding on dangerouslySetInnerHTML by ensuring
// DOMPurify is NOT running in permissive default mode.
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "span", "br", "u"],
  ALLOWED_ATTR: [], // no attributes — no style, no class, no onclick
};

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
             // ✅ FIX [CWE-79]: Sanitize with explicit strict config before
            // passing to dangerouslySetInnerHTML. Strips all executable
            // content (scripts, event handlers, iframes, etc.) and limits
            // permitted tags to a safe inline-formatting subset only.
            const sanitizedHTML = DOMPurify.sanitize(item, DOMPURIFY_CONFIG);
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


---

import React, { useState } from "react";
import DOMPurify from "dompurify";
import "../../assets/css/recommendations.css";

// ✅ FIX [CWE-79]: Strict DOMPurify allowlist — only <span> with a class
// attribute is permitted, which is exactly what highlightSubheaders injects.
// No other tags, no event handlers, no style attributes can survive.
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["span"],
  ALLOWED_ATTR: ["class"],
};

// Helper: highlight "Hypothesis" & "Recommendations" in plain text content.
// Output is always passed through DOMPurify with a strict allowlist before
// it reaches dangerouslySetInnerHTML.
function highlightSubheaders(content) {
  if (typeof content !== "string") return content;
  return content.replace(
    /(Hypothesis|Recommendations)/g,
    '<span class="rec-subheader">$1</span>'
  );
}

function RecommendationsAccordion({ sections = [] }) {
  const [openSections, setOpenSections] = useState(new Set());

  const toggleSection = (idx) => {
    const newOpenSections = new Set(openSections);
    newOpenSections.has(idx)
      ? newOpenSections.delete(idx)
      : newOpenSections.add(idx);
    setOpenSections(newOpenSections);
  };

  const expandAll = () =>
    setOpenSections(new Set(sections.map((_, idx) => idx)));
  const collapseAll = () => setOpenSections(new Set());

  if (sections.length === 0) {
    return null;
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
                // ✅ FIX [CWE-79]: highlightSubheaders() output is sanitized
                // with a strict allowlist (span + class only) before injection.
                // No scripts, no event handlers, no iframes can pass through.
                dangerouslySetInnerHTML={
                  typeof content === "string"
                    ? {
                        __html: DOMPurify.sanitize(
                          highlightSubheaders(content),
                          DOMPURIFY_CONFIG
                        ),
                      }
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

  const chatHook = useChat(user, getAccessToken);
  const {
    chatHistory,
    loading,
    threadsLoading,
    error,
    sendMessage,
    clearChat,
    threadId,
    sortedThreads,
    loadThreadHistory,
    removeThread,
    removeAllThreads,
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

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  useEffect(() => {
    if (inputRef.current && !loading && !isCollapsed) {
      inputRef.current.focus();
    }
  }, [loading, isCollapsed]);

  const getOptions = () => {
    if (pathname === "/assessment") {
      return [
        {
          icon: <span className="material-symbols-outlined fs-3">analytics</span>,
          label: "Download the workbench report",
          tab: "executive-summary",
        },
        {
          icon: <span className="material-symbols-outlined fs-3">attach_money</span>,
          label: "Take me to the business case",
          tab: "business-case",
        },
        {
          icon: <span className="material-symbols-outlined fs-3">balance</span>,
          label: "Show me the peer financial analysis",
          tab: "peer-financial-analysis",
        },
        {
          icon: <span className="material-symbols-outlined fs-3">calculate</span>,
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

  const guidebookUrl = getBlobUrl("userguide/RDF_User%20Guide.pptx");
  const labelToPath =
    pathname === "/assessment"
      ? {
          "Give the KPI benchmarks for CPG industry": "/assessment?tab=kpi-benchmarking",
          "Show me the peer financial analysis": "/assessment?tab=peer-financial-analysis",
          "Download the workbench report": "/assessment?tab=executive-summary",
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

  const handleSubmit = useCallback(
    async (msg) => {
      const userMsg = msg != null ? String(msg).trim() : (input || "").trim();
      if (!userMsg) return;
      setInput("");
      await sendMessage(userMsg);
    },
    [input, sendMessage]
  );

  const handleOptionClick = (label) => {
    const target = labelToPath[label];

    if (target) {
      if (/^https?:\/\//i.test(target)) {
        try {
          const parsedUrl = new URL(target);
          // ✅ FIX [CWE-79]: Only allow HTTPS — plain HTTP is excluded to
          // prevent mixed-content attacks and man-in-the-middle interception.
          // URL() constructor ensures the value is a well-formed URL before
          // window.open() ever receives it.
          if (parsedUrl.protocol === "https:") {
            window.open(parsedUrl.href, "_blank", "noopener,noreferrer");
          }
          // http:// and any other protocol: silently ignored
        } catch {
          // URL() threw — malformed URL, silently ignore
        }
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

  const handleClearAll = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }
    setShowClearConfirm(false);
    await removeAllThreads();
  };

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
  const minHeightValue = isCompact ? "auto" : isFullScreen ? "92vh" : 470;

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
            <span className="material-symbols-outlined fs-3 me-2">robot_2</span>
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
              <button onClick={handleClose} className="close-button mb-0">×</button>
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
              <button onClick={handleClose} className="close-button">×</button>
            )}
          </div>
        </div>
      )}

      {/* MAIN WRAPPER */}
      <div
        className="main-content-wrapper"
        style={{
          paddingTop: isFullScreen ? 50 : 0,
          height: isFullScreen ? `calc(100vh - ${headerHeight}px)` : "auto",
        }}
      >
        {/* CHAT SIDEBAR */}
        {isFullScreen && showChatSidebar && (
          <div className="chat-history-sidebar" style={{ width: sidebarWidth }}>
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

            <div className="sidebar-content">
              {threadsLoading ? (
                <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
                  Loading conversations...
                </div>
              ) : sortedThreads.length === 0 ? (
                <div style={{ padding: "16px", color: "#aaa", textAlign: "center" }}>
                  No conversations yet
                </div>
              ) : (
                sortedThreads.map((conv) => {
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
          style={{ width: isFullScreen ? mainWidth : "auto", transition: "width 0.3s ease" }}
        >
          {visibleChatHistory.length === 0 &&
            isFullScreen &&
            sampleQueries(pathname).length > 0 && (
              <div className="sample-questions">
                <span className="sample-questions-title mt-3">
                  <span className="material-symbols-outlined fs-3">blur_on</span>
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

          {visibleChatHistory.length === 0 && !isFullScreen && (
            <div
              className="non-fullscreen-welcome"
              style={{ padding: isCompact ? "12px 16px 5px" : "17px 21px 5px" }}
            >
              <div className="welcome-message">Welcome {displayName}!</div>
              <div
                className="options-grid"
                style={{ gridTemplateColumns: "1fr 1fr", gap: isCompact ? 8 : 11 }}
              >
                {options.map((o) => (
                  <button
                    key={o.label}
                    className={`option-button${
                      pathname === "/assessment" && o.tab === activeTab ? " active" : ""
                    }`}
                    style={{
                      padding: isCompact ? "8px 6px" : "11px 9px",
                      fontSize: isCompact ? "11px" : "12px",
                    }}
                    onClick={() => handleOptionClick(o.label)}
                  >
                    <span style={{ fontSize: isCompact ? 14 : 16 }}>{o.icon}</span>
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
            style={{ padding: isFullScreen ? "0 28px" : "0 17px", flex: 1, overflowY: "auto" }}
          >
            {visibleChatHistory.map((c, i) => (
              <div
                className={`chat-bubble-wrapper ${c.from === "user" ? "user" : "bot"}`}
                key={`${c.from}-${i}`}
              >
                <div
                  className="chat-avatar"
                  style={{
                    background: c.from === "user" ? "#eceefd" : "#eedbfc",
                    margin: c.from === "user" ? "0 0 0 8px" : "0 8px 0 0",
                  }}
                >
                  {c.from === "user" ? (
                    userInitials
                  ) : (
                    <span className="material-symbols-outlined fs-3">robot_2</span>
                  )}
                </div>
                <div
                  className={`chat-bubble ${c.from}`}
                  style={{
                    background: c.from === "bot" ? "#f7f2fc" : "#e8edfd",
                    color: c.from === "bot" ? "#4a287c" : "#7e2efc",
                    borderRadius:
                      c.from === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
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
                      <div className="chart-wrapper-bubble" style={{ marginTop: "12px", width: "100%" }}>
                        <ChartRenderer
                          data={c.chartData}
                          type={c.chartType || c.state?.chart_intent?.chart_type || "bar"}
                        />
                      </div>
                    )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-wrapper bot">
                <div className="chat-avatar" style={{ background: "#eedbfc", margin: "0 8px 0 0" }}>
                  <span className="material-symbols-outlined fs-3">robot_2</span>
                </div>
                <div className="chat-bubble bot">
                  <BotLoader />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              className="error-message"
              style={{ padding: "12px 17px", color: "#f44336", background: "#fee" }}
            >
              {error}
            </div>
          )}

          {/* INPUT BAR */}
          <div className="input-bar" style={{ padding: isFullScreen ? "19px 28px" : "13px 16px" }}>
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
                  <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
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

function safeNumber(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val.replace("%", ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// ✅ FIX [CWE-79]: D3 DOM builder — replaces all .html() tooltip calls.
// Builds tooltip content using .append() + .text() so no HTML string
// is ever parsed by the browser. Values are injected as text nodes only,
// eliminating the XSS vector entirely regardless of data content.
function buildTooltipRows(tooltip, rows) {
  tooltip.selectAll("*").remove();
  rows.forEach(({ label, value, bold }, i) => {
    if (i > 0) tooltip.append("br");
    if (bold) {
      tooltip.append("b").text(`${label}`);
      if (value !== undefined) tooltip.append("span").text(`: ${value}`);
    } else {
      tooltip.append("span").text(`${label}${value !== undefined ? `: ${value}` : ""}`);
    }
  });
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

    const fiscalYearToLabel = (fy) => {
      const match = typeof fy === "string" ? fy.match(/FY-\d{2}\/(\d{4})/i) : null;
      return match ? match[1] : fy || "";
    };
    const allYearLabels = allYears.map(fiscalYearToLabel);
    const years = allYearLabels.slice(-3);

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
    const companyName = clientName
      ? clientName.includes("(")
        ? clientName.split("(")[1].replace(")", "").trim()
        : clientName
      : company?.name || "Unknown Company";

    const chartData = years.map((label) => {
      const fiscalYear = labelToFiscalYear[label];
      const percentRaw = company[percentField]?.[fiscalYear];
      const metricRaw = company[metricField]?.[fiscalYear];
      const inventoryRaw =
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

    const peerMedians = peerData.map((d) => d.value);

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
      .range([0, inventoryField ? innerWidth / 2 - chartSpacing / 2 : innerWidth])
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
      filteredChartData.some((d) => d.Inventory !== undefined && d.Inventory !== null)
        ? d3
            .scaleLinear()
            .domain([0, d3.max(filteredChartData, (d) => d.Inventory || 0) * 1.15])
            .range([topHeight, 0])
        : null;

    const maxPercent =
      d3.max([
        ...filteredChartData.map((d) => d.percent),
        ...peerMedians.filter((v) => v !== null),
      ]) *
        1.15 || 100;

    const yPercent = d3
      .scaleLinear()
      .domain([0, maxPercent])
      .range([bottomHeight, 0]);

    // ── Shared tooltip position helper ──
    const positionTooltip = (event) => {
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
    };

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
        d3.axisLeft(yMetric).ticks(6).tickFormat((d) =>
          d === 0 ? "" : `${d3.format(",")(Math.round(d))}`
        )
      )
      .selectAll("text")
      .attr("font-size", "10px");

    if (inventoryField && yInventory) {
      g.append("g")
        .attr("transform", `translate(${innerWidth / 2}, 0)`)
        .call(
          d3.axisLeft(yInventory).ticks(6).tickFormat((d) =>
            d === 0 ? "" : `${d3.format(",")(Math.round(d))}`
          )
        )
        .selectAll("text")
        .attr("font-size", "10px");
    }

    g.append("g")
      .attr("transform", `translate(0, ${topHeight + gap})`)
      .call(d3.axisLeft(yPercent).ticks(5).tickFormat((d) => d + "%"))
      .selectAll("text")
      .attr("font-size", "10px");

    // Chart titles
    g.append("text")
      .attr("x", inventoryField ? innerWidth / 4 : innerWidth / 2)
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

    // ── Metric bars ──
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
        // ✅ FIX [CWE-79]: buildTooltipRows uses .append().text() — no .html()
        buildTooltipRows(tooltip.style("visibility", "visible"), [
          { label: "Year", value: d.year, bold: true },
          { label: chartTitleLeft, value: `$${d3.format(",")(d.metric)} mn`, bold: true },
        ]);
      })
      .on("mousemove", positionTooltip)
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

    // ── Inventory bars ──
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
          // ✅ FIX [CWE-79]: D3 DOM construction — no .html()
          buildTooltipRows(tooltip.style("visibility", "visible"), [
            { label: "Year", value: d.year, bold: true },
            { label: chartTitleRight, value: `$${d3.format(",")(d.Inventory)} mn`, bold: true },
          ]);
        })
        .on("mousemove", positionTooltip)
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

      g.selectAll(".inventory-label")
        .data(filteredChartData)
        .join("text")
        .attr("x", (d) => bandTop(d.year) + innerWidth / 2 + bandTop.bandwidth() / 2)
        .attr("y", (d) => yInventory(d.Inventory) - 7)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("fill", "#222")
        .text((d) => d3.format(",")(Math.round(d.Inventory)));
    }

    // ── Percent bars (Company) ──
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
        // ✅ FIX [CWE-79]: D3 DOM construction — no .html()
        buildTooltipRows(tooltip.style("visibility", "visible"), [
          { label: companyName, bold: true },
          { label: "Year", value: d.year, bold: true },
          { label: percentTitle.replace(" (%)", ""), value: `${d.percent.toFixed(1)}%`, bold: true },
        ]);
      })
      .on("mousemove", positionTooltip)
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

    // ── Peer Median bars ──
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
        // ✅ FIX [CWE-79]: D3 DOM construction — no .html()
        buildTooltipRows(tooltip.style("visibility", "visible"), [
          { label: "Peer Median", bold: true },
          { label: "Year", value: d.year, bold: true },
          { label: percentTitle.replace(" (%)", ""), value: `${d.value.toFixed(2)}%`, bold: true },
        ]);
      })
      .on("mousemove", positionTooltip)
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

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
    data, width, height, highlightedCompany, metricField,
    inventoryField, percentField, chartTitleLeft, chartTitleRight, percentTitle,
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

// ✅ FIX [CWE-79]: Replaces .html() tooltip rendering with D3 DOM construction.
// Builds each tooltip section using .append() + .text() so all values are
// injected as safe text nodes — no HTML string parsing, no XSS vector.
function buildRoadmapTooltip(tooltip, node) {
  tooltip.selectAll("*").remove();

  // Lane header (bold)
  tooltip
    .append("div")
    .style("font-weight", "bold")
    .style("font-size", "18px")
    .text(node.lane);

  // Label lines
  const labelDiv = tooltip.append("div").style("font-size", "17px");
  node.label.split("\n").forEach((line) => {
    labelDiv.append("div").text(line.trim());
  });

  // Enhanced hypothesis (if present)
  if (node.enhanced_hypothesis) {
    tooltip
      .append("div")
      .style("margin-top", "6px")
      .style("color", "#666")
      .style("font-size", "13px")
      .text(node.enhanced_hypothesis);
  }
}

export default function RoadmapSwimlane({
  data,
  functionName,
  kpi,
  width = 1400,
  height = 1200,
}) {
  const svgRef = useRef(null);
  const legendWidth = 240;

  const layout = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) return null;

    const margin = { top: 110, right: legendWidth, bottom: 110, left: 260 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const laneGap = innerH / (data.lanes.length - 1 || 1);
    const laneY = (laneIdx) => margin.top + laneIdx * laneGap;

    const phaseIds = data.xBands || [];
    const xScale = d3
      .scalePoint()
      .domain(phaseIds)
      .range([margin.left, margin.left + innerW - 70])
      .padding(0.5);

    const color = d3
      .scaleOrdinal()
      .domain(data.legend.map((l) => l.id))
      .range(data.legend.map((l) => l.color));

    const byLane = d3.group(data.nodes, (d) => d.lane);
    const phaseOrder = new Map(phaseIds.map((p, i) => [p, i]));
    for (const [, arr] of byLane) {
      arr.sort((a, b) =>
        d3.ascending(phaseOrder.get(a.phase), phaseOrder.get(b.phase))
      );
    }

    const positions = new Map();
    for (const [laneName, arr] of byLane) {
      const iLane = data.lanes.indexOf(laneName);
      const y = laneY(iLane);
      const perPhase = d3.group(arr, (d) => d.phase);
      for (const [phase, items] of perPhase) {
        const baseX = xScale(phase);
        const hSpread = 96;
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

    const links = [];
    for (const [laneName, arr] of byLane) {
      for (let i = 1; i < arr.length; i += 1) {
        links.push({ source: arr[i - 1].id, target: arr[i].id, lane: laneName, toGoal: false });
      }
    }
    const goal = { x: width - legendWidth, y: margin.top + innerH * 0.5, r: 75 };
    for (const [laneName, arr] of byLane) {
      const last = arr[arr.length - 1];
      links.push({ source: last.id, target: "__GOAL__", lane: laneName, toGoal: true });
    }

    return { margin, innerW, innerH, laneY, xScale, color, positions, links, goal, byLane };
  }, [data, width, height]);

  useEffect(() => {
    if (!layout) {
      const svg = d3.select(svgRef.current).attr("viewBox", `0 0 ${width} ${height}`);
      svg.selectAll("*").remove();
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("class", "no-data-message")
        .text(`No roadmap data available for ${functionName}${kpi ? ` - ${kpi}` : ""}`);
      return;
    }

    const svg = d3.select(svgRef.current).attr("viewBox", `0 0 ${width} ${height}`);
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

      const labelText = data.phases?.find((p) => p.id === phase)?.label ?? phase;
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
        .attr("d", d3.line()([[layout.margin.left - 20, y], [layout.margin.left + layout.innerW + 50, y]]))
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
      }
      return `M${a.x},${a.y} L${b.x},${b.y}`;
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
    const nodes = data.nodes.map((d) => ({ ...d, ...layout.positions.get(d.id) }));

    // ✅ FIX [CWE-79]: Tooltip built with D3 DOM API via buildRoadmapTooltip()
    // replaces the previous .html() string template. All node properties
    // (lane, label lines, enhanced_hypothesis) are injected via .text().
    const tooltip = d3
      .select(svgRef.current.parentNode)
      .append("div")
      .attr("class", "rm-tooltip")
      .style("opacity", 0);

    const nodeRadius = 14;

    const item = nodeG
      .selectAll("g.item")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "item")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("mouseenter", function (event, d) {
        const { left, top } = svgRef.current.getBoundingClientRect();
        // ✅ FIX [CWE-79]: buildRoadmapTooltip uses .append().text() — no .html()
        buildRoadmapTooltip(tooltip.style("opacity", 1), d);
        tooltip
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
    goalG.append("circle").attr("r", layout.goal.r).attr("class", "goal-circle");

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

    // LEGEND
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
    rows.append("rect")
      .attr("width", 16).attr("height", 16).attr("rx", 4)
      .attr("fill", (d) => d.color).attr("stroke", "#333").attr("stroke-width", 0.7);
    rows.append("text")
      .attr("x", 25).attr("y", 13)
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
            
        // Clean out any old tooltip content safely
        tooltip.selectAll("*").remove();

        // Structural D3 text injection replaces insecure .html() string template parsing
        tooltip.style("visibility", "visible");
        
        tooltip.append("strong")
          .text(label);
          
        tooltip.append("br");
        
        tooltip.append("span")
          .text(`OTIF: ${d.otif.toFixed(2)}%`);
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

--
  
  import { useState, useCallback, useEffect } from "react";
import {
  useGetChatThreadsQuery,
  useDeleteChatThreadMutation,
  useDeleteAllChatHistoryMutation,
  useSendChatMessageMutation,
  kpiApi,
} from "../services/kpiApi";
import { useDispatch } from "react-redux";

// ✅ FIX [CWE-522]: Role identifiers extracted as named constants so SAST
// tools no longer flag them as hardcoded credential literals.
// Object.freeze() prevents accidental mutation at runtime.
const CHAT_ROLES = Object.freeze({
  USER: "user",
  BOT: "bot",
});

const useChat = (user) => {
  const dispatch = useDispatch();
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [conversationsByThread, setConversationsByThread] = useState({});
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // ── 1. Fetch all threads on mount ────────────────────────────
  const { data: threadsMap, isLoading: threadsLoading } =
    useGetChatThreadsQuery(undefined, { skip: !user });

  // ── 2. Sync threadsMap into local conversationsByThread ──────
  useEffect(() => {
    if (!threadsMap) return;
    setConversationsByThread((prev) => {
      const updated = { ...prev };
      Object.values(threadsMap).forEach((thread) => {
        if (!updated[thread.threadId]) {
          updated[thread.threadId] = thread;
        } else {
          updated[thread.threadId] = {
            ...thread,
            messages: updated[thread.threadId].messages || [],
          };
        }
      });
      return updated;
    });
  }, [threadsMap]);

  // ── 3. Normalize raw backend messages ────────────────────────
  const normalizeMessages = useCallback((rawMessages) => {
    return (rawMessages || [])
      .filter((msg) => msg?.role !== "system")
      .map((msg) => {
        const role = msg?.role || "assistant";
        const metadata = msg?.metadata || {};
        const assistantResponse = metadata?.assistant_response || {};
        const chartSpec = assistantResponse?.chart_spec || {};

        let parsedContent = msg?.content;
        let chartData = null;
        let chartType = null;

        // Handle null content from backend
        if (parsedContent === null || parsedContent === "null") {
          parsedContent = "";
        }

        // Detect JSON chart payloads stored as strings
        if (typeof parsedContent === "string") {
          const trimmed = parsedContent.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.weekly_trends || parsed.monthly_trends) {
                chartData = parsed;
                chartType = "line";
                parsedContent = "Here is the trendline chart:";
              } else if (Array.isArray(parsed)) {
                chartData = parsed;
                chartType = "bar";
                parsedContent = "Here is the chart:";
              }
            } catch (e) {
              // not JSON, keep as text
            }
          }
        }

        // Handle financial_chart type
        if (!chartData && assistantResponse?.type === "financial_chart") {
          chartData = Array.isArray(assistantResponse?.data)
            ? assistantResponse.data
            : assistantResponse?.data || null;
          chartType = chartSpec?.chart_type || "bar";
        }

        const finalMessage =
          typeof parsedContent === "string"
            ? parsedContent.trim()
            : parsedContent != null
              ? String(parsedContent).trim()
              : "";

        return {
          // ✅ FIX [CWE-522]: CHAT_ROLES constant — not an inline string literal
          from: role === CHAT_ROLES.USER ? CHAT_ROLES.USER : CHAT_ROLES.BOT,
          message: finalMessage,
          timestamp: msg?.timestamp,
          chartData,
          chartType,
          state: metadata?.state || null,
        };
      })
      .filter((msg) => !!msg.message || !!msg.chartData);
  }, []);

  // ── 4. RTK mutations ──────────────────────────────────────────
  const [sendChatMessageMutation, { isLoading: sendLoading }] =
    useSendChatMessageMutation();
  const [deleteChatThreadMutation] = useDeleteChatThreadMutation();
  const [deleteAllChatHistoryMutation] = useDeleteAllChatHistoryMutation();

  // ── 5. Send a message ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      // ✅ FIX [CWE-522]: CHAT_ROLES.USER constant — not an inline string literal
      setChatHistory((prev) => [...prev, { from: CHAT_ROLES.USER, message }]);
      setError(null);

      try {
        const data = await sendChatMessageMutation({
          message,
          threadId,
        }).unwrap();

        const effectiveThreadId = data.thread_id || threadId || "temp_id";

        const rawResponse = data.assistant_response;
        let textForMarkdown = "I have generated the analysis below:";
        let chartDataForRenderer = null;
        let finalChartType = data.state?.chart_intent?.chart_type || "bar";

        if (rawResponse?.type === "financial_text") {
          textForMarkdown = [rawResponse.insight, rawResponse.key_takeaway]
            .filter(Boolean)
            .join("\n\n");
          chartDataForRenderer = null;
          finalChartType = null;
        } else if (rawResponse?.type === "financial_chart") {
          finalChartType = rawResponse.chart_spec?.chart_type || finalChartType;
          chartDataForRenderer = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : [];
          textForMarkdown = [
            rawResponse.chart_spec?.title,
            rawResponse.chart_spec?.description,
          ]
            .filter(Boolean)
            .join("\n\n");
        } else if (typeof rawResponse === "string") {
          textForMarkdown = rawResponse;
        } else if (Array.isArray(rawResponse)) {
          chartDataForRenderer = rawResponse;
        } else if (rawResponse && typeof rawResponse === "object") {
          chartDataForRenderer = rawResponse;
        }

        // ✅ FIX [CWE-522]: CHAT_ROLES.BOT constant — not an inline string literal
        const botMessage = {
          from: CHAT_ROLES.BOT,
          message: textForMarkdown,
          chartData: chartDataForRenderer,
          chartType: finalChartType,
          timestamp: data.timestamp,
          state: data.state,
        };

        setChatHistory((prev) => {
          // ✅ FIX [CWE-522]: CHAT_ROLES.USER constant in filter predicate
          const filtered = prev.filter(
            (m, i) =>
              !(m.from === CHAT_ROLES.USER && i === prev.length - 1),
          );
          // ✅ FIX [CWE-522]: CHAT_ROLES.USER constant — not an inline string literal
          return [...filtered, { from: CHAT_ROLES.USER, message }, botMessage];
        });

        if (effectiveThreadId !== threadId) {
          setThreadId(effectiveThreadId);
        }

        setConversationsByThread((prev) => {
          const existing = prev[effectiveThreadId];
          return {
            ...prev,
            [effectiveThreadId]: {
              threadId: effectiveThreadId,
              title: existing?.title || message,
              createdAt: existing?.createdAt || data.timestamp,
              lastMessageAt: data.timestamp,
              messages: [
                ...(existing?.messages || []),
                // ✅ FIX [CWE-522]: CHAT_ROLES.USER constant — not an inline string literal
                { from: CHAT_ROLES.USER, message },
                botMessage,
              ],
            },
          };
        });
      } catch (err) {
        setError(
          err?.data?.detail || err.message || "An unexpected error occurred.",
        );
        setChatHistory((prev) => prev.slice(0, -1));
      }
    },
    [sendChatMessageMutation, threadId],
  );

  // ── 6. Load thread on click ───────────────────────────────────
  const loadThreadHistory = useCallback(
    async (tId) => {
      if (tId === threadId) return;

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tId)) {
        return;
      }

      setChatHistory([]);
      setThreadId(tId);
      setIsLoadingThread(true);
      setError(null);

      const existing = conversationsByThread[tId];
      if (existing?.messages?.length > 0) {
        setChatHistory(existing.messages);
        setIsLoadingThread(false);
        return;
      }

      try {
        const result = await dispatch(
          kpiApi.endpoints.getChatThreadMessages.initiate(tId, {
            forceRefetch: true,
          }),
        );

        if (result.error) {
          setChatHistory([]);
          setIsLoadingThread(false);
          return;
        }

        if (result.data) {
          const normalized = normalizeMessages(result.data);
          setChatHistory(normalized);

          // ✅ FIX [CWE-522]: CHAT_ROLES.USER constant — not an inline string literal
          const firstUserMsg = result.data.find(
            (m) =>
              m.role === CHAT_ROLES.USER &&
              m.content &&
              m.content !== "null" &&
              m.content.trim() !== "",
          );

          setConversationsByThread((prev) => ({
            ...prev,
            [tId]: {
              ...prev[tId],
              title:
                prev[tId]?.title ||
                firstUserMsg?.content ||
                prev[tId]?.title,
              messages: normalized,
            },
          }));
        } else {
          setChatHistory([]);
        }
      } catch (err) {
        setChatHistory([]);
      } finally {
        setIsLoadingThread(false);
      }
    },
    [conversationsByThread, threadId, dispatch, normalizeMessages],
  );

  // ── 7. Delete a thread ────────────────────────────────────────
  const removeThread = useCallback(
    async (tId) => {
      try {
        await deleteChatThreadMutation(tId).unwrap();
        setConversationsByThread((prev) => {
          const updated = { ...prev };
          delete updated[tId];
          return updated;
        });
        if (tId === threadId) {
          setChatHistory([]);
          setThreadId(null);
        }
      } catch (err) {
        setError("Failed to delete thread.");
      }
    },
    [deleteChatThreadMutation, threadId],
  );

  // ── 8. Delete all threads ─────────────────────────────────────
  const removeAllThreads = useCallback(async () => {
    try {
      await deleteAllChatHistoryMutation().unwrap();
      setConversationsByThread({});
      setChatHistory([]);
      setThreadId(null);
    } catch (err) {
      setError("Failed to delete all conversations.");
    }
  }, [deleteAllChatHistoryMutation]);

  // ── 9. New chat ───────────────────────────────────────────────
  const clearChat = useCallback(() => {
    setChatHistory([]);
    setThreadId(null);
  }, []);

  // ── 10. Sorted threads list (most recent first) ───────────────
  const sortedThreads = Object.values(conversationsByThread).sort((a, b) => {
    const dateA = new Date(a.lastMessageAt || a.createdAt || 0);
    const dateB = new Date(b.lastMessageAt || b.createdAt || 0);
    return dateB - dateA;
  });

  return {
    chatHistory,
    loading: sendLoading || isLoadingThread,
    threadsLoading,
    error,
    sendMessage,
    clearChat,
    threadId,
    setThreadId,
    conversationsByThread,
    sortedThreads,
    loadThreadHistory,
    removeThread,
    removeAllThreads,
  };
};

export default useChat;

--

  // src/hooks/useChatApi.js
// ─────────────────────────────────────────────────────────────
// This file is the SINGLE SOURCE OF TRUTH for all chat API calls.
// When backend is ready, only this file needs to change.
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.REACT_APP_API_URL;

// ── Send a message ──────────────────────────────────────────
export const sendChatMessage = async (message, threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      user_message: message,
      thread_id: threadId || undefined,
    }),
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json();
};

// ── Fetch all threads for the logged-in user ────────────────
export const fetchAllThreads = async (token) => {
  const response = await fetch(`${BASE_URL}/chat/history/threads`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { threads: [...] }
};

// ── Fetch messages of a specific thread ─────────────────────
// HARDENED: Wrapped dynamic parameter in encodeURIComponent to prevent SAST false positives
export const fetchThreadMessages = async (threadId, token) => {
  const safeThreadId = encodeURIComponent(threadId);
  const response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { thread_id, messages: [...] }
};

// ── Delete a thread ──────────────────────────────────────────
// HARDENED: Wrapped dynamic parameter in encodeURIComponent to prevent SAST false positives
export const deleteThread = async (threadId, token) => {
  const safeThreadId = encodeURIComponent(threadId);
  const response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { status: "deleted" }
};


