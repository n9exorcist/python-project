import { useState, useCallback, useEffect } from "react"; // 1. Import useEffect
import {
  useGetChatThreadsQuery,
  useDeleteChatThreadMutation,
  useDeleteAllChatHistoryMutation,
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

  // ── 2. Sync threadsMap into local conversationsByThread ──────
  // FIX: Converted unsafe useState initializer with dependencies into a proper useEffect
  useEffect(() => {
    if (!threadsMap) return;
    setConversationsByThread((prev) => {
      const updated = { ...prev };
      Object.values(threadsMap).forEach((thread) => {
        if (!updated[thread.threadId]) {
          updated[thread.threadId] = thread;
        } else {
          // Merge without overwriting existing messages
          updated[thread.threadId] = {
            ...thread,
            messages: updated[thread.threadId].messages || [],
          };
        }
      });
      return updated;
    });
  }, [threadsMap]); // ✅ Valid dependency tracking context

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
  const [deleteAllChatHistoryMutation] = useDeleteAllChatHistoryMutation();

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
            (m, i) => !(m.from === "user" && i === prev.length - 1),
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

          const firstUserMsg = result.data.find(
            (m) =>
              m.role === "user" &&
              m.content &&
              m.content !== "null" &&
              m.content.trim() !== "",
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
