import { SAFE_API_BASE } from "../utils/apiUrlValidator";

/**
 * Asserts outbound target constraints right at the execution sink boundary
 */
const verifyTargetUrl = (constructedUrl) => {
  const currentOrigin = window.location.origin;
  const verifiedBase = new URL(SAFE_API_BASE, currentOrigin).toString();
  const absoluteTarget = new URL(constructedUrl, currentOrigin).toString();

  if (!absoluteTarget.startsWith(verifiedBase)) {
    throw new Error(
      "Security Exception: Outbound resource call violates trusted target domain constraints.",
    );
  }
  return constructedUrl;
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
    // Rigid digit validation boundary
    const safeYear = /^\d{4}$/.test(String(year)) ? String(year) : "2024";

    // Explicit runtime confirmation step added to satisfy SAST sink checks
    const verifiedUrl = verifyTargetUrl(`${SAFE_API_BASE}/${safeYear}`);
    const response = await fetch(verifiedUrl);
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
    const verifiedUrl = verifyTargetUrl(`${SAFE_API_BASE}/capabilities`);
    const response = await fetch(verifiedUrl);
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
