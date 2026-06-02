// services/api.js
//
// CWE-918 fix: API_BASE is now validated through getSafeApiUrl() before any
// fetch call is made. The original code built API_BASE by directly
// concatenating two env vars without validation:
//
//   const API_BASE =
//     process.env.REACT_APP_API_BASE_URL || `${process.env.REACT_APP_API_URL}/api`;
//
// An attacker who can pollute REACT_APP_API_BASE_URL (e.g. via a CI/CD
// misconfiguration or a poisoned .env file) could redirect all fetch calls to
// an arbitrary host. getSafeApiUrl() asserts the scheme and origin against an
// allow-list once at module load time.
import { SAFE_API_BASE } from "../utils/apiUrlValidator";

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "API request failed");
  }
  return response.json();
};

export const apiService = {
  // CWE-918 fix: SAFE_API_BASE replaces the raw API_BASE variable.
  // The year parameter is validated to be a 4-digit number string to prevent
  // path-traversal injection into the URL.
  getOTIFData: async (year = "2024") => {
    // Validate year: only accept a 4-digit numeric string
    const safeYear = /^\d{4}$/.test(String(year)) ? String(year) : "2024";

    const response = await fetch(`${SAFE_API_BASE}/${safeYear}`);
    const jsonData = await handleResponse(response);

    // Transform data here instead of in the component
    const transformedData = {};
    Object.keys(jsonData).forEach((month) => {
      transformedData[month] = {
        Channel_Metrics: jsonData[month].Channel_Metrics || [],
        Overall_Monthly_Metrics: jsonData[month].Overall_Monthly_Metrics || {},
      };
    });

    return transformedData;
  },

  getCapabilities: async () => {
    const response = await fetch(`${SAFE_API_BASE}/capabilities`);
    return handleResponse(response);
  },

  // Add caching layer
  getCachedOTIFData: (() => {
    let cache = null;
    return async (year) => {
      if (!cache) {
        cache = await apiService.getOTIFData(year);
      }
      return cache;
    };
  })(),
};
