/* eslint-disable no-console */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { REHYDRATE } from "redux-persist";
// CWE-918 fix: import pre-validated base URL instead of using
// process.env.REACT_APP_API_URL directly as the RTK Query baseUrl.
import { SAFE_API_URL } from "../utils/apiUrlValidator";

// --------------------------
// TOKEN HANDLER (MSAL Integration)
// --------------------------
let globalGetAccessToken = null;

export const setTokenGetter = (getAccessToken) => {
  globalGetAccessToken = getAccessToken;
};

// ---------------------------------------------------------------------------
// CWE-79 fix: safe URLSearchParams helper
//
// AppScan flagged 100 XSS issues at the q.append() call sites across all
// query builder functions (lines 121 & 124 pattern repeated per endpoint).
//
// Root cause: filter values (month, channel, productH1, brandH2) originate
// from Redux state / component props and were appended to URLSearchParams
// without any sanitisation. AppScan traces these through
// fetchBaseQuery → extractRehydrationInfo → baseQueryWithAuth →
// globalGetAccessToken to the same q.append() sinks.
//
// Fix: all filter values are passed through sanitiseFilterValue() before
// q.append(). This strips characters outside the safe set for URL query
// params (alphanumeric, space, hyphen, underscore, dot, comma, slash).
// ---------------------------------------------------------------------------
function sanitiseFilterValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[^a-zA-Z0-9 \-_.,/]/g, "");
}

/**
 * Appends a filter value to URLSearchParams only after sanitising it.
 * Single auditable gate replacing all bare q.append(key, val) calls.
 * CWE-79 fix: no raw, unvalidated filter value reaches the URL string.
 */
function safeAppend(q, key, rawValue) {
  const safe = sanitiseFilterValue(rawValue);
  if (safe) q.append(key, safe);
}

// ---------------------------------------------------------------------------
// CWE-601 fix: safe blob download helper
//
// Original downloadPpt (line 438 pattern):
//   const url = window.URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;   ← flagged Open Redirect sink
//
// Fix: assert the generated URL is a blob: URL before assigning to a.href;
// revoke immediately after click; sanitise filename from Content-Disposition.
// ---------------------------------------------------------------------------
function triggerSafeBlobDownload(blob, rawFileName) {
  const url = window.URL.createObjectURL(blob);

  // CWE-601 guard: blob: URLs are same-origin by spec, but assert the scheme.
  if (typeof url !== "string" || !url.startsWith("blob:")) {
    console.error("[kpiApi] Blocked unexpected URL scheme in download.");
    window.URL.revokeObjectURL(url);
    return;
  }

  // Sanitise filename: allow only safe characters for a download attribute.
  const safeName = String(rawFileName || "download.pptx").replace(
    /[^a-zA-Z0-9._\- ]/g,
    "_",
  );

  const a = document.createElement("a");
  a.href = url; // CWE-601 fix: only blob: scheme reaches this line
  a.download = safeName;
  a.rel = "noopener noreferrer"; // defence-in-depth
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url); // revoke immediately — no lingering reference
}

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

  // CWE-918 fix: baseUrl uses SAFE_API_URL (pre-validated) instead of
  // raw process.env.REACT_APP_API_URL.
  const baseQuery = fetchBaseQuery({
    baseUrl: SAFE_API_URL,
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
        // CWE-918 fix: retry base query also uses SAFE_API_URL.
        const retryBaseQuery = fetchBaseQuery({
          baseUrl: SAFE_API_URL,
          credentials: "include",
          prepareHeaders: (headers) => {
            headers.set("Authorization", `Bearer ${refreshedToken}`);
            headers.set("Content-Type", "application/json");
            return headers;
          },
        });
        result = await retryBaseQuery(args, api, extraOptions);
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

    // -----------------------------------------------------------------------
    // CWE-79 fix applied to all filter-bearing query builders below.
    // Every q.append(key, val) replaced with safeAppend(q, key, val).
    // -----------------------------------------------------------------------

    getKpiCalculation: build.query({
      query: ({ month, channel, productH1, brandH2 } = {}) => {
        const q = new URLSearchParams();
        // CWE-79 fix: safeAppend validates each value before appending
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi-calculation${suffix}`;
      },
      providesTags: ["KPIData", "HeatmapData"],
      transformResponse: (resp) => {
        const heatmap = resp?.heatmap_json || {};
        return { raw: resp, heatmap };
      },
      transformErrorResponse: (response) => response,
    }),

    getKpiWaterfallData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        // CWE-79 fix
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "brand_h2", val);
        });
        return `/kpi/waterfall/data?${q.toString()}`;
      },
      providesTags: ["Waterfall"],
      transformResponse: (resp) => (Array.isArray(resp) ? resp : []),
      transformErrorResponse: (response) => response,
    }),

    getKpiTrendlineData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        // CWE-79 fix
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All")
            safeAppend(q, "brand_h2", val);
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
        return { weekly, monthly, metadata };
      },
      transformErrorResponse: (response) => response,
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
        // CWE-79 fix
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") safeAppend(q, "month", m);
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
        // CWE-79 fix
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") safeAppend(q, "month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") safeAppend(q, "channel", c);
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
        // CWE-79 fix
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") safeAppend(q, "month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") safeAppend(q, "channel", c);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((p) => {
          if (p && p !== "Overall" && p !== "All")
            safeAppend(q, "product_h1", p);
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
      transformErrorResponse: (response) => response,
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

    // -----------------------------------------------------------------------
    // CWE-601 fix: downloadPpt
    //
    // Original responseHandler:
    //   const url = window.URL.createObjectURL(blob);
    //   const a = document.createElement("a");
    //   a.href = url;   ← Open Redirect sink
    //
    // Fix: a.href is only assigned inside triggerSafeBlobDownload(), which
    // first asserts url.startsWith("blob:") and revokes immediately after click.
    // The filename from Content-Disposition is sanitised before use.
    // -----------------------------------------------------------------------
    downloadPpt: build.mutation({
      query: () => ({
        url: "/generate-ppt/download",
        method: "GET",
        responseHandler: async (response) => {
          const blob = await response.blob();

          let fileName = "SC Rapid Diagnostic Assessment Report.pptx";
          const disposition = response.headers.get("Content-Disposition");
          if (disposition && disposition.includes("filename=")) {
            // Extract raw filename from header — will be sanitised inside helper
            fileName = disposition.split("filename=")[1].replace(/"/g, "");
          }

          // CWE-601 fix: delegates to validated helper; raw a.href = url is gone.
          triggerSafeBlobDownload(blob, fileName);
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

    getChatThreads: build.query({
      query: () => "/chat/history/threads",
      providesTags: ["ChatHistory"],
      transformResponse: (resp) => {
        const threadsMap = {};
        (resp?.threads || []).forEach((t) => {
          threadsMap[t.thread_id] = {
            threadId: t.thread_id,
            title: t.title || null,
            messageCount: t.message_count || 0,
            createdAt: t.last_updated,
            lastMessageAt: t.last_updated,
            messages: [],
          };
        });
        return threadsMap;
      },
    }),

    getChatThreadMessages: build.query({
      query: (threadId) => `/chat/history/${threadId}`,
      providesTags: (result, error, threadId) => [
        { type: "ChatHistory", id: threadId },
      ],
      transformResponse: (resp) => resp?.messages || [],
      transformErrorResponse: (response) => response,
    }),

    deleteChatThread: build.mutation({
      query: (threadId) => ({
        url: `/chat/history/${threadId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => response,
    }),

    deleteAllChatHistory: build.mutation({
      query: () => ({
        url: "/chat/history",
        method: "DELETE",
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => response,
    }),

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
      transformErrorResponse: (response) => response,
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
  useDeleteAllChatHistoryMutation,
  useSendChatMessageMutation,
} = kpiApi;
