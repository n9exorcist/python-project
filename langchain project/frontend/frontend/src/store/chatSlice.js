import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  messages: [],
  isGenerating: false,
  threadId: "market_analyst_session",
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
    finishGeneration: (state) => {
      state.isGenerating = false;
    },
    setChatHistory: (state, action) => {
      state.messages = Array.isArray(action.payload) ? action.payload : [];
      state.isGenerating = false;
    },
    clearChat: (state) => {
      state.messages = [];
      state.isGenerating = false;
    },
    setThreadId: (state, action) => {
      state.threadId = action.payload || "market_analyst_session";
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
} = chatSlice.actions;

export default chatSlice.reducer;
