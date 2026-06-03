/**
 * utils/apiUrlValidator.js
 *
 * Shared CWE-918 (SSRF) mitigation utility.
 *
 * All fetch calls that build a URL from process.env must go through
 * getSafeApiUrl() or use the pre-validated SAFE_API_URL / SAFE_API_BASE
 * constants exported below.
 *
 * Validation rules:
 *  - URL must be parseable.
 *  - Scheme must be https: in production (http: allowed for localhost in dev).
 *  - Origin must match REACT_APP_ALLOWED_API_ORIGINS (comma-separated) when
 *    that env var is set; otherwise the origin of REACT_APP_API_URL is the
 *    sole allowed origin.
 */

const _cache = new Map();

export function getSafeApiUrl(rawUrl) {
  if (_cache.has(rawUrl)) return _cache.get(rawUrl);

  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("[apiUrlValidator] URL is empty or not a string.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[apiUrlValidator] Unparseable URL: "${rawUrl}"`);
  }

  const isDev =
    process.env.NODE_ENV === "development" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1";

  if (!isDev && parsed.protocol !== "https:") {
    throw new Error(
      `[apiUrlValidator] Only HTTPS is allowed in production. Got "${parsed.protocol}"`,
    );
  }

  const allowedOrigins = process.env.REACT_APP_ALLOWED_API_ORIGINS
    ? process.env.REACT_APP_ALLOWED_API_ORIGINS.split(",").map((o) => o.trim())
    : [parsed.origin];

  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error(
      `[apiUrlValidator] SSRF guard: "${parsed.origin}" is not in the allow-list.`,
    );
  }

  // Cache and return the validated origin (strips any path/query from env value)
  _cache.set(rawUrl, parsed.origin);
  return parsed.origin;
}

// Pre-validated constants — import these instead of reading process.env directly.
export const SAFE_API_URL = getSafeApiUrl(
  process.env.REACT_APP_API_URL || "http://localhost:8000",
);

export const SAFE_API_BASE = getSafeApiUrl(
  process.env.REACT_APP_API_BASE_URL ||
    `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`,
);
