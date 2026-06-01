/* eslint-disable no-console */
import { LogLevel } from "@azure/msal-browser";

// MSAL Configuration for Microsoft Entra (Azure Active Directory)
export const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_ENTRA_CLIENT_ID, // Application (client) ID from Azure portal
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_ENTRA_TENANT_ID}`, // Directory (tenant) ID
    redirectUri: process.env.REACT_APP_CLIENT_URL, // Must match Azure app registration
    postLogoutRedirectUri: process.env.REACT_APP_POST_LOGOUT_REDIRECT_URI, // Where to redirect after logout
    navigateToLoginRequestUrl: false, // Navigate back to original request location after login
  },
  cache: {
    cacheLocation: "sessionStorage", // Options: "sessionStorage" or "localStorage"
    storeAuthStateInCookie: false, // Set to true for IE11 or Edge legacy browser support
  },
  system: {
    allowNativeBroker: false, // Disables WAM Broker
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
          default:
            return;
        }
      },
      piiLoggingEnabled: false, // Set to true for debugging (never in production)
    },
  },
};

// MS Graph API endpoints
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
  graphUsersEndpoint: "https://graph.microsoft.com/v1.0/users",
};

// Access token scopes
export const loginRequest = {
  scopes: ["User.Read"], // Basic profile information
};

export const silentRequest = {
  scopes: ["openid", "profile", "User.Read", "email"],
  account: undefined, // Will be set dynamically
};

// Optional: Additional scopes for your API if needed
export const protectedResources = {
  customApi: {
    endpoint: process.env.REACT_APP_API_URL,
    scopes: [`api://${process.env.REACT_APP_ENTRA_CLIENT_ID}/access_as_user`],
  },
};
