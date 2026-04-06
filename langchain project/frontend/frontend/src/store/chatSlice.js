import { createSlice } from "@reduxjs/toolkit";

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    messages: [],
    isGenerating: false,
  },
  reducers: {
    addUserMessage: (state, action) => {
      state.messages.push({ role: "user", text: action.payload });
    },
    addAiPlaceholder: (state) => {
      state.messages.push({ role: "ai", text: "" });
      state.isGenerating = true;
    },
    appendChunkToLastMessage: (state, action) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage.role === "ai") {
        lastMessage.text += action.payload;
      }
    },
    finishGeneration: (state) => {
      state.isGenerating = false;
    },
  },
});

export const {
  addUserMessage,
  addAiPlaceholder,
  appendChunkToLastMessage,
  finishGeneration,
} = chatSlice.actions;
export default chatSlice.reducer;
