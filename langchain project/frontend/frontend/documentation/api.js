// services/api.js
//
// SECURITY FIXES APPLIED:
// ✅ CWE-918 (SSRF)             : SAFE_API_BASE validated via allowlist in apiUrlValidator.js.
//                                 Prevents env-var poisoning that could redirect fetch calls
//                                 to internal services (localhost, 169.254.x.x, etc.)
// ✅ CWE-20  (Input Validation) : Year parameter validated as 4-digit number before URL build.
// ✅ CWE-209 (Info Disclosure)  : handleResponse returns safe messages; no stack traces exposed.
// ✅ CWE-754 (Timeout)          : Every fetch is wrapped in fetchWithTimeout (30 s).
//
// Original vulnerable pattern (DO NOT revert):
//   const API_BASE =
//     process.env.REACT_APP_API_BASE_URL || `${process.env.REACT_APP_API_URL}/api`;
//
// An attacker who can pollute REACT_APP_API_BASE_URL (e.g. via CI/CD misconfiguration
// or a poisoned .env file) could redirect all fetch calls to an arbitrary host.
// getSafeApiUrl() in apiUrlValidator.js asserts the scheme and origin against an
// allow-list once at module-load time, preventing that.

import { SAFE_API_BASE } from "../utils/apiUrlValidator";

// ─── Timeout helper ────────────────────────────────────────────────────────────
// CWE-754: Wrap every fetch so hanging requests are aborted after 30 s.
const REQUEST_TIMEOUT_MS = 30_000;

const fetchWithTimeout = (url, options = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
};

// ─── Response handler ──────────────────────────────────────────────────────────
// CWE-209: Never surface raw server error payloads to the caller.
const handleResponse = async (response) => {
  if (!response.ok) {
    let safeMessage = "Request failed. Please try again.";
    try {
      const body = await response.json();
      // Only expose a pre-formatted message field, never the full object.
      if (typeof body?.error === "string") safeMessage = body.error;
    } catch {
      // JSON parse failure — keep the generic message.
    }
    throw new Error(safeMessage);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Invalid response from server.");
  }
};

// ─── API Service ───────────────────────────────────────────────────────────────
export const apiService = {
  // CWE-918 fix : SAFE_API_BASE replaces the raw API_BASE variable.
  // CWE-20  fix : year is validated to be a 4-digit numeric string; anything
  //               else falls back to "2024", preventing path-traversal injection.
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
        Overall_Monthly_Metrics:
          jsonData[month].Overall_Monthly_Metrics ?? {},
      };
    });

    return transformedData;
  },

  getCapabilities: async () => {
    const response = await fetchWithTimeout(`${SAFE_API_BASE}/capabilities`);
    return handleResponse(response);
  },

  // Simple TTL cache (5 min) — avoids redundant API calls on re-renders.
  getCachedOTIFData: (() => {
    let cache = null;
    let cacheTs = 0;
    const TTL = 5 * 60 * 1000;

    return async (year) => {
      if (!cache || Date.now() - cacheTs > TTL) {
        cache = await apiService.getOTIFData(year);
        cacheTs = Date.now();
      }
      return cache;
    };
  })(),
};
