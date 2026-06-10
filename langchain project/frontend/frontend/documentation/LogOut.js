// components/LogOut.js
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { kpiApi } from "../services/kpiApi";
import { persistor } from "../store";

const LogOut = ({ msalInstance }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    const logoutAndClear = async () => {
      try {
        // 1. Read current user email from persisted auth state (if available)
        let userEmail = null;
        try {
          const persisted = localStorage.getItem("persist:root");
          if (persisted) {
            const parsed = JSON.parse(persisted);
            if (parsed.auth) {
              const authState = JSON.parse(parsed.auth);
              userEmail = authState?.user?.email || null;
            }
          }
        } catch {
          // ignore errors in reading persisted store
        }

        // 2. Clear chat-related localStorage for that user
        if (userEmail) {
          try {
            localStorage.removeItem(`chatHistory_${userEmail}`);
            localStorage.removeItem(`conversationsByThread_${userEmail}`);
          } catch {
            // ignore storage errors
          }
        }

        // 2.5 Clear ALL possible chat keys (covers fixed + user-specific)
        Object.keys(localStorage).forEach((key) => {
          if (key.includes("chatHistory") || key.includes("conversations")) {
            localStorage.removeItem(key);
          }
        });

        // 3. Reset RTK Query slice in Redux (clears all queries/mutations)
        dispatch(kpiApi.util.resetApiState());

        // 4. Wipe all Redux state in memory
        dispatch({ type: "auth/logout" });

        // 5. Purge persisted store (removes persist:root)
        await persistor.purge();

        // 6. MSAL logout — postLogoutRedirectUri ensures MSAL
        //    processes the return correctly and resets inProgress to None
        if (msalInstance) {
          await msalInstance.logoutRedirect({
            postLogoutRedirectUri: window.location.origin, // redirects back to "/"
          });
        } else {
          window.location.href = "/";
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error during logout cleanup", err);
        window.location.href = "/";
      }
    };

    logoutAndClear();
  }, [dispatch, msalInstance]);

  return (
    <div className="logout-container d-flex justify-content-center align-items-center flex-column m-5 p-5">
      <h2>Logging you out...</h2>
      <p>Please wait while we securely sign you out.</p>
    </div>
  );
};

export default LogOut;
