import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  resetLastMessage, // Added — clears a draft that reflection sent back for a rewrite
  finishGeneration,
  setChatHistory,
  clearChat,
  setThreadId,
  startProgress, // Added
  setProgress, // Added
  fadeProgress, // Added
  clearProgress, // Added
} from "./store/chatSlice.js";
import Home from "./React/Home.js";
import "./App.css";
import TaskDashboard from "./features/TaskDashboard.js";
import TicTacToe from "./features/tictactoe.js";
import SwingDashboard from "./features/SwingDashboard.js";

const API_BASE = "http://127.0.0.1:8001";
const DEFAULT_THREAD_ID = "market_analyst_session";
const THREAD_STORAGE_KEY = "market_analyst_thread_id";

const SUGGESTIONS = [
  "According to our internal records, who is Narayanan Selvaraj and what does he specialize in?",
  "What do the local documents say about Accenture's dividend and Julie Sweet?",
  "What is the latest news today regarding the S&P 500?",
  "Search the web for the current market reaction to Accenture's stock",
  "Compare our internal records regarding Accenture's Q2 FY26 revenue versus the latest news about Accenture's stock performance today.",
  "Read the Market Cycles resource. What does the market cycle say about the Gold-Silver ratio and the defense sector?",
  "Tell me about Accenture Q2 2026.",
  "Search our internal records for the recipe to bake a chocolate cake.",
];

function App() {
  const [input, setInput] = useState("");
  // Which panel the main column shows. The swing dashboard is a separate
  // read-only view over the same backend, not part of the chat thread.
  const [view, setView] = useState("chat");

  const { messages, isGenerating, threadId, progress } = useSelector(
    (state) => state.chat,
  );
  const dispatch = useDispatch();

  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  // Whether the view should follow new tokens. Set false the moment the reader
  // scrolls up, so auto-scroll never yanks them away from something they went
  // back to read, and true again when they return to the bottom.
  const stickToBottomRef = useRef(true);

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

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = fromBottom < 80;
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !stickToBottomRef.current) return;
    container.scrollTo({
      top: container.scrollHeight,
      // "smooth" cannot keep up with streaming. Every token dispatches a new
      // scrollTo, and each one restarts the animation from wherever the last
      // was interrupted, so the view falls permanently behind the text and the
      // reader has to scroll by hand. Instant while tokens are arriving;
      // smooth for the discrete jump when a turn ends.
      behavior: isGenerating ? "auto" : "smooth",
    });
  }, [messages, isGenerating]);

  const sessionHistory = useMemo(() => {
    // Index into `messages`, captured BEFORE the filter. Numbering the filtered
    // list instead gives a position that no longer addresses anything in the
    // transcript, which is what a click has to scroll to.
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.role === "user")
      .map(({ msg, index }) => ({
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

    // 1. Start Progress via Redux
    dispatch(
      startProgress({ value: 10, status: "Initializing analyst tools..." }),
    );

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
            if (!dataStr) continue;

            if (dataStr === "[DONE]") {
              dispatch(finishGeneration());
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);

              // Reflection sent the draft back for a rewrite. Discard the
              // previous draft so the rewrite replaces it instead of appending.
              if (parsed.reset) {
                dispatch(resetLastMessage());
                continue;
              }

              // 2. Handle Progress Updates
              if (
                parsed.progress_percentage !== undefined ||
                parsed.message ||
                parsed.status
              ) {
                dispatch(
                  setProgress({
                    active: true,
                    value: parsed.progress_percentage ?? 0,
                    status: parsed.message || parsed.status || "Processing...",
                  }),
                );
              }

              // 3. Handle Text Chunks and Progress Fading
              if (parsed.text) {
                // If progress is active and we just started getting text, trigger fade
                if (progress.active && !progress.fading) {
                  setTimeout(() => dispatch(fadeProgress()), 1000);
                  setTimeout(() => dispatch(clearProgress()), 1400);
                }

                if (parsed.text.trim()) {
                  dispatch(appendChunkToLastMessage(parsed.text));
                }
              }
            } catch (err) {
              // Don't reset progress on a parse error — just log it
              console.error("Error parsing JSON chunk:", err, dataStr);
            }
          }
        }
      }

      // Flush any remaining buffer (handles server that doesn't end with \n\n)
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          if (dataStr === "[DONE]") {
            dispatch(finishGeneration());
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.reset) {
              dispatch(resetLastMessage());
              continue;
            }

            if (
              parsed.progress_percentage !== undefined ||
              parsed.message ||
              parsed.status
            ) {
              dispatch(
                setProgress({
                  active: true,
                  value: parsed.progress_percentage ?? 0,
                  status: parsed.message || parsed.status || "Processing...",
                }),
              );
            }

            if (parsed.text) {
              // If progress is active and we just started getting text, trigger fade
              if (progress.active && !progress.fading) {
                setTimeout(() => dispatch(fadeProgress()), 1000);
                setTimeout(() => dispatch(clearProgress()), 1400);
              }

              if (parsed.text.trim()) {
                dispatch(appendChunkToLastMessage(parsed.text));
              }
            }
          } catch (err) {
            console.error("Error parsing final chunk:", err, dataStr);
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
        { method: "DELETE" },
      );

      const data = await response.json();
      const newThreadId = data.thread_id || DEFAULT_THREAD_ID;

      // 1. Update LocalStorage FIRST
      localStorage.setItem(THREAD_STORAGE_KEY, newThreadId);

      // 2. Clear Redux state
      dispatch(clearChat());

      // 3. Update the Thread ID in Redux
      dispatch(setThreadId(newThreadId));

      setInput("");
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const handleSuggestionClick = async (text) => {
    await sendMessage(text);
  };

  const handleHistoryClick = (text, messageIndex) => {
    setInput(text);

    // A plain focus() scrolls the composer into view, which cancels the jump
    // below — the click looked like it did nothing at all. preventScroll keeps
    // the caret ready without moving the transcript.
    if (textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }

    const container = messagesContainerRef.current;
    if (!container || messageIndex === undefined) return;
    const target = container.querySelector(`[data-msg-index="${messageIndex}"]`);
    if (!target) return;
    // Stop following the stream, or the next token would drag the view straight
    // back to the bottom the reader just navigated away from.
    stickToBottomRef.current = false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
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

          <div className="view-tabs">
            <button
              className={`view-tab${view === "chat" ? " active" : ""}`}
              onClick={() => setView("chat")}
            >
              Chat
            </button>
            <button
              className={`view-tab${view === "swing" ? " active" : ""}`}
              onClick={() => setView("swing")}
            >
              Swing
            </button>
          </div>

          {view === "chat" ? (
            <>
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
                      onClick={() => handleHistoryClick(item.fullText, item.id)}
                      title={item.fullText}
                    >
                      {item.title}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="sidebar-section">
              <div className="sidebar-heading">Swing agent</div>
              <div className="history-empty">
                Read-only view of the paper books. The scan, fills and exits are
                run by jobs.py as a separate process.
              </div>
            </div>
          )}
        </aside>

        <main className="main-panel">
          {view === "swing" ? (
            <SwingDashboard />
          ) : (
            <>
              <header className="chat-header">
                <div>
                  <h1 className="chat-title">Market Analyst</h1>
                  <p className="chat-subtitle">
                    Ask about internal records, market news, or compare both.
                  </p>
                </div>
              </header>

              <section
                ref={messagesContainerRef}
                className="messages-area"
                onScroll={handleMessagesScroll}
              >
                {messages.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✦</div>
                    <h2 className="empty-title">How can I help today?</h2>
                    <p className="empty-text">
                      Ask about internal documents, current market news, or
                      both.
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
                          data-msg-index={index}
                          className={`message-row ${isUser ? "user-row" : "ai-row"}`}
                        >
                          <div
                            className={`message-bubble ${isUser ? "user-bubble" : "ai-bubble"}`}
                          >
                            <div className="message-role">
                              {isUser ? "You" : "Market Analyst"}
                            </div>

                            <div className="message-text">
                              {msg.text?.trim() ? (
                                msg.text
                              ) : isLast && isGenerating ? (
                                /* Use the progress object from Redux selector */
                                progress.active ? (
                                  <div
                                    className={`mcp-progress-card${progress.fading ? " hiding" : ""}`}
                                  >
                                    <div className="mcp-header">
                                      <span className="mcp-icon">🛠</span>
                                      <span>
                                        research <b>call</b>
                                      </span>
                                    </div>
                                    <div className="mcp-progress-info">
                                      <span>Progress</span>
                                      <span>{progress.value}/100</span>
                                    </div>
                                    <div className="mcp-progress-bar">
                                      <div
                                        className="mcp-progress-fill"
                                        style={{ width: `${progress.value}%` }}
                                      />
                                    </div>
                                    <div className="mcp-console">
                                      <p className="mcp-console-text">
                                        {progress.status}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  "Thinking..."
                                )
                              ) : (
                                ""
                              )}
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
            </>
          )}
        </main>
      </div>
      <div>{/* <Home /> */}</div>
      <div>
        {/* <TaskDashboard />
        <TicTacToe /> */}
      </div>
    </>
  );
}

export default App;
