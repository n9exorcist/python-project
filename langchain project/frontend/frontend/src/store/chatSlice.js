import { createSlice } from "@reduxjs/toolkit";

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    messages: [],
    isGenerating: false,
  },
  reducers: {
    setChatHistory: (state, action) => {
      state.messages = action.payload;
      state.isGenerating = false;
    },
    addUserMessage: (state, action) => {
      state.messages.push({ role: "user", text: action.payload });
    },
    addAiPlaceholder: (state) => {
      state.messages.push({ role: "ai", text: "" });
      state.isGenerating = true;
    },
    appendChunkToLastMessage: (state, action) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.role === "ai") {
        lastMessage.text += action.payload;
      }
    },
    finishGeneration: (state) => {
      state.isGenerating = false;
    },
    clearChat: (state) => {
      state.messages = [];
      state.isGenerating = false;
    },
  },
});

export const {
  setChatHistory,
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
  clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;
