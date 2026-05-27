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
// HARDENED: Wrapped dynamic parameter in encodeURIComponent to prevent SAST false positives
export const fetchThreadMessages = async (threadId, token) => {
  const safeThreadId = encodeURIComponent(threadId);
  const response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {
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
// HARDENED: Wrapped dynamic parameter in encodeURIComponent to prevent SAST false positives
export const deleteThread = async (threadId, token) => {
  const safeThreadId = encodeURIComponent(threadId);
  const response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { status: "deleted" }
};
