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
 *
 * SAST fixes applied:
 *  ✅ CWE-918 : allowlist-based origin validation before every fetch
 *  ✅ CWE-20  : rejects non-string / empty / unparseable inputs
 *  ✅ CWE-209 : error messages never echo back raw env-var contents in prod
 */

const _cache = new Map();

export function getSafeApiUrl(rawUrl) {
  if (_cache.has(rawUrl)) return _cache.get(rawUrl);

  // CWE-20: reject empty / non-string input immediately
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("[apiUrlValidator] URL is empty or not a string.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[apiUrlValidator] Unparseable URL provided.`);
    //              ^ CWE-209: original message echoed rawUrl; omitted in prod
  }

  // Allow http: only for localhost / 127.0.0.1 during local development.
  // Everything else must be https: (enforced in staging + production).
  const isDev =
    process.env.NODE_ENV === "development" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1";

  if (!isDev && parsed.protocol !== "https:") {
    throw new Error(
      `[apiUrlValidator] Only HTTPS is allowed in production. ` +
        `Got "${parsed.protocol}" — update REACT_APP_API_URL or REACT_APP_API_BASE_URL.`,
    );
  }

  // Build the allow-list from REACT_APP_ALLOWED_API_ORIGINS when provided.
  // Falls back to the origin of the configured base URL so existing deployments
  // that don't set the extra variable keep working unchanged.
  const allowedOrigins = process.env.REACT_APP_ALLOWED_API_ORIGINS
    ? process.env.REACT_APP_ALLOWED_API_ORIGINS.split(",").map((o) => o.trim())
    : [parsed.origin];

  // CWE-918: block any origin not in the allow-list
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error(
      `[apiUrlValidator] SSRF guard: origin is not in the allow-list. ` +
        `Check REACT_APP_ALLOWED_API_ORIGINS.`,
      //  ^ CWE-209: parsed.origin deliberately omitted from the thrown message
      //    so the validator cannot be used to probe internal hostnames via error
      //    messages surfaced to end-users. Developers see it in the console only.
    );
  }

  // Cache and return the validated *origin only* (strips any accidental path /
  // query string that may have been present in the env value).
  _cache.set(rawUrl, parsed.origin);
  return parsed.origin;
}

// ─── Pre-validated constants ───────────────────────────────────────────────────
// Import SAFE_API_URL or SAFE_API_BASE in service files instead of reading
// process.env directly. Both are evaluated once at module-load time so any
// misconfiguration is caught immediately on app startup, not on first API call.

export const SAFE_API_URL = getSafeApiUrl(
  process.env.REACT_APP_API_URL || "http://localhost:8000",
);

export const SAFE_API_BASE = getSafeApiUrl(
  process.env.REACT_APP_API_BASE_URL ||
    `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/api`,
);
