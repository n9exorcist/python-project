// src/hooks/useChat.js
import { useState, useCallback, useEffect } from "react";
import {
  useGetChatThreadsQuery,
  useDeleteChatThreadMutation,
  useSendChatMessageMutation,
  kpiApi,
} from "../services/kpiApi";
import { useDispatch } from "react-redux";

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

  // ── 2. Prefetch titles for ALL threads on load ───────────────
  useEffect(() => {
    if (!threadsMap) return;

    const prefetchAllTitles = async () => {
      const allThreads = Object.values(threadsMap);

      const results = await Promise.allSettled(
        allThreads.map(async (thread) => {
          // Skip if already has a title
          if (thread.title) {
            return { threadId: thread.threadId, title: thread.title };
          }

          try {
            const result = await dispatch(
              kpiApi.endpoints.getChatThreadMessages.initiate(
                thread.threadId,
                { forceRefetch: false }
              )
            );

            // ✅ FIX: Guard against 404 / any error — thread exists in list
            // but may have no messages (system-only or deleted messages)
            if (result.error) {
              // Silently skip — don't crash or surface 404 to user
              return { threadId: thread.threadId, title: null };
            }

            if (result.data && result.data.length > 0) {
              const firstUserMsg = result.data.find(
                (m) =>
                  m.role === "user" &&
                  m.content &&
                  m.content !== "null" &&
                  m.content.trim() !== ""
              );

              return {
                threadId: thread.threadId,
                title: firstUserMsg?.content || null,
              };
            }

            // ✅ FIX: Empty array returned (backend now returns 200 + [] instead of 404)
            return { threadId: thread.threadId, title: null };
          } catch (e) {
            // Silently ignore network / parse errors per thread
            return { threadId: thread.threadId, title: null };
          }
        })
      );

      // Build updated map with all titles
      const updatedMap = { ...threadsMap };
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.title) {
          const { threadId: tId, title } = result.value;
          updatedMap[tId] = {
            ...updatedMap[tId],
            title,
          };
        }
      });

      setConversationsByThread(updatedMap);
    };

    prefetchAllTitles();
  }, [threadsMap, dispatch]);

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
          from: role === "user" ? "user" : "bot",
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

  // ── 5. Send a message ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      setChatHistory((prev) => [...prev, { from: "user", message }]);
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

        const botMessage = {
          from: "bot",
          message: textForMarkdown,
          chartData: chartDataForRenderer,
          chartType: finalChartType,
          timestamp: data.timestamp,
          state: data.state,
        };

        setChatHistory((prev) => {
          const filtered = prev.filter(
            (m, i) => !(m.from === "user" && i === prev.length - 1)
          );
          return [...filtered, { from: "user", message }, botMessage];
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
                { from: "user", message },
                botMessage,
              ],
            },
          };
        });
      } catch (err) {
        setError(
          err?.data?.detail || err.message || "An unexpected error occurred."
        );
        setChatHistory((prev) => prev.slice(0, -1));
      }
    },
    [sendChatMessageMutation, threadId]
  );

  // ── 6. Load thread on click ───────────────────────────────────
  const loadThreadHistory = useCallback(
    async (tId) => {
      if (tId === threadId) return;

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
          })
        );

        // ✅ FIX: Guard against 404 when loading a thread manually
        if (result.error) {
          // Thread exists in sidebar but has no messages on backend
          setChatHistory([]);
          setIsLoadingThread(false);
          return;
        }

        if (result.data) {
          const normalized = normalizeMessages(result.data);
          setChatHistory(normalized);

          const firstUserMsg = result.data.find(
            (m) =>
              m.role === "user" &&
              m.content &&
              m.content !== "null" &&
              m.content.trim() !== ""
          );

          setConversationsByThread((prev) => ({
            ...prev,
            [tId]: {
              ...prev[tId],
              title:
                prev[tId]?.title || firstUserMsg?.content || prev[tId]?.title,
              messages: normalized,
            },
          }));
        } else {
          setChatHistory([]);
        }
      } catch (err) {
        // ✅ FIX: Don't surface 404 as a user-visible error
        // It just means the thread has no messages
        setChatHistory([]);
      } finally {
        setIsLoadingThread(false);
      }
    },
    [conversationsByThread, threadId, dispatch, normalizeMessages]
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
    [deleteChatThreadMutation, threadId]
  );

  // ── 8. New chat ───────────────────────────────────────────────
  const clearChat = useCallback(() => {
    setChatHistory([]);
    setThreadId(null);
  }, []);

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
    loadThreadHistory,
    removeThread,
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
export const fetchThreadMessages = async (threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat/history/${threadId}`, {
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
export const deleteThread = async (threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat/history/${threadId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { status: "deleted" }
};

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
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
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
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
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
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/trandline/data${suffix}`;
      },
      providesTags: ["TrendlineData"],
      transformResponse: (resp) => {
        const weekly = Array.isArray(resp?.weekly_trends) ? resp.weekly_trends : [];
        const monthly = Array.isArray(resp?.monthly_trends) ? resp.monthly_trends : [];
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
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
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
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
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
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
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
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
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