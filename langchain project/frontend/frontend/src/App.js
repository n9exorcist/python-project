import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
  setChatHistory,
  clearChat,
  setThreadId,
} from "./store/chatSlice.js";
import Home from "./React/Home.js";
import "./App.css";

const API_BASE = "http://127.0.0.1:8001";
const DEFAULT_THREAD_ID = "market_analyst_session";
const THREAD_STORAGE_KEY = "market_analyst_thread_id";

const SUGGESTIONS = [
  "Tell me Accenture Q2 2026 results from internal records",
  "Latest news about Accenture stock",
  "Compare Accenture results with expectations",
  "What bookings number did you mention earlier?",
];

function App() {
  const [input, setInput] = useState("");
  const { messages, isGenerating, threadId } = useSelector(
    (state) => state.chat,
  );
  const dispatch = useDispatch();

  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    const savedThreadId = localStorage.getItem(THREAD_STORAGE_KEY);
    const initialThreadId = savedThreadId || DEFAULT_THREAD_ID;

    if (threadId !== initialThreadId) {
      dispatch(setThreadId(initialThreadId));
    }
  }, [dispatch]);

  useEffect(() => {
    if (threadId) {
      localStorage.setItem(THREAD_STORAGE_KEY, threadId);
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;

    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/chat/history?thread_id=${encodeURIComponent(threadId)}`,
        );
        const data = await response.json();

        if (data.thread_id && data.thread_id !== threadId) {
          dispatch(setThreadId(data.thread_id));
          localStorage.setItem(THREAD_STORAGE_KEY, data.thread_id);
        }

        if (data.history && Array.isArray(data.history)) {
          dispatch(setChatHistory(data.history));
        } else {
          dispatch(clearChat());
        }
      } catch (err) {
        console.error("Failed to hydrate chat history:", err);
        dispatch(clearChat());
      }
    };

    fetchHistory();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [dispatch, threadId]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isGenerating]);

  const sessionHistory = useMemo(() => {
    return messages
      .filter((msg) => msg.role === "user")
      .map((msg, index) => ({
        id: index,
        title: msg.text.length > 48 ? `${msg.text.slice(0, 48)}...` : msg.text,
        fullText: msg.text,
      }))
      .reverse();
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || isGenerating || !threadId) return;

    const userText = text.trim();
    setInput("");

    dispatch(addUserMessage(userText));
    dispatch(addAiPlaceholder());

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          message: userText,
          thread_id: threadId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming response not available: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const dataStr = line.slice(6).trim();

            if (dataStr === "[DONE]") {
              dispatch(finishGeneration());
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                dispatch(appendChunkToLastMessage(parsed.text));
              }
            } catch (err) {
              console.error("Error parsing JSON chunk:", err, dataStr);
            }
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6).trim();

          if (dataStr === "[DONE]") {
            dispatch(finishGeneration());
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              dispatch(appendChunkToLastMessage(parsed.text));
            }
          } catch (err) {
            console.error("Error parsing final JSON chunk:", err, dataStr);
          }
        }
      }

      dispatch(finishGeneration());
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Fetch error:", error);
        dispatch(appendChunkToLastMessage("\n[Error connecting to server.]"));
      }
      dispatch(finishGeneration());
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleClearHistory = async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (!threadId) return;

      const response = await fetch(
        `${API_BASE}/chat/history?thread_id=${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      const newThreadId = data.thread_id || DEFAULT_THREAD_ID;

      localStorage.setItem(THREAD_STORAGE_KEY, newThreadId);
      dispatch(setThreadId(newThreadId));
      dispatch(clearChat());
      setInput("");
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const handleSuggestionClick = async (text) => {
    await sendMessage(text);
  };

  const handleHistoryClick = (text) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-dot" />
            <div>
              <div className="brand-title">Market Analyst Pro</div>
              <div className="brand-sub">LangGraph + MCP + React</div>
            </div>
          </div>

          <button className="clear-button" onClick={handleClearHistory}>
            Clear chat
          </button>

          <div className="sidebar-section">
            <div className="sidebar-heading">Try these</div>
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                className="suggestion-card"
                onClick={() => handleSuggestionClick(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="sidebar-section history-section">
            <div className="sidebar-heading">History</div>

            {sessionHistory.length === 0 ? (
              <div className="history-empty">No session prompts yet</div>
            ) : (
              sessionHistory.map((item) => (
                <button
                  key={item.id}
                  className="history-card"
                  onClick={() => handleHistoryClick(item.fullText)}
                  title={item.fullText}
                >
                  {item.title}
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="main-panel">
          <header className="chat-header">
            <div>
              <h1 className="chat-title">Market Analyst</h1>
              <p className="chat-subtitle">
                Ask about internal records, market news, or compare both.
              </p>
            </div>
          </header>

          <section ref={messagesContainerRef} className="messages-area">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✦</div>
                <h2 className="empty-title">How can I help today?</h2>
                <p className="empty-text">
                  Ask about internal documents, current market news, or both.
                </p>

                <div className="empty-suggestions">
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      className="empty-suggestion-button"
                      onClick={() => handleSuggestionClick(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages-inner">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  const isLast = index === messages.length - 1;

                  return (
                    <div
                      key={index}
                      className={`message-row ${isUser ? "user-row" : "ai-row"}`}
                    >
                      <div
                        className={`message-bubble ${isUser ? "user-bubble" : "ai-bubble"}`}
                      >
                        <div className="message-role">
                          {isUser ? "You" : "Market Analyst"}
                        </div>
                        <div className="message-text">
                          {msg.text?.trim()
                            ? msg.text
                            : isLast && isGenerating
                              ? "Thinking..."
                              : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="composer-wrap">
            <form onSubmit={handleSend} className="composer">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Market Analyst..."
                className="composer-textarea"
                rows={1}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={isGenerating || !input.trim()}
                className="send-button"
              >
                {isGenerating ? "..." : "Send"}
              </button>
            </form>
            <div className="footer-note">
              Enter to send, Shift + Enter for new line
            </div>
          </div>
        </main>
      </div>
      <div>
        <Home />
      </div>
    </>
  );
}

export default App;
