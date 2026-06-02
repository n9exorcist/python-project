// Replace your existing services/api.js with this secure implementation

import { SAFE_API_BASE } from "../utils/apiUrlValidator";

/**
 * Asserts that the URL belongs strictly to our validated safe API base
 * to prevent SSRF path deviations or external protocol hijacking.
 */
const enforceTrustedUrl = (targetUrl) => {
  const absoluteBase = new URL(
    SAFE_API_BASE,
    window.location.origin,
  ).toString();
  const fullyQualifiedTarget = new URL(
    targetUrl,
    window.location.origin,
  ).toString();

  if (!fullyQualifiedTarget.startsWith(absoluteBase)) {
    throw new Error(
      "Security Violation: Target outbound URL destination is untrusted.",
    );
  }
  return targetUrl;
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "API request failed");
  }
  return response.json();
};

export const apiService = {
  getOTIFData: async (year = "2024") => {
    // Validate year: strictly accept a 4-digit numeric string
    const safeYear = /^\d{4}$/.test(String(year)) ? String(year) : "2024";

    // Explicitly clamp and validate url target string
    const targetUrl = enforceTrustedUrl(`${SAFE_API_BASE}/${safeYear}`);
    const response = await fetch(targetUrl);
    const jsonData = await handleResponse(response);

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
    const targetUrl = enforceTrustedUrl(`${SAFE_API_BASE}/capabilities`);
    const response = await fetch(targetUrl);
    return handleResponse(response);
  },

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
