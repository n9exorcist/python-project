// store.js
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import benchmarkReducer from "./slices/benchmarkSlice";
import oneGoReducer from "./slices/oneGoSlice";
import fileUploadReducer from "./slices/fileUploadSlice";
import tabAccessReducer from "./slices/tabAccessSlice";
import { kpiApi } from "./services/kpiApi";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage";

const initialState = {
  myDiagnosticData: [],
};

function customReducer(state = initialState, action) {
  switch (action.type) {
    case "SET_MY_DIAGNOSTIC_DATA":
      return {
        ...state,
        myDiagnosticData: action.payload,
      };
    default:
      return state;
  }
}

// 🔹 META SLICE to track lastPersistedAt
const META_UPDATE = "meta/UPDATE_TIMESTAMP";

// export an action creator so we can call it from React
export const updateMetaTimestamp = () => ({ type: META_UPDATE });

const metaInitialState = {
  lastPersistedAt: Date.now(),
  isExpired: false,
};

// ✅ keep 24 hours for testing, switch back later
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function metaReducer(state = metaInitialState, action) {
  switch (action.type) {
    case META_UPDATE:
      return {
        ...state,
        lastPersistedAt: Date.now(),
        isExpired: false,
      };
    // ✅ ADD THIS: allow explicit expiry trigger
    case "meta/EXPIRE":
      return {
        ...state,
        isExpired: true,
      };
    default:
      return state;
  }
}

// Combine ALL your reducers, including kpiApi:
const appReducer = combineReducers({
  custom: customReducer,
  benchmarkData: benchmarkReducer,
  fileUpload: fileUploadReducer,
  oneGo: oneGoReducer,
  tabAccess: tabAccessReducer,
  [kpiApi.reducerPath]: kpiApi.reducer,
  meta: metaReducer,
});

// 🔹 Root reducer that can wipe / expire state
const rootReducer = (state, action) => {
  // wipe everything on logout
  if (action.type === "auth/logout") {
    state = undefined;
  }

  // ✅ important: read from action.payload during REHYDRATE
  if (action.type === REHYDRATE) {
    const inboundState = action.payload;

    if (inboundState) {
      const now = Date.now();
      const last = inboundState.meta?.lastPersistedAt ?? 0;
      const age = now - last;

      if (age > EXPIRY_MS) {
        // return a fresh expired state immediately
        return appReducer(
          {
            custom: initialState,
            benchmarkData: undefined,
            fileUpload: undefined,
            oneGo: undefined,
            tabAccess: undefined,
            [kpiApi.reducerPath]: undefined,
            meta: {
              lastPersistedAt: last,
              isExpired: true,
            },
          },
          action,
        );
      }
    }
  }

  return appReducer(state, action);
};

const persistConfig = {
  key: "root",
  version: 1,
  storage,
  whitelist: ["tabAccess", "fileUpload", "kpiApi", "meta"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredPaths: ["kpiApi.queries", "kpiApi.mutations"],
      },
    }).concat(kpiApi.middleware),
});

setupListeners(store.dispatch);

export const persistor = persistStore(store);

export const purgePersistedState = async () => {
  await persistor.purge();
};

export default store;
