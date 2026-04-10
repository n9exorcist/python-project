import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
  setChatHistory,
  clearChat,
} from "./store/chatSlice.js";

const API_BASE = "http://127.0.0.1:8001";

function App() {
  const [input, setInput] = useState("");
  const { messages, isGenerating } = useSelector((state) => state.chat);
  const dispatch = useDispatch();
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_BASE}/chat/history`);
        const data = await response.json();

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
  }, [dispatch]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userText = input.trim();
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
        body: JSON.stringify({ message: userText }),
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

  const handleClearHistory = async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      await fetch(`${API_BASE}/chat/history`, {
        method: "DELETE",
      });

      dispatch(clearChat());
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "sans-serif",
      }}
    >
      <h2>LangGraph + React Stream</h2>

      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <button type="button" onClick={handleClearHistory}>
          Clear Chat
        </button>
      </div>

      <div
        style={{
          height: "400px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              marginBottom: "10px",
              textAlign: msg.role === "user" ? "right" : "left",
            }}
          >
            <strong style={{ color: msg.role === "user" ? "blue" : "green" }}>
              {msg.role === "user" ? "You: " : "AI: "}
            </strong>
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          style={{ flexGrow: 1, padding: "10px" }}
        />
        <button
          type="submit"
          disabled={isGenerating}
          style={{ padding: "10px 20px" }}
        >
          {isGenerating ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default App;
