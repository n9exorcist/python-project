import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
  setChatHistory,
} from "./store/chatSlice.js";
import Home from "./React/Home.js";

function App() {
  const [input, setInput] = useState("");
  const { messages, isGenerating } = useSelector((state) => state.chat);
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch("http://localhost:8000/chat/history");
        const data = await response.json();

        if (data.history && Array.isArray(data.history)) {
          dispatch(setChatHistory(data.history));
        }
      } catch (err) {
        console.error("Failed to hydrate chat history:", err);
      }
    };
    fetchHistory();
  }, [dispatch]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userText = input;
    setInput("");

    dispatch(addUserMessage(userText));
    dispatch(addAiPlaceholder());

    try {
      const response = await fetch("http://localhost:8000/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "");

            if (dataStr.includes("[DONE]")) {
              dispatch(finishGeneration());
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              dispatch(appendChunkToLastMessage(parsed.text));
            } catch (err) {
              console.error("Error parsing JSON chunk", err);
            }
          }
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      dispatch(appendChunkToLastMessage("\n[Error connecting to server.]"));
      dispatch(finishGeneration());
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch("http://localhost:8000/chat/history", {
        method: "DELETE",
      });
      dispatch(setChatHistory([]));
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  return (
    <>
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
      <Home />
    </>
  );
}

export default App;
