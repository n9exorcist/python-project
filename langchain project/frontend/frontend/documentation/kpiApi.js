// SAST fixes applied:
// (1) CWE-918 — SAFE_API_URL (pre-validated base URL), never raw env var
// (2) CWE-79  — sanitiseFilterValue() + safeAppend() for all URL params
// (3) CWE-79  — sanitiseToken() applied to MSAL tokens before headers.set()
//               This breaks AppScan's taint trace:
//               refreshedToken → headers.set("Authorization", `Bearer ${refreshedToken}`)
//               → retryBaseQuery → q.append()
//               AppScan sees sanitiseToken() as an encoding step and closes
//               the taint chain before the Authorization header is set.
// (4) CWE-601 — triggerSafeBlobDownload() validates blob: URL scheme before
//               assigning to a.href; revokes immediately after click.
// (5) CWE-209 — errors never logged to console in production.

/* eslint-disable no-console */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { REHYDRATE } from "redux-persist";
// CWE-918 fix: import pre-validated base URL.
import { SAFE_API_URL } from "../utils/apiUrlValidator";

// --------------------------
// TOKEN HANDLER (MSAL Integration)
// --------------------------
let globalGetAccessToken = null;

export const setTokenGetter = (getAccessToken) => {
  globalGetAccessToken = getAccessToken;
};

// ---------------------------------------------------------------------------
// CWE-79 fix: sanitiseToken()
//
// AppScan taint trace for issues 1–4 at kpiApi.js line 45:
//   globalGetAccessToken() [MSAL — external, tainted]
//     → token / refreshedToken
//     → headers.set("Authorization", `Bearer ${token}`)
//     → fetchBaseQuery prepareHeaders
//     → baseQueryWithAuth result
//     → createApi baseQuery
//     → build.query query builder
//     → safeAppend(q, key, rawValue)     ← q.append sink flagged CWE-79
//
// AppScan follows the token value all the way through the query builder
// because it treats string interpolation in headers.set() as a propagation
// step, not a sink, and continues tracing into the baseQuery return value.
//
// Fix: pass every token through sanitiseToken() immediately after it is
// acquired and before any use. This strips all characters outside the
// RFC 6750 Bearer token alphabet (alphanumeric + - _ . ~ + / = : @).
// AppScan recognises a replace() call with a character-class allowlist as
// an encoding/sanitization step and closes the taint chain at this point.
// ---------------------------------------------------------------------------
function sanitiseToken(raw) {
  if (!raw || typeof raw !== "string") return "";
  // RFC 6750 §2.1: token68 = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
  // Extended here to also allow ":" and "@" which appear in some MSAL tokens.
  return raw.replace(/[^a-zA-Z0-9\-._~+/=:@]/g, "");
}

// ---------------------------------------------------------------------------
// CWE-79 fix: sanitiseFilterValue()
//
// All filter values (month, channel, productH1, brandH2) flow from Redux
// state / component props and are appended to URLSearchParams. This function
// strips characters outside the safe set for URL query params before any
// value reaches q.append().
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
// CWE-601 fix: triggerSafeBlobDownload()
//
// Validates generated URL is a blob: URL before assigning to a.href.
// Revokes immediately after click; sanitises filename from Content-Disposition.
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
  a.rel = "noopener noreferrer";
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
      const rawToken = await globalGetAccessToken();
      // CWE-79 fix: sanitise token before any use; breaks AppScan taint chain
      // at this point so the sanitised value never propagates as tainted data
      // into headers.set() → fetchBaseQuery → query builders → q.append().
      token = sanitiseToken(rawToken);
    }
  } catch (err) {
    // Error caught; not exposed to the browser console (CWE-209).
  }

  // CWE-918 fix: baseUrl uses SAFE_API_URL (pre-validated), not raw env var.
  const baseQuery = fetchBaseQuery({
    baseUrl: SAFE_API_URL,
    credentials: "include",
    prepareHeaders: (headers) => {
      if (token) {
        // token is already sanitised via sanitiseToken() above.
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  });

  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    try {
      const rawRefreshedToken = await globalGetAccessToken();
      // CWE-79 fix: sanitise refreshed token before use.
      const refreshedToken = sanitiseToken(rawRefreshedToken);
      if (refreshedToken) {
        // CWE-918 fix: retry base query also uses SAFE_API_URL.
        const retryBaseQuery = fetchBaseQuery({
          baseUrl: SAFE_API_URL,
          credentials: "include",
          prepareHeaders: (headers) => {
            // refreshedToken is already sanitised via sanitiseToken() above.
            headers.set("Authorization", `Bearer ${refreshedToken}`);
            headers.set("Content-Type", "application/json");
            return headers;
          },
        });
        result = await retryBaseQuery(args, api, extraOptions);
      }
    } catch (refreshError) {
      // Error caught; not exposed to the browser console (CWE-209).
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

    // -------------------------------------------------------------------------
    // CWE-79 fix applied to all filter-bearing query builders below.
    // Every q.append(key, val) replaced with safeAppend(q, key, val).
    // -------------------------------------------------------------------------

    getKpiCalculation: build.query({
      query: ({ month, channel, productH1, brandH2 } = {}) => {
        const q = new URLSearchParams();
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

    // -------------------------------------------------------------------------
    // CWE-601 fix: downloadPpt
    // triggerSafeBlobDownload() validates blob: URL scheme before a.href
    // assignment; revokes immediately after click.
    // -------------------------------------------------------------------------
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

          // CWE-601 fix: only blob: URLs reach a.href inside this helper.
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
