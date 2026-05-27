// hooks/useMonthlyMetrics.js
import { useState, useEffect } from "react";
import otifJson from "../components/data/OTIF-waterfall.json";
// CWE-918 fix (Medium): import pre-validated base URL instead of reading
// process.env.REACT_APP_API_URL directly into fetch().
import { SAFE_API_URL } from "../utils/apiUrlValidator";

// ---------------------------------------------------------------------------
// CWE-918 fix (Low): month parameter allow-list.
//
// Original (line 40):
//   await fetch(`${process.env.REACT_APP_API_URL}/2024/${month}`)
//
// `month` is a caller-supplied string that flows directly into the URL path.
// An attacker-controlled value could inject path-traversal sequences (e.g.
// "../../admin") or redirect the request to an unexpected endpoint.
//
// Fix: month is validated against a closed set of expected values before
// being used in the URL. Anything outside the set is rejected early.
// ---------------------------------------------------------------------------
const VALID_MONTHS = new Set([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

function sanitiseMonth(month) {
  if (typeof month === "string" && VALID_MONTHS.has(month)) return month;
  return null;
}

export function useMonthlyMetrics(month) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // CWE-918 fix (Low): validate month before any URL construction.
      const safeMonth = sanitiseMonth(month);
      if (!safeMonth) {
        setError(`Invalid month parameter: "${month}"`);
        setLoading(false);
        return;
      }

      // 1️⃣ Try local file first
      try {
        if (
          !otifJson ||
          typeof otifJson !== "object" ||
          !otifJson["2024"] ||
          !otifJson["2024"][safeMonth]
        ) {
          throw new Error(
            "Invalid or missing local OTIF data for the specified month",
          );
        }
        const localMetrics =
          otifJson["2024"][safeMonth]?.Overall_Monthly_Metrics;
        if (!localMetrics) {
          throw new Error("Missing Overall_Monthly_Metrics in local data");
        }
        setMetrics(localMetrics);
        setLoading(false);
        return; // Success: Skip fallback
      } catch (localErr) {
        // fall through to API
      }

      // 2️⃣ Fallback to API fetch for the specific month
      // CWE-918 fix (Medium): SAFE_API_URL validated at module load.
      // CWE-918 fix (Low): safeMonth validated above — not raw `month`.
      try {
        const response = await fetch(
          `${SAFE_API_URL}/2024/${encodeURIComponent(safeMonth)}`,
        );
        if (!response.ok) {
          throw new Error(`Network error: ${response.status}`);
        }
        const json = await response.json();
        const fetchedMetrics = json?.Overall_Monthly_Metrics;
        if (!fetchedMetrics) {
          throw new Error("Missing Overall_Monthly_Metrics in API response");
        }
        setMetrics(fetchedMetrics);
      } catch (fetchErr) {
        setError(fetchErr.message);
      } finally {
        setLoading(false);
      }
    };

    if (month) {
      loadData();
    } else {
      setError("Month parameter is required");
      setLoading(false);
    }
  }, [month]);

  return { metrics, loading, error };
}
