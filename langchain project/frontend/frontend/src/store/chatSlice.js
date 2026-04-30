import { createSlice } from "@reduxjs/toolkit";

// Synchronously grab the saved ID before Redux initializes
const savedThreadId = localStorage.getItem("market_analyst_thread_id");

const initialState = {
  messages: [],
  isGenerating: false,
  threadId: savedThreadId || "market_analyst_session",
  // Add this
  progress: {
    active: false,
    value: 0,
    status: "",
    fading: false,
  },
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addUserMessage: (state, action) => {
      state.messages.push({ role: "user", text: action.payload });
    },
    addAiPlaceholder: (state) => {
      state.messages.push({ role: "ai", text: "" });
      state.isGenerating = true;
    },
    appendChunkToLastMessage: (state, action) => {
      if (!state.messages.length) return;
      const last = state.messages[state.messages.length - 1];
      if (last.role !== "ai") return;
      last.text = (last.text || "") + action.payload;
    },
    setChatHistory: (state, action) => {
      state.messages = Array.isArray(action.payload) ? action.payload : [];
      state.isGenerating = false;
    },
    clearChat: (state) => {
      state.messages = [];
      state.isGenerating = false;
      // Do NOT reset threadId here; let the setThreadId action handle it
    },
    setThreadId: (state, action) => {
      state.threadId = action.payload || "market_analyst_session";
    },
    setProgress: (state, action) => {
      state.progress = { ...state.progress, ...action.payload };
    },
    startProgress: (state, action) => {
      state.progress = {
        active: true,
        fading: false,
        value: action.payload.value ?? 10,
        status: action.payload.status ?? "Initializing...",
      };
    },
    fadeProgress: (state) => {
      state.progress.fading = true;
    },
    clearProgress: (state) => {
      state.progress = { active: false, value: 0, status: "", fading: false };
    },
    finishGeneration: (state) => {
      state.isGenerating = false;
      // Auto-clear progress when generation ends
      state.progress = { active: false, value: 0, status: "", fading: false };
    },
  },
});

export const {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
  setChatHistory,
  clearChat,
  setThreadId,
  setProgress, // ← new
  startProgress, // ← new
  fadeProgress, // ← new
  clearProgress, // ← new
} = chatSlice.actions;

export default chatSlice.reducer;
