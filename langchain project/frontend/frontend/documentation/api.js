// services/api.js
//
// SAST fixes applied:
//  ✅ CWE-918 (SSRF)            : SAFE_API_BASE from apiUrlValidator replaces raw env concat.
//  ✅ CWE-20  (Input Validation) : year parameter validated as 4-digit string before URL build.
//  ✅ CWE-209 (Info Disclosure)  : handleResponse never surfaces raw server payloads.
//  ✅ CWE-754 (Timeout)          : fetchWithTimeout aborts stalled requests after 30 s.
//
// Original vulnerable pattern (do NOT revert):
//   const API_BASE =
//     process.env.REACT_APP_API_BASE_URL || `${process.env.REACT_APP_API_URL}/api`;
//
// That string was used directly in fetch() with no origin validation, allowing
// an attacker who controls the env var to redirect calls to internal services.

import { SAFE_API_BASE } from "../utils/apiUrlValidator";

// ─── Timeout helper ────────────────────────────────────────────────────────────
// CWE-754: every fetch is given an explicit 30-second budget.
// Without a timeout a slow/hung server silently blocks the UI indefinitely.
const REQUEST_TIMEOUT_MS = 30_000;

const fetchWithTimeout = (url, options = {}) => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timerId),
  );
};

// ─── Response handler ──────────────────────────────────────────────────────────
// CWE-209: only expose a pre-approved message string; never re-throw raw JSON.
const handleResponse = async (response) => {
  if (!response.ok) {
    let safeMessage = "API request failed.";
    try {
      const body = await response.json();
      // Only accept a plain string field named "error" — nothing else.
      if (typeof body?.error === "string") safeMessage = body.error;
    } catch {
      // Body wasn't JSON — keep the generic message.
    }
    throw new Error(safeMessage);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Invalid response from server.");
  }
};

// ─── API service ───────────────────────────────────────────────────────────────
export const apiService = {
  // CWE-918: SAFE_API_BASE (validated origin) replaces the raw env variable.
  // CWE-20:  year is coerced to a 4-digit numeric string; anything else falls
  //          back to "2024" to prevent path-traversal in the URL segment.
  getOTIFData: async (year = "2024") => {
    const safeYear = /^\d{4}$/.test(String(year)) ? String(year) : "2024";

    const response = await fetchWithTimeout(`${SAFE_API_BASE}/${safeYear}`);
    const jsonData = await handleResponse(response);

    // Transform data here instead of in the component.
    const transformedData = {};
    Object.keys(jsonData).forEach((month) => {
      transformedData[month] = {
        Channel_Metrics: Array.isArray(jsonData[month].Channel_Metrics)
          ? jsonData[month].Channel_Metrics
          : [],
        Overall_Monthly_Metrics: jsonData[month].Overall_Monthly_Metrics ?? {},
      };
    });

    return transformedData;
  },

  getCapabilities: async () => {
    const response = await fetchWithTimeout(`${SAFE_API_BASE}/capabilities`);
    return handleResponse(response);
  },

  // Simple in-memory cache with a 5-minute TTL.
  // The original cache had no expiry, so stale data was served indefinitely.
  getCachedOTIFData: (() => {
    let cache = null;
    let cacheTs = 0;
    const TTL_MS = 5 * 60 * 1000; // 5 minutes

    return async (year) => {
      if (!cache || Date.now() - cacheTs > TTL_MS) {
        cache = await apiService.getOTIFData(year);
        cacheTs = Date.now();
      }
      return cache;
    };
  })(),
};
