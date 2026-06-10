// App.js
import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
  useNavigate,
} from "react-router-dom";
import NavBar from "./components/NavBar";
import HomeScreen from "./components/HomeScreen";
import ViewAssessment from "./components/ViewAssessment";
import WelcomeScreen from "./components/WelcomeScreen";
import VirtualAssistantProvider from "./components/VirtualAssistantProvider";
import DemoPage from "./components/DemoPage";
import AssistantTabScreen from "./components/chatbot/AssistantTabScreen";
import AppFooter from "./components/common/AppFooter";
import { UserProvider } from "./components/usecontext/UserContext";
import LogOut from "./components/LogOut";
import Error from "./components/error";
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import { PersistGate } from "redux-persist/integration/react";
import { persistor, updateMetaTimestamp, purgePersistedState } from "./store";
import { useDispatch, useSelector } from "react-redux";

// ProtectedRoute ensures component is only rendered when authenticated
const ProtectedRoute = ({ children }) => (
  <>
    <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
    <UnauthenticatedTemplate>
      <Navigate to="/" replace />
    </UnauthenticatedTemplate>
  </>
);

// AssistantTabScreen router handler
const AssistantTabRoute = () => {
  const { tabname } = useParams();
  return <AssistantTabScreen tabname={tabname} />;
};

// ---------------------------------------------------------------------------
// SAST Fix — CWE-79 (XSS): safe localStorage reader
//
// Original (line 69): persisted = localStorage.getItem("persist:root")
// This raw string was then parsed and used inside setInterval(checkExpiry).
// AppScan flagged the data flow as a potential XSS sink because unsanitised
// storage data could carry a malicious payload that reaches a DOM context.
//
// Fix: all localStorage access is isolated in readPersistedMeta().
//   - Value is parsed with JSON.parse inside a try/catch.
//   - Only a specific numeric field (lastPersistedAt) is ever extracted.
//   - No raw string from storage is passed to any DOM API, setInterval
//     callback argument, or template literal that could be rendered.
// ---------------------------------------------------------------------------
function readPersistedMeta() {
  try {
    const raw = localStorage.getItem("persist:root");
    if (!raw || typeof raw !== "string") return null;

    const outer = JSON.parse(raw);
    if (!outer || typeof outer !== "object") return null;

    const metaRaw = outer.meta;
    if (!metaRaw || typeof metaRaw !== "string") return null;

    const meta = JSON.parse(metaRaw);
    if (!meta || typeof meta !== "object") return null;

    const lastPersistedAt = meta.lastPersistedAt;
    // Accept only a finite number — never a string or object
    if (
      typeof lastPersistedAt !== "number" ||
      !Number.isFinite(lastPersistedAt)
    )
      return null;

    return { lastPersistedAt };
  } catch {
    return null; // any parse error → treat as no valid session
  }
}

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXPIRY_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const AppInner = ({ msalInstance }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isExpired = useSelector((state) => state.meta?.isExpired);
  const hasHandledStartup = useRef(false);

  // ── Stamp active session on mount ──────────────────────────────
  useEffect(() => {
    if (hasHandledStartup.current) return;
    if (!isExpired) {
      dispatch(updateMetaTimestamp());
    }
    hasHandledStartup.current = true;
  }, [dispatch, isExpired]);

  // ── Runtime expiry check every 5 minutes ───────────────────────
  //
  // CWE-79 fix (line 85): setInterval callback no longer passes raw
  // localStorage data anywhere. readPersistedMeta() returns a validated
  // plain object with a single numeric field; only that number is used
  // in an arithmetic comparison — it never reaches any DOM API.
  useEffect(() => {
    const checkExpiry = () => {
      // CWE-79 fix: use validated reader instead of raw localStorage.getItem
      const meta = readPersistedMeta();
      if (!meta) return;

      const age = Date.now() - meta.lastPersistedAt; // arithmetic only, no DOM
      if (age > SESSION_MAX_AGE_MS) {
        dispatch({ type: "meta/EXPIRE" });
      }
    };

    checkExpiry(); // run immediately on mount

    // CWE-79 fix: setInterval receives a pure function reference;
    // no storage-derived string flows through it.
    const interval = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dispatch]);

  // ── Handle expired state → force logout ───────────────────────
  useEffect(() => {
    if (isExpired) {
      const doReset = async () => {
        await persistor.flush();
        await purgePersistedState();
        dispatch({ type: "auth/logout" });
        navigate("/logout", { replace: true });
      };
      doReset();
    }
  }, [isExpired, dispatch, navigate]);

  return (
    <MsalProvider instance={msalInstance}>
      <UserProvider>
        <PersistGate loading={null} persistor={persistor}>
          <NavBar />
          <VirtualAssistantProvider>
            <Routes>
              <Route path="/" element={<WelcomeScreen />} />
              <Route
                path="/logout"
                element={<LogOut msalInstance={msalInstance} />}
              />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomeScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assessment"
                element={
                  <ProtectedRoute>
                    <ViewAssessment />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/demo"
                element={
                  <ProtectedRoute>
                    <DemoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assistant/:tabname"
                element={
                  <ProtectedRoute>
                    <AssistantTabRoute />
                  </ProtectedRoute>
                }
              />
              {/* catch-all route must be last */}
              <Route path="*" element={<Error />} />
            </Routes>
            <AppFooter />
          </VirtualAssistantProvider>
        </PersistGate>
      </UserProvider>
    </MsalProvider>
  );
};

// Outer App wraps everything in <Router> so AppInner can safely use useNavigate
function App(props) {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppInner {...props} />
    </Router>
  );
}

export default App;
