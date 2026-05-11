// src/components/chatbot/MethodOneVirtualAssistant.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import BotLoader from "../common/BotLoader";
import { useUser } from "../usecontext/UserContext";
import { useMsal } from "@azure/msal-react";
import useChat from "../../hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ✅ NEW: GFM plugin for tables
import ChartRenderer from "./ChartRenderer";
import "../../assets/css/MethodOneVirtualAssistant.css";
import { getBlobUrl } from "../../utils/blobUrls";

// Helper: extract 'tab' from query string
function useTabParam(defaultTab = "executive-summary") {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return params.get("tab") || defaultTab;
}

const MethodOneVirtualAssistant = ({
  isOpen = true,
  isCompact = false,
  isFullScreen = false,
  onClose,
  initialMsg = "",
  isWidget = false,
}) => {
  const { user, loading: userLoading, getAccessToken } = useUser();
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const activeTab = useTabParam("executive-summary");

  // ✅ Always call hook
  const chatHook = useChat(user, getAccessToken);
  const {
  chatHistory,
  loading,
  threadsLoading,
  error,
  sendMessage,
  clearChat,
  threadId,
  conversationsByThread,
  loadThreadHistory,
  removeThread,
} = chatHook || {
  chatHistory: [],
  loading: false,
  threadsLoading: false,
  error: null,
  sendMessage: async () => {},
  clearChat: () => {},
  threadId: null,
  conversationsByThread: {},
  loadThreadHistory: () => {},
  removeThread: async () => {},
};

  const [input, setInput] = useState(isFullScreen ? "" : initialMsg);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [isCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closing, setClosing] = useState(false);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  // ✅ Display name
  const displayName =
    user?.name || accounts[0]?.name || accounts[0]?.username || "Guest";

  const userInitials =
    displayName !== "Guest"
      ? displayName
          .split(" ")
          .map((word) => word[0]?.toUpperCase())
          .join("")
          .slice(0, 2)
      : "GU";

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  // Focus input
  useEffect(() => {
    if (inputRef.current && !loading && !isCollapsed) {
      inputRef.current.focus();
    }
  }, [loading, isCollapsed]);

  // Navigation options
  const getOptions = () => {
    if (pathname === "/assessment") {
      return [
        {
          icon: (
            <span className="material-symbols-outlined fs-3">analytics</span>
          ),
          label: "Download the workbench report",
          tab: "executive-summary",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">
              attach_money
            </span>
          ),
          label: "Take me to the business case",
          tab: "business-case",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">balance</span>
          ),
          label: "Show me the peer financial analysis",
          tab: "peer-financial-analysis",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">calculate</span>
          ),
          label: "Give the KPI benchmarks for CPG industry",
          tab: "kpi-benchmarking",
        },
      ];
    }

    return [
      {
        icon: <span className="material-symbols-outlined fs-3">event</span>,
        label: "Show the demo video",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">book</span>,
        label: "View the guidebook",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">build</span>,
        label: "Open Workbench",
      },
      {
        icon: <span className="material-symbols-outlined fs-3">home</span>,
        label: "Browse the FAQs",
      },
    ];
  };

  const options = getOptions();

  // URLs / mapping for quick actions
  const guidebookUrl = getBlobUrl("userguide/RDF_User%20Guide.pptx");
  const labelToPath =
    pathname === "/assessment"
      ? {
          "Give the KPI benchmarks for CPG industry":
            "/assessment?tab=kpi-benchmarking",
          "Show me the peer financial analysis":
            "/assessment?tab=peer-financial-analysis",
          "Download the workbench report":
            "/assessment?tab=executive-summary",
          "Take me to the business case": "/assessment?tab=business-case",
        }
      : {
          "Browse the FAQs": "/home",
          "Show the demo video": "/demo",
          "Open Workbench": "/assessment",
          "View the guidebook": guidebookUrl,
        };

  const sampleQueries = (pathname) => {
    if (pathname === "/") {
      return [
        "Watch the demo video to get a quick walkthrough of the tool's features and capabilities.",
        "View the guidebook for step-by-step instructions and detailed reference material.",
        "Browse the FAQs to find quick answers to common questions and issues.",
        "Show me the overview page with a summary of inputs and the corresponding outputs.",
        "Launch the workbench for the assessment for a hands-on experience.",
      ];
    }

    if (pathname === "/assessment") {
      return [
        "Show the past 3-year forecast accuracy trend for CPG Industry and suggest short-term actions to improve it",
        "What has been the Inventory % of Revenue at Plant Level over the last 3 years, and how can we optimize it in the next 6 months?",
        "Provide Logistics Cost/FTE and OTIF for the North region over the past 3 years and recommend ways to improve efficiency",
        "Show Supply Chain FTEs per $B revenue for Modern Trade channel over the past 3 years and suggest mid-term efficiency improvements",
        "What has been OTIF performance for e-commerce and traditional trade in the last 3 years, and what short-term steps can enhance service?",
      ];
    }

    return [];
  };

  // Submit handler
  const handleSubmit = useCallback(
    async (msg) => {
      const userMsg =
        msg != null ? String(msg).trim() : (input || "").trim();
      if (!userMsg) return;

      setInput("");
      await sendMessage(userMsg);
    },
    [input, sendMessage]
  );

  const handleOptionClick = (label) => {
    const target = labelToPath[label];

    if (target) {
      if (/^https?:\/\//.test(target)) {
        window.open(target, "_blank", "noopener,noreferrer");
      } else if (target.startsWith("/")) {
        navigate(target);
      }
    } else {
      handleSubmit(label);
    }
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (onClose) onClose();
      else {
        navigate("/");
        clearChat();
      }
    }, 1000);
  };

  const handleNewChat = () => {
    setInput("");
    clearChat();
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  };

  // Auto-send initial message for tab screens
  useEffect(() => {
    if (initialMsg && chatHistory.length === 0 && !isFullScreen) {
      handleSubmit(initialMsg);
    }
  }, [initialMsg, chatHistory.length, isFullScreen, handleSubmit]);

  if (!isOpen) return null;
  if (userLoading || closing) return <BotLoader />;

  const sidebarWidth = 320;
  const headerHeight = 56;
  const mainWidth = isCollapsed ? 400 : 860;
  const minHeightValue = isCompact
    ? "auto"
    : isFullScreen
    ? "92vh"
    : 470;

  const visibleChatHistory = (chatHistory || []).filter((c) => {
    const hasText = !!String(c?.message ?? "").trim();
    const hasChart =
      !!c?.chartData &&
      (Array.isArray(c.chartData)
        ? c.chartData.length > 0
        : Object.keys(c.chartData || {}).length > 0);

    return hasText || hasChart;
  });

  return (
    <div
      className="methodone-virtual-assistant-container"
      style={{
        borderRadius: isCompact ? 0 : isMaximized ? 0 : 18,
        boxShadow: isCompact ? "none" : "0 6px 40px rgba(137,27,247,0.14)",
        minHeight: isMaximized ? "100vh" : minHeightValue,
        minWidth: isMaximized ? "100vw" : undefined,
        width: isMaximized ? "50vw" : undefined,
        height: isMaximized ? "auto" : undefined,
        position: isMaximized ? "fixed" : "relative",
        left: isMaximized ? 0 : undefined,
        top: isMaximized ? 0 : undefined,
        zIndex: isMaximized ? 9999 : "auto",
        margin: isFullScreen ? 10 : 0,
      }}
    >
      {/* HEADER */}
      {isFullScreen ? (
        <div
          className="virtual-assistant-header fullscreen-header"
          style={{ height: headerHeight }}
        >
          <div className="header-content">
            <span className="material-symbols-outlined fs-3 me-2">
              robot_2
            </span>
            Rapid Supply Chain Diagnostic Assistant
          </div>
          <div className="header-actions header-actions-methodone">
            {!onClose && (
              <button
                aria-label={isMaximized ? "Restore" : "Maximize"}
                className="maximize-button"
                onClick={() => setIsMaximized((x) => !x)}
              >
                <span className="material-symbols-outlined">
                  {isMaximized ? "fullscreen_exit" : "fullscreen"}
                </span>
              </button>
            )}
            {onClose && (
              <button
                onClick={handleClose}
                className="close-button mb-0"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="virtual-assistant-header"
          style={{ display: isCompact ? "none" : "flex" }}
        >
          <div className="header-content">
            <span className="material-symbols-outlined fs-3">robot_2</span>
            Rapid Supply Chain Diagnostic Assistant
          </div>
          <div className="header-actions header-actions-methodtwo">
            <button
              aria-label={isMaximized ? "Restore" : "Maximize"}
              className="maximize-button"
              onClick={() => setIsMaximized((x) => !x)}
            >
              <span className="material-symbols-outlined">
                {isMaximized ? "fullscreen_exit" : "fullscreen"}
              </span>
            </button>
            {onClose && (
              <button onClick={handleClose} className="close-button">
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* MAIN WRAPPER */}
      <div
        className="main-content-wrapper"
        style={{
          paddingTop: isFullScreen ? 50 : 0,
          height: isFullScreen
            ? `calc(100vh - ${headerHeight}px)`
            : "auto",
        }}
      >
        {/* CHAT SIDEBAR */}
        {isFullScreen && showChatSidebar && (
          <div
            className="chat-history-sidebar"
            style={{ width: sidebarWidth }}
          >
            <div className="sidebar-header">
              <span>Chats</span>
              <button
                onClick={() => setShowChatSidebar(false)}
                className="sidebar-close-button"
                aria-label="Close chat sidebar"
              >
                ×
              </button>
            </div>

            <div className="sidebar-new-chat-wrapper">
              <button
                type="button"
                className="sidebar-new-chat-button"
                onClick={handleNewChat}
              >
                <span className="material-symbols-outlined fs-4">add</span>
                <span style={{ marginLeft: 6 }}>New Chat</span>
              </button>
            </div>

            {/* CHAT SIDEBAR - replace the existing sidebar-content div */}
{/* CHAT SIDEBAR - replace the existing sidebar-content div */}
<div className="sidebar-content">
  {threadsLoading ? (
    <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
      Loading conversations...
    </div>
  ) : Object.values(conversationsByThread || {}).length === 0 ? (
    <div style={{ padding: "16px", color: "#aaa", textAlign: "center" }}>
      No conversations yet
    </div>
  ) : (
    Object.values(conversationsByThread || {})
      .sort((a, b) =>
        new Date(a?.lastMessageAt || a?.createdAt || 0) 
          ? 1
          : -1
      )
      .map((conv) => {
  // ✅ Use backend title directly — no need to load messages first
  // Falls back to shortened ID only if backend didn't send a title
  const displayTitle =
    conv.title ||
    conv.messages?.find((m) => m.from === "user")?.message ||
    `Chat ${conv.threadId?.substring(0, 8)}...`;

  const truncated =
    displayTitle.length > 40
      ? `${displayTitle.substring(0, 40)}...`
      : displayTitle;

  return (
    <div
      key={conv.threadId}
      className={`sidebar-item${conv.threadId === threadId ? " active" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
      onClick={() => loadThreadHistory(conv.threadId)}
    >
      <div
        className="sidebar-item-title"
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {truncated}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeThread(conv.threadId);
        }}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#aaa",
          padding: "2px 4px",
          flexShrink: 0,
        }}
        title="Delete conversation"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          delete
        </span>
      </button>
    </div>
  );
})
  )}
</div>
          </div>
        )}

        {/* MAIN CHAT AREA */}
        <div
          className="main-chat-area"
          style={{
            width: isFullScreen ? mainWidth : "auto",
            transition: "width 0.3s ease",
          }}
        >
          {/* SAMPLE QUESTIONS */}
          {visibleChatHistory.length === 0 &&
            isFullScreen &&
            sampleQueries(pathname).length > 0 && (
              <div className="sample-questions">
                <span className="sample-questions-title mt-3">
                  <span className="material-symbols-outlined fs-3">
                    blur_on
                  </span>
                  Sample questions
                </span>
                {sampleQueries(pathname).map((query, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(query)}
                    className="sample-query-button"
                  >
                    {query}
                  </button>
                ))}
              </div>
            )}

          {/* NON-FULLSCREEN WELCOME */}
          {visibleChatHistory.length === 0 && !isFullScreen && (
            <div
              className="non-fullscreen-welcome"
              style={{
                padding: isCompact ? "12px 16px 5px" : "17px 21px 5px",
              }}
            >
              <div className="welcome-message">
                Welcome {displayName}!
              </div>
              <div
                className="options-grid"
                style={{
                  gridTemplateColumns: "1fr 1fr",
                  gap: isCompact ? 8 : 11,
                }}
              >
                {options.map((o) => (
                  <button
                    key={o.label}
                    className={`option-button${
                      pathname === "/assessment" && o.tab === activeTab
                        ? " active"
                        : ""
                    }`}
                    style={{
                      padding: isCompact ? "8px 6px" : "11px 9px",
                      fontSize: isCompact ? "11px" : "12px",
                    }}
                    onClick={() => handleOptionClick(o.label)}
                  >
                    <span style={{ fontSize: isCompact ? 14 : 16 }}>
                      {o.icon}
                    </span>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CHAT BUBBLES */}
          <div
            ref={chatContainerRef}
            className="chat-bubbles-container"
            style={{
              padding: isFullScreen ? "0 28px" : "0 17px",
              flex: 1,
              overflowY: "auto",
            }}
          >
            {visibleChatHistory.map((c, i) => (
              <div
                className={`chat-bubble-wrapper ${
                  c.from === "user" ? "user" : "bot"
                }`}
                key={`${c.from}-${i}`}
              >
                <div
                  className="chat-avatar"
                  style={{
                    background:
                      c.from === "user" ? "#eceefd" : "#eedbfc",
                    margin:
                      c.from === "user"
                        ? "0 0 0 8px"
                        : "0 8px 0 0",
                  }}
                >
                  {c.from === "user" ? (
                    userInitials
                  ) : (
                    <span className="material-symbols-outlined fs-3">
                      robot_2
                    </span>
                  )}
                </div>

                <div
                  className={`chat-bubble ${c.from}`}
                  style={{
                    background:
                      c.from === "bot" ? "#f7f2fc" : "#e8edfd",
                    color:
                      c.from === "bot" ? "#4a287c" : "#7e2efc",
                    borderRadius:
                      c.from === "user"
                        ? "14px 14px 2px 14px"
                        : "14px 14px 14px 2px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        strong: ({ node, ...props }) => (
                          <strong style={{ fontWeight: 700 }} {...props} />
                        ),
                        p: ({ node, ...props }) => (
                          <p style={{ margin: "0 0 4px 0" }} {...props} />
                        ),
                      }}
                    >
                      {c.message ?? ""}
                    </ReactMarkdown>
                  </div>

                  {c.from === "bot" &&
                    c.chartData &&
                    (Array.isArray(c.chartData)
                      ? c.chartData.length > 0
                      : Object.keys(c.chartData).length > 0) && (
                      <div
                        className="chart-wrapper-bubble"
                        style={{
                          marginTop: "12px",
                          width: "100%",
                        }}
                      >
                        <ChartRenderer
                          data={c.chartData}
                          type={
                            c.chartType ||
                            c.state?.chart_intent?.chart_type ||
                            "bar"
                          }
                        />
                      </div>
                    )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-wrapper bot">
                <div
                  className="chat-avatar"
                  style={{
                    background: "#eedbfc",
                    margin: "0 8px 0 0",
                  }}
                >
                  <span className="material-symbols-outlined fs-3">
                    robot_2
                  </span>
                </div>
                <div className="chat-bubble bot">
                  <BotLoader />
                </div>
              </div>
            )}
          </div>

          {/* ERROR */}
          {error && (
            <div
              className="error-message"
              style={{
                padding: "12px 17px",
                color: "#f44336",
                background: "#fee",
              }}
            >
              {error}
            </div>
          )}

          {/* INPUT BAR */}
          <div
            className="input-bar"
            style={{
              padding: isFullScreen ? "19px 28px" : "13px 16px",
            }}
          >
            <div className="input-wrapper">
              {isFullScreen && (
                <button
                  className="sidebar-toggle"
                  onClick={() => setShowChatSidebar(!showChatSidebar)}
                  title={showChatSidebar ? "Close sidebar" : "Open sidebar"}
                  style={{
                    marginRight: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: "#5b5b5b",
                    cursor: "pointer",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "24px" }}
                  >
                    {showChatSidebar ? "left_panel_close" : "view_sidebar"}
                  </span>
                </button>
              )}

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask me anything..."
                disabled={loading}
                className="chat-input"
              />

              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || loading}
                className="send-button"
                aria-label="Send"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>

          {/* FOOTER */}
          <div className="footer-disclaimer">
            <span>AI-generated content. Use at your own discretion.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MethodOneVirtualAssistant;


--

import os
import io
from datetime import datetime
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Depends, Request, Body, status, Query
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse, HTMLResponse
from azure.storage.blob.aio import BlobServiceClient
from typing import List, Optional
from utils.keyvault_loader import get_secret_value
import jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import requests
from fastapi.middleware.cors import CORSMiddleware
from api.models import SelectionModel, OrchestrateRequest, OrchestrateResponse, PPTRequest, SafeJSONResponse, ChatRequest
#from app.agent.orchestrator import orchestrate_turn
from main_production import orchestrate_turn, ChatRequest, ChatResponse
from semantic_embedding import orchestrator_embedding
from utils.pgvector_user_data import user_data_exists, delete_all_user_data
#from main_embed import orchestrator
#from delete_pgvector import main as delete_user_data_pgvector
from api.logger_setup import logger
from dotenv import load_dotenv
from starlette.config import Config
from api.context_request import current_context_user
from utils.kpi_dropdown import filter_and_get, load_otif_data
from app.agent.otif_utilities import generate_waterfall_json_all, generate_trendline_json
# Import for PPT generation
from blob_lang import generate_ppt_pipeline
# Import for template
from api.utils import validate_file, upload_to_azure_blob, download_from_azure_blob, read_json_files_from_blob, read_json_file_from_blob, clean_floats, new_thread_id
# Import pipeline from parent folder
from data_validator import run_validations, run_summaries

from app.agent.otif_main import run_file_based_otif_calculation as run_file_based_otif_calculation_main
from app.agent.otif_pptx import run_file_based_otif_calculation as run_file_based_otif_pptx
# Maturity assessment
from app.agent.maturityrecs_leadingpract_pipeline import main as run_maturity_assessment
from app.agent.synthesizer import main as run_synthesizer
# Import kpi-benchmarking
from app.agent.data_extraction import process_all_documents
from app.agent.kpi_benchmark_pipeline import run_screen1_payload, run_screen2_payload, build_kpi_structure_from_excel, update_excel_with_kpi

# Recomendations horizontal roadmap
from app.agent.recommendations_horizonlevel_roadmap import main as run_recommendations
# Hypothesis generation
from app.agent.hypothesis import main as run_hypothesis
# Executive Summary
from app.agent.executive_summary import main as run_executive_summary
# Financial Analysis
from app.agent.financial_peers import generate_kpi_insights_from_blobs
from app.agent.financial_peers_pptx import run_financial_peers_pptx
from app.agent.financial_peers_overview import build_client_financial_overview_excel as run_financial_overview_excel
# Business Case Calculation
from app.agent.business_case import business_case_calc  
from app.agent.npv import main as run_npv_main
# PPT generation
from app.agent.business_case_pptx import save_business_case_json, business_case_json_to_excel
from app.agent.initiative_roadmap import main as run_initiative_roadmap
from app.agent.append_additional_ppts import process_additional_ppts
from utils_bot_code.postgres_chat_history_bot_code import get_chat_history_manager 
from app.monitor_dashboard import DASHBOARD_HTML as _DASHBOARD_HTML
from app.telemetry import (
    get_recent_calls,
    get_summary_stats,
    get_recent_traces,
    get_trace_by_id,
    get_trace_stats,
    get_llm_calls_for_trace,
    get_error_log,
    get_model_breakdown,
)
# Load env vars
load_dotenv()

# Load configuration from environment variables
config = Config(environ=os.environ)

# Required environment variables for SSO and Azure Blob Storage
SECRET_KEY = config("SECRET_KEY")
BASE_URL = config("BASE_URL", cast=str)
AZURE_CLIENT_ID = config("AZURE_CLIENT_ID")
#AZURE_CLIENT_SECRET = config("AZURE_CLIENT_SECRET")  # Load from Key Vault
AZURE_CLIENT_SECRET = get_secret_value("AZURE-CLIENT-SECRET")  # Load from Key Vault
TENANT_ID = config("AZURE_TENANT_ID")

#Azure Blob Storage settings
#AZURE_STORAGE_CONNECTION_STRING = config("AZURE_STORAGE_CONNECTION_STRING")  
AZURE_STORAGE_CONNECTION_STRING = get_secret_value("AZURE-STORAGE-CONNECTION-STRING")
AZURE_CONTAINER_NAME =  config("AZURE_CONTAINER_NAME")
PG_CONN_STR_BOT = os.getenv("AZURE_PG_CONN_STR_BOT")
# Container SAS URL 
#CONTAINER_SAS_URL = config("BLOB_CONTAINER_SAS_URL")

# Frontend URL 
FRONTEND_URL =  config("FRONTEND_URL")

if not all([SECRET_KEY, BASE_URL, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, TENANT_ID, FRONTEND_URL, PG_CONN_STR_BOT]):
    raise RuntimeError("Missing required environment variables.")

app = FastAPI(title="Supply Chain Rapid Diagnostics", version="1.0")

# List of origins allowed to make requests
origins = [
    FRONTEND_URL,   # React dev server
]
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       
    allow_credentials=True,
    allow_methods=["*"],          # Allows all HTTP methods (GET, POST, PUT, DELETE...)
    allow_headers=["*"],          # Allows all headers
)

bearer_scheme = HTTPBearer()

JWKS_URL = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
jwks = requests.get(JWKS_URL).json()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    token = credentials.credentials
    unverified_header = jwt.get_unverified_header(token)
    key = next((k for k in jwks["keys"] if k["kid"] == unverified_header["kid"]), None)

    if not key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid key ID")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=AZURE_CLIENT_ID   
        )
        return payload
    except jwt.InvalidAudienceError:
        print("Invalid audience in token")
        raise HTTPException(status_code=401, detail="Invalid audience")
    except jwt.ExpiredSignatureError:
        print("Token has expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidSignatureError:
        print("Invalid token signature")
        raise HTTPException(status_code=401, detail="Invalid signature")
    except Exception as e:
        print(f"Token validation error: {e}")
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/me", tags=["Auth"])
def read_current_user(user: dict = Depends(verify_token)):
    return {"message": "Authenticated", "user": user}

# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    return {"message": "Supply Chain Rapid Diagnostics"}

# --------------------------------- Start of API Endpoints for UI ---------------------------------
# Data Validation and Summary
@app.post("/validate-and-summarize/", tags=["Data Processing"])
async def validate_and_summarize(user: dict = Depends(verify_token), files: List[UploadFile] = File(...)):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user

    current_context_user(user_details=user)
    
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
    username = user.get("preferred_username", "").split("@")[0]
    directory = f"{TENANT_ID}/{username}/input"
    results = []
    async with blob_service_client:
        for file in files:
            validate_file(file) # Validate file with extension and size
            await upload_to_azure_blob(file, container_client, directory)
            results.append({"filename": file.filename, "uploaded_path": f"{directory}/{file.filename}"})
    try:
        run_validations()     # run data_validator
        data = await run_summaries()
        await delete_all_user_data(username)  # Clear previous user data in PGVector
        return JSONResponse(status_code=200, content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation or summarization failed: {e}")

    
# KPI Calculation for OTIF
@app.get("/kpi-calculation", tags=["KPI Calculation"])
async def calculate_otif(user: dict = Depends(verify_token)):
    """
    Runs OTIF calculation on a sales file and keeps
    both the input and generated output files intact.
    """
    if isinstance(user, RedirectResponse):
    # not logged in, redirect to login
        return user

    current_context_user(user_details=user)
    username = user.get("preferred_username", "").split("@")[0]
    input_blob_path = f"{TENANT_ID}/{username}/input/OTIF_Sales_Data_Template_valid_rows.xlsx"
    output_blob_base = f"{TENANT_ID}/{username}/agent_output"
    output_file_name = "otif_data.xlsx"
    logger.info("Received request for KPI calculation")
    
    try:
        logger.info(f"Running OTIF calculation on: {input_blob_path}")
        await run_synthesizer()  # update maturity assessment data
        #run_file_based_otif_calculation_p(input_blob_path, on_time_window_days, output_blob_base, output_file_name, output_local_dir)
        
        # KPI Calculation 
        _, data = run_file_based_otif_calculation_main(input_blob_path, output_blob_base)
        run_file_based_otif_pptx(username, 
        f"{TENANT_ID}/{username}/agent_output/{output_file_name}"
        )
        logger.info("OTIF calculation completed successfully")
        return JSONResponse(status_code=200, content=data)
    except Exception as e:
        logger.exception("Unexpected error during KPI calculation")
        raise HTTPException(status_code=500, detail=f"KPI calculation failed: {e}")

# ---------------------------------------------------
# 1️⃣ Month Dropdown
# ---------------------------------------------------
@app.get("/kpi/dropdown/month", tags=["KPI Dropdown"])
def dropdown_month(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    username = user.get("preferred_username", "").split("@")[0]
    df_otif = load_otif_data(username, method="dropdown")
    month_order = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
    ]

    months = df_otif["month"].dropna().unique().tolist()

    # Sort using the custom order
    ordered_months = sorted(months, key=lambda m: month_order.index(m))

    return {"options": ordered_months}

# ---------------------------------------------------
# 2️⃣ Channel Dropdown
# ---------------------------------------------------
@app.get("/kpi/dropdown/channel", tags=["KPI Dropdown"])
def dropdown_channel(
    user: dict = Depends(verify_token),
    month: Optional[List[str]] = Query(None)
):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    username = user.get("preferred_username", "").split("@")[0] 
    df_otif = load_otif_data(username, method="dropdown")
    filters = {"month": month}
    options = filter_and_get(df_otif, "channel", filters)
    return {"options": options}

# ---------------------------------------------------
# 3️⃣ Product (H1) Dropdown
# ---------------------------------------------------
@app.get("/kpi/dropdown/product_h1", tags=["KPI Dropdown"])
def dropdown_product_h1(
    user: dict = Depends(verify_token),
    month: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None)
):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    username = user.get("preferred_username", "").split("@")[0] 
    df_otif = load_otif_data(username, method="dropdown")
    filters = {
        "month": month,
        "channel": channel,
    }
   
    options = filter_and_get(
        df_otif,
        "product_heirarchy_1-classification",
        filters,
    )
    return {"options": options}

# ---------------------------------------------------
# 4️⃣ Brand (OTIF category) Dropdown
# ---------------------------------------------------
@app.get("/kpi/dropdown/brand_h2", tags=["KPI Dropdown"])
def dropdown_brand_h2(
    user: dict = Depends(verify_token),
    month: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    product_h1: Optional[List[str]] = Query(None),
):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    username = user.get("preferred_username", "").split("@")[0]
    df_otif = load_otif_data(username, method="dropdown")
    filters = {
        "month": month,
        "channel": channel,
        "product_heirarchy_1-classification": product_h1,
    }
    options = filter_and_get(
        df_otif,
        "product_heirarchy_3-_brand",
        filters,
    )
    return {"options": options}

# waterfall endpoint
@app.get("/kpi/waterfall/data", tags=["KPI Visualization"])
def waterfall_data(
    user: dict = Depends(verify_token),
    month: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    product_h1: Optional[List[str]] = Query(None),
    brand_h2: Optional[List[str]] = Query(None),
):
    """
    Generate waterfall JSON based on dropdown filter selections.
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    
    username = user.get("preferred_username", "").split("@")[0]
    df_otif = load_otif_data(username, method="waterfall")
    # ---- Build filters dict ----
    filters = {}

    if month:
        filters["month"] = month
    if channel:
        filters["channel"] = channel
    if product_h1:
        filters["product_heirarchy_1-classification"] = product_h1
    if brand_h2:
        filters["product_heirarchy_3-_brand"] = brand_h2

    # ---- Apply filters ----
    df_filtered = df_otif.copy()
    for col, values in filters.items():
        df_filtered = df_filtered[df_filtered[col].isin(values)]

    if df_filtered.empty:
        return {}

    # ---- Generate waterfall structure ----
    waterfall_json = generate_waterfall_json_all(df_filtered)

    return waterfall_json

# trandline endpoint
@app.get("/kpi/trandline/data", tags=["KPI Visualization"])
def trandline_data(
    user: dict = Depends(verify_token),
    month: Optional[List[str]] = Query(None),
    channel: Optional[List[str]] = Query(None),
    product_h1: Optional[List[str]] = Query(None),
    brand_h2: Optional[List[str]] = Query(None),
):
    """
    Generate trandline JSON based on dropdown filter selections.
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    
    username = user.get("preferred_username", "").split("@")[0]
    df_otif = load_otif_data(username, method="trendline")
    # ---- Build filters dict ----
    filters = {}

    if month:
        filters["month"] = month
    if channel:
        filters["channel"] = channel
    if product_h1:
        filters["product_heirarchy_1-classification"] = product_h1
    if brand_h2:
        filters["product_heirarchy_3-_brand"] = brand_h2

    # ---- Apply filters ----
    df_filtered = df_otif.copy()
    for col, values in filters.items():
        df_filtered = df_filtered[df_filtered[col].isin(values)]

    if df_filtered.empty:
        return {}

    # ---- Generate waterfall structure ----
    trandline_json = generate_trendline_json(df_filtered)

    return trandline_json

# Screen 1 API benchmarking
@app.get("/screen1-benchmarking", tags=["KPI Benchmarking"])
async def get_screen1_payload(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    
    current_context_user(user_details=user)
    username = user.get("preferred_username", "").split("@")[0]
    try:
        # Step 1: Preprocess every time this endpoint is hit
        #await process_all_documents() #Run only once 
        # Building KPI structure
        build_kpi_structure_from_excel()
        #await process_excel(f"{TENANT_ID}/static_files/KPI_Benchmark_Template.xlsx", f"{TENANT_ID}/{username}/input/Client_Inputs_KPI_Template_valid_records.xlsx")
        # Step 2: Build Screen1 payload
        data = await run_screen1_payload()
        # Step 4: Update Excel with KPI insights
        update_excel_with_kpi(
        # excel_blob_path=f"{TENANT_ID}/{user_details_ctx.get()}/agent_output/pivot_data.xlsx",  
        excel_blob_path=f"{TENANT_ID}/{username}/agent_output/pivot_data_with_otif.xlsx",  

        json_blob_file=f"{TENANT_ID}/{username}/agent_output/screen1_orglevel_payload.json",              
        # output_blob_file=f"{TENANT_ID}/{user_details_ctx.get()}/agent_output/pivot_data_kpi_insights.xlsx"  
        output_blob_file=f"{TENANT_ID}/{username}/agent_output/final_output_fl.xlsx"  

        )
        return JSONResponse(status_code=200, content=data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process data for Screen1: {e}")
# kpi dropdown structure for screen 2
@app.get("/screen2-kpi-dropdown", tags=["KPI Benchmarking"])
async def get_screen2_kpi_dropdown(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    
    current_context_user(user_details=user)
    username = user.get("preferred_username", "").split("@")[0]
    try:
        
        directory = f"{TENANT_ID}/{username}/agent_output"
        # Read files
        data = await read_json_file_from_blob("kpi_structure.json", directory)
        return JSONResponse(status_code=200, content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build KPI dropdown for Screen2: {e}")   

# Screen 2 API benchmarking
@app.post("/screen2-benchmarking", tags=["KPI Benchmarking"])
async def get_screen2_payload(
    selection: dict = Body(...),   # Accept raw dict instead of Pydantic model
    user: dict = Depends(verify_token)
):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    
    current_context_user(user_details=user)

    try:
        # selection is already a dict now
        data = await run_screen2_payload(selection)
        return JSONResponse(status_code=200, content=data)
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process data for Screen2: {e}"
        )

# Maturity Assessment
@app.get("/maturity-assessment", tags=["Maturity Assessment"])
async def my_maturity_assessment(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    current_context_user(user_details=user)
    username = user.get("preferred_username", "").split("@")[0]

    try:
        # Run the maturity assessment pipeline 
        await run_hypothesis()
        await run_maturity_assessment()

        directory = f"{TENANT_ID}/{username}/agent_output"
       
        # Read files
        l1_capability_ui = await read_json_file_from_blob("l1_capability_ui.json", directory)
        
        l1_l2_capability_tracking = await read_json_file_from_blob(
            "l1_l2_capability_tracking.json", f"{TENANT_ID}/{username}/input"
        )
        recommendation_leadingpractices = await read_json_file_from_blob("recommendation_leadingpractices.json", directory)

        # Prepare response
        data = {
            "status": "success",
            "l1_capability_tracking": clean_floats(l1_capability_ui), # Clean floats
            "l1_l2_capability_tracking": l1_l2_capability_tracking,
            "maturity_leading_practices": recommendation_leadingpractices,
        }

        return JSONResponse(status_code=200, content=data)

    except Exception as e:
        # Send the error back as HTTPException
        raise HTTPException(status_code=500, detail=f"Maturity assessment failed: {e}")

# Peer Financial Analysis
@app.get("/financial-analyze", tags=["Financial Analysis"])
async def financial_analyze_kpis(user: dict = Depends(verify_token)):
    """
    Runs the KPI extraction using server-side file mappings.
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    current_context_user(user_details=user)

    try:
        result = generate_kpi_insights_from_blobs()
        # Also generate financial overview Excel

        # Return result
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Financial analysis failed: {e}")
    

# Recomendations horizontal roadmap
@app.get("/recomendation", tags=["Recommendations"])
async def get_recomendation(user: dict = Depends(verify_token)):
    """
    Generate horizontal roadmap recommendations based on processed data.    
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user 
    current_context_user(user_details=user)
    username = user.get("preferred_username", "").split("@")[0]
    try:
        logger.info("Received request for recommendation")
        
        #data = await run_recommendations()
        await run_recommendations()
        logger.info("Recommendation generated successfully")
        directory = f"{TENANT_ID}/{username}/agent_output"
        # Read files
        data = await read_json_file_from_blob("pivot_data_with_hypo_overall_output.json", directory)
        if isinstance(data, list):
            data = {"content": data}
        await run_initiative_roadmap()
        data["roadmap_json"] = await read_json_file_from_blob("pivot_data_with_hypo_roadmap_initiative_matched.json", directory)
        return JSONResponse(content=data, status_code=200)
       
    except Exception as e:
        logger.error(f"Failed to generate recommendation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendation: {e}")
    
# Business Case Calculation Pipeline
@app.get("/business-case", tags=["Business Case"])
async def run_pipeline(user: dict = Depends(verify_token)):
    """
    Trigger the financial/business case calculation pipeline.
    Returns a success message when done.
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    current_context_user(user_details=user)    
    try:
        business_case_calc()
        username = user.get("preferred_username", "").split("@")[0]
        directory = f"{TENANT_ID}/{username}/agent_output"
       
        # Save JSON data to Excel and upload to Blob
        save_business_case_json(
        json_dir=f"{TENANT_ID}/{username}/agent_output",
        output_json_path=f"{TENANT_ID}/{username}/agent_output/business_case_summary.json"
        )

        # Step 2: Convert that JSON to Excel
        business_case_json_to_excel(
            json_path=f"{TENANT_ID}/{username}/agent_output/business_case_summary.json",
            output_excel_path=f"{TENANT_ID}/{username}/agent_output/business_case_summary.xlsx"
        )
        # NPV Calculation and get frames
        print("Running NPV calculation...")
        #npv_data = run_npv_main()
        print("NPV calculation completed.")
        # data["npv_data"] = npv_data
        # business case summary
        print("Reading business case summary...")
        data = await read_json_file_from_blob("business_case_summary.json", directory)
        print("Business case summary read successfully.")
        # Financial Peers PPTX
        print("Generating financial peers PPTX...")
        run_financial_peers_pptx()
        print("Financial peers PPTX generated.")
        # Run business case JSON consolidation for PPT
        print("Generating business case JSON for PPT...")
        #run_business_case_json_for_ppt()
        print("Business case JSON for PPT generated.")
        
        # Convert frames to JSON serializable format
        return JSONResponse(status_code=200, content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Business case pipeline failed: {e}")

# # Executive Summary
@app.get("/executive-summary", tags=["Executive Summary"])
async def get_excutive_summary(user: dict = Depends(verify_token)):
    """ 
    Generate executive summary based on processed data.
    """
    if isinstance(user, RedirectResponse):
        # not logged in, redirect to login
        return user
    current_context_user(user_details=user)
    try:
        data  = await run_executive_summary()
        return JSONResponse(status_code=200, content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate executive summary: {e}")

# ---------------- Start of API Endpoints for PPT generation ----------------
@app.get("/generate-ppt/download", tags=["PPT Generation"])
def generate_ppt_download(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        return user
    current_context_user(user_details=user)
    # Run initiative roadmap to ensure data is ready
    run_financial_overview_excel()
    # Generate PPT and get bytes
    ppt_bytes = generate_ppt_pipeline(return_bytes=True)

    return StreamingResponse(
        io.BytesIO(ppt_bytes),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": "attachment; filename=Acombined_output.pptx"}
    )

@app.get("/generate-ppt/blob", tags=["PPT Generation"])
def generate_ppt_blob(user: dict = Depends(verify_token)):
    if isinstance(user, RedirectResponse):
        return user
    current_context_user(user_details=user)

    blob_path = generate_ppt_pipeline(return_bytes=False)
    return {"blob_path": blob_path}

@app.post("/upload-ppt/", tags=["PPT Generation"])
async def upload_ppt(user: dict = Depends(verify_token), file: UploadFile = File(...)):
    if isinstance(user, RedirectResponse):
        return user
    current_context_user(user_details=user)

    if not file.filename.lower().endswith((".ppt", ".pptx")):
        raise HTTPException(status_code=400, detail="Only .ppt or .pptx files are allowed")

    # timestamp like 20241218_121830
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base, ext = os.path.splitext(file.filename)
    unique_name = f"{base}_{ts}{ext}"
    #print("Unique filename generated:", unique_name)
    blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)

    directory = f"{TENANT_ID}/static_files/additional_context"
    blob_path = f"{directory}/{unique_name}"

    try:
        async with blob_service_client:
            await upload_to_azure_blob(
                file=file,
                container_client=container_client,
                directory=directory,
                blob_name=unique_name,   # make sure your helper uses this
            )

        await process_additional_ppts(directory)

        return JSONResponse(
            status_code=200,
            content={
                "original_filename": file.filename,
                "stored_filename": unique_name,
                "uploaded_path": blob_path,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Validation, upload, processing, or deletion failed: {e}",
        )
    

# ---------------------------------Start of API Endpoints for Chatbot ---------------------------------

@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat_with_bot(
    user: dict = Depends(verify_token),
    payload: ChatRequest = Body(...),
):
    if isinstance(user, RedirectResponse):
        return user
    
    current_context_user(user_details=user)
    user_id = user.get("preferred_username", "").split("@")[0]

    table_name = os.getenv("CHECK_TABLE_NAME", "facts_table")
    try:
        exists = await user_data_exists(table_name, user_id)
        if exists:
            print(f"\n✅ Data exists for user '{user_id}' in table '{table_name}'\n")
        else:
            print(f"\n❌ No data for user '{user_id}' in table '{table_name}'\n")
            print("Embedding user data... Please wait. ")
            await orchestrator_embedding(user_id)

    except Exception as e:
        logger.exception("Error checking or embedding user data")
        raise HTTPException(
            status_code=500,
            detail=f"Error checking or embedding user data: {str(e)}",
        )   

    try:
        return await orchestrate_turn(
            user_id=user_id,
            user_message=payload.user_message,
            thread_id=payload.thread_id,
            tenant_id=TENANT_ID,
        )
 
    except Exception as e:
        logger.exception("Chat processing failed")
        raise HTTPException(
            status_code=500,
            detail=f"Error in chat processing: {str(e)}",
        )

# Chat History Endpoints

@app.get("/chat/history/threads", tags=["Chat History"])
async def list_chat_threads(
    user: dict = Depends(verify_token),
    limit: int = Query(default=20, le=100, description="Max threads to return"),
):
    """
    Returns a list of all distinct conversation threads for the authenticated user,
    each with its latest message preview and timestamp.
    """
    if isinstance(user, RedirectResponse):
        return user

    current_context_user(user_details=user)
    user_id = user.get("preferred_username", "").split("@")[0]

    try:
        manager = await get_chat_history_manager()

        async with manager._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (thread_id)
                    thread_id::TEXT,
                    role,
                    content,
                    timestamp
                FROM chat_history
                WHERE tenant_id = $1 AND user_id = $2
                ORDER BY thread_id, timestamp DESC
                LIMIT $3
                """,
                TENANT_ID, user_id, limit,
            )

        # threads = [
        #     {
        #         "thread_id": str(r["thread_id"]),
        #         "last_role": r["role"],
        #         "last_message": r["content"][:120] + "..." if len(r["content"]) > 120 else r["content"],
        #         "last_updated": r["timestamp"].isoformat(),
        #     }
        #     for r in rows
        # ]
        threads = [
                {
                    "thread_id": str(r["thread_id"]),
                    "last_role": r["role"],
                    "last_message": (lambda c: c[:120] + "..." if len(c) > 120 else c)(r["content"] or ""),
                    "last_updated": r["timestamp"].isoformat(),
                }
                for r in rows
        ]

        # Sort by most recent activity
        threads.sort(key=lambda x: x["last_updated"], reverse=True)

        return JSONResponse(
            status_code=200,
            content={"user_id": user_id, "threads": threads, "count": len(threads)},
        )

    except Exception as e:
        logger.exception("Failed to fetch chat threads")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat threads: {str(e)}")

@app.get("/chat/history/{thread_id}", tags=["Chat History"])
async def get_thread_history(
    thread_id: str,
    user: dict = Depends(verify_token),
    last_n: int = Query(default=50, le=200, description="Return last N messages"),
):
    """
    Returns full message history for a specific thread.
    Messages are returned in chronological order (oldest → newest).
    """
    if isinstance(user, RedirectResponse):
        return user

    current_context_user(user_details=user)
    user_id = user.get("preferred_username", "").split("@")[0]

    try:
        manager = await get_chat_history_manager()

        messages = await manager.get_history(
            tenant_id=TENANT_ID,
            user_id=user_id,
            thread_id=thread_id,
            last_n=last_n,
        )

        if not messages:
            raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

        return JSONResponse(
            status_code=200,
            content={
                "user_id": user_id,
                "thread_id": thread_id,
                "messages": messages,
                "count": len(messages),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fetch thread history")
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread history: {str(e)}")

@app.delete("/chat/history/{thread_id}", tags=["Chat History"])
async def delete_thread(
    thread_id: str,
    user: dict = Depends(verify_token),
):
    """
    Deletes all messages in a specific thread for the authenticated user.
    Other users' threads are never affected.
    """
    if isinstance(user, RedirectResponse):
        return user

    current_context_user(user_details=user)
    user_id = user.get("preferred_username", "").split("@")[0]

    try:
        manager = await get_chat_history_manager()

        # Check thread exists before deleting
        history = await manager.get_history(
            tenant_id=TENANT_ID,
            user_id=user_id,
            thread_id=thread_id,
            last_n=1,
        )
        if not history:
            raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

        await manager.clear_thread(
            tenant_id=TENANT_ID,
            user_id=user_id,
            thread_id=thread_id,
        )

        return JSONResponse(
            status_code=200,
            content={"message": f"Thread '{thread_id}' deleted successfully"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete thread")
        raise HTTPException(status_code=500, detail=f"Failed to delete thread: {str(e)}")

@app.delete("/chat/history", tags=["Chat History"])
async def delete_all_threads(
    user: dict = Depends(verify_token),
):
    """
    Deletes ALL conversation history for the authenticated user across all threads.
    """
    if isinstance(user, RedirectResponse):
        return user

    current_context_user(user_details=user)
    user_id = user.get("preferred_username", "").split("@")[0]

    try:
        manager = await get_chat_history_manager()

        async with manager._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM chat_history WHERE tenant_id = $1 AND user_id = $2",
                TENANT_ID, user_id,
            )

        deleted_count = int(result.split(" ")[-1])  # "DELETE 42" → 42

        return JSONResponse(
            status_code=200,
            content={
                "message": "All chat history deleted",
                "deleted_messages": deleted_count,
            },
        )

    except Exception as e:
        logger.exception("Failed to delete all chat history")
        raise HTTPException(status_code=500, detail=f"Failed to delete all history: {str(e)}")




# ====================== Monitoring & Traceability Endpoints ======================

@app.get("/monitor/stats", tags=["Monitoring"])
async def monitor_stats():
    """Aggregate stats over recent LLM calls (in-memory ring buffer)."""
    return get_summary_stats()

@app.get("/monitor/calls", tags=["Monitoring"])
async def monitor_calls(n: int = Query(default=50, le=500)):
    """Return the *n* most recent LLM call trace records."""
    return get_recent_calls(n)

@app.get("/monitor/traces", tags=["Monitoring"])
async def monitor_traces(n: int = Query(default=50, le=200)):
    """Return the *n* most recent pipeline trace records."""
    return get_recent_traces(n)

@app.get("/monitor/traces/stats", tags=["Monitoring"])
async def monitor_trace_stats():
    """Aggregate stats over pipeline traces."""
    return get_trace_stats()

@app.get("/monitor/traces/{trace_id}", tags=["Monitoring"])
async def monitor_trace_detail(trace_id: str):
    """Return a single pipeline trace with linked LLM calls."""
    trace = get_trace_by_id(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")
    trace["llm_calls"] = get_llm_calls_for_trace(trace_id)
    return trace

@app.get("/monitor/errors", tags=["Monitoring"])
async def monitor_errors(n: int = Query(default=50, le=500)):
    """Return the most recent failed LLM calls."""
    return get_error_log(n)

@app.get("/monitor/models", tags=["Monitoring"])
async def monitor_models():
    """Per-model usage breakdown."""
    return get_model_breakdown()

@app.get("/monitor", response_class=HTMLResponse, tags=["Monitoring"])
async def monitor_dashboard():
    """Self-contained HTML monitoring dashboard for LLM calls & pipeline traces."""
    return _DASHBOARD_HTML

--

// src/hooks/useChat.js
import { useState, useCallback, useEffect } from "react";
import {
  useGetChatThreadsQuery,
  useDeleteChatThreadMutation,
  useSendChatMessageMutation,
  kpiApi,
} from "../services/kpiApi";
import { useDispatch } from "react-redux";

const useChat = (user) => {
  const dispatch = useDispatch();
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [conversationsByThread, setConversationsByThread] = useState({});
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // ── 1. Fetch all threads on mount ────────────────────────────
  const { data: threadsMap, isLoading: threadsLoading } =
    useGetChatThreadsQuery(undefined, { skip: !user });

  // ── 2. Prefetch titles for ALL threads on load ───────────────
  useEffect(() => {
    if (!threadsMap) return;

    const prefetchAllTitles = async () => {
      const allThreads = Object.values(threadsMap);

      // ✅ Run all prefetches in parallel — no limit
      const results = await Promise.allSettled(
        allThreads.map(async (thread) => {
          // Skip if already has a title
          if (thread.title) {
            return { threadId: thread.threadId, title: thread.title };
          }

          try {
            const result = await dispatch(
              kpiApi.endpoints.getChatThreadMessages.initiate(
                thread.threadId,
                { forceRefetch: false } // use cache if available
              )
            );

            if (result.data) {
              // ✅ Find first user message with non-null content
              const firstUserMsg = result.data.find(
                (m) =>
                  m.role === "user" &&
                  m.content &&
                  m.content !== "null" &&
                  m.content.trim() !== ""
              );

              return {
                threadId: thread.threadId,
                title: firstUserMsg?.content || null,
              };
            }
          } catch (e) {
            // silently ignore
          }
          return { threadId: thread.threadId, title: null };
        })
      );

      // Build updated map with all titles
      const updatedMap = { ...threadsMap };
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.title) {
          const { threadId: tId, title } = result.value;
          updatedMap[tId] = {
            ...updatedMap[tId],
            title,
          };
        }
      });

      setConversationsByThread(updatedMap);
    };

    prefetchAllTitles();
  }, [threadsMap, dispatch]);

  // ── 3. Normalize raw backend messages ────────────────────────
  const normalizeMessages = useCallback((rawMessages) => {
    return (rawMessages || [])
      .filter((msg) => msg?.role !== "system")
      .map((msg) => {
        const role = msg?.role || "assistant";
        const metadata = msg?.metadata || {};
        const assistantResponse = metadata?.assistant_response || {};
        const chartSpec = assistantResponse?.chart_spec || {};

        let parsedContent = msg?.content;
        let chartData = null;
        let chartType = null;

        // ✅ Handle null content from backend
        if (parsedContent === null || parsedContent === "null") {
          parsedContent = "";
        }

        // ✅ Detect JSON chart payloads stored as strings
        if (typeof parsedContent === "string") {
          const trimmed = parsedContent.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.weekly_trends || parsed.monthly_trends) {
                chartData = parsed;
                chartType = "line";
                parsedContent = "Here is the trendline chart:";
              } else if (Array.isArray(parsed)) {
                chartData = parsed;
                chartType = "bar";
                parsedContent = "Here is the chart:";
              }
            } catch (e) {
              // not JSON, keep as text
            }
          }
        }

        // Handle financial_chart type
        if (!chartData && assistantResponse?.type === "financial_chart") {
          chartData = Array.isArray(assistantResponse?.data)
            ? assistantResponse.data
            : assistantResponse?.data || null;
          chartType = chartSpec?.chart_type || "bar";
        }

        const finalMessage =
          typeof parsedContent === "string"
            ? parsedContent.trim()
            : parsedContent != null
            ? String(parsedContent).trim()
            : "";

        return {
          from: role === "user" ? "user" : "bot",
          message: finalMessage,
          timestamp: msg?.timestamp,
          chartData,
          chartType,
          state: metadata?.state || null,
        };
      })
      .filter((msg) => !!msg.message || !!msg.chartData);
  }, []);

  // ── 4. RTK mutations ──────────────────────────────────────────
  const [sendChatMessageMutation, { isLoading: sendLoading }] =
    useSendChatMessageMutation();
  const [deleteChatThreadMutation] = useDeleteChatThreadMutation();

  // ── 5. Send a message ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      setChatHistory((prev) => [...prev, { from: "user", message }]);
      setError(null);

      try {
        const data = await sendChatMessageMutation({
          message,
          threadId,
        }).unwrap();

        const effectiveThreadId = data.thread_id || threadId || "temp_id";

        const rawResponse = data.assistant_response;
        let textForMarkdown = "I have generated the analysis below:";
        let chartDataForRenderer = null;
        let finalChartType = data.state?.chart_intent?.chart_type || "bar";

        if (rawResponse?.type === "financial_text") {
          textForMarkdown = [rawResponse.insight, rawResponse.key_takeaway]
            .filter(Boolean)
            .join("\n\n");
          chartDataForRenderer = null;
          finalChartType = null;
        } else if (rawResponse?.type === "financial_chart") {
          finalChartType = rawResponse.chart_spec?.chart_type || finalChartType;
          chartDataForRenderer = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : [];
          textForMarkdown = [
            rawResponse.chart_spec?.title,
            rawResponse.chart_spec?.description,
          ]
            .filter(Boolean)
            .join("\n\n");
        } else if (typeof rawResponse === "string") {
          textForMarkdown = rawResponse;
        } else if (Array.isArray(rawResponse)) {
          chartDataForRenderer = rawResponse;
        } else if (rawResponse && typeof rawResponse === "object") {
          chartDataForRenderer = rawResponse;
        }

        const botMessage = {
          from: "bot",
          message: textForMarkdown,
          chartData: chartDataForRenderer,
          chartType: finalChartType,
          timestamp: data.timestamp,
          state: data.state,
        };

        setChatHistory((prev) => {
          const filtered = prev.filter(
            (m, i) => !(m.from === "user" && i === prev.length - 1)
          );
          return [...filtered, { from: "user", message }, botMessage];
        });

        if (effectiveThreadId !== threadId) {
          setThreadId(effectiveThreadId);
        }

        setConversationsByThread((prev) => {
          const existing = prev[effectiveThreadId];
          return {
            ...prev,
            [effectiveThreadId]: {
              threadId: effectiveThreadId,
              title: existing?.title || message,
              createdAt: existing?.createdAt || data.timestamp,
              lastMessageAt: data.timestamp,
              messages: [
                ...(existing?.messages || []),
                { from: "user", message },
                botMessage,
              ],
            },
          };
        });
      } catch (err) {
        setError(
          err?.data?.detail || err.message || "An unexpected error occurred."
        );
        setChatHistory((prev) => prev.slice(0, -1));
      }
    },
    [sendChatMessageMutation, threadId]
  );

  // ── 6. Load thread on click ───────────────────────────────────
  const loadThreadHistory = useCallback(
    async (tId) => {
      if (tId === threadId) return;

      setChatHistory([]);
      setThreadId(tId);
      setIsLoadingThread(true);
      setError(null);

      const existing = conversationsByThread[tId];
      if (existing?.messages?.length > 0) {
        setChatHistory(existing.messages);
        setIsLoadingThread(false);
        return;
      }

      try {
        const result = await dispatch(
          kpiApi.endpoints.getChatThreadMessages.initiate(tId, {
            forceRefetch: true,
          })
        );

        if (result.data) {
          const normalized = normalizeMessages(result.data);
          setChatHistory(normalized);

          // ✅ Also update title from fetched messages
          const firstUserMsg = result.data.find(
            (m) =>
              m.role === "user" &&
              m.content &&
              m.content !== "null" &&
              m.content.trim() !== ""
          );

          setConversationsByThread((prev) => ({
            ...prev,
            [tId]: {
              ...prev[tId],
              title:
                prev[tId]?.title || firstUserMsg?.content || prev[tId]?.title,
              messages: normalized,
            },
          }));
        } else {
          setChatHistory([]);
        }
      } catch (err) {
        setError("Failed to load conversation.");
        setChatHistory([]);
      } finally {
        setIsLoadingThread(false);
      }
    },
    [conversationsByThread, threadId, dispatch, normalizeMessages]
  );

  // ── 7. Delete a thread ────────────────────────────────────────
  const removeThread = useCallback(
    async (tId) => {
      try {
        await deleteChatThreadMutation(tId).unwrap();
        setConversationsByThread((prev) => {
          const updated = { ...prev };
          delete updated[tId];
          return updated;
        });
        if (tId === threadId) {
          setChatHistory([]);
          setThreadId(null);
        }
      } catch (err) {
        setError("Failed to delete thread.");
      }
    },
    [deleteChatThreadMutation, threadId]
  );

  // ── 8. New chat ───────────────────────────────────────────────
  const clearChat = useCallback(() => {
    setChatHistory([]);
    setThreadId(null);
  }, []);

  return {
    chatHistory,
    loading: sendLoading || isLoadingThread,
    threadsLoading,
    error,
    sendMessage,
    clearChat,
    threadId,
    setThreadId,
    conversationsByThread,
    loadThreadHistory,
    removeThread,
  };
};

export default useChat;
---

/* eslint-disable no-console */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { REHYDRATE } from "redux-persist";

// --------------------------
// TOKEN HANDLER (MSAL Integration)
// --------------------------
let globalGetAccessToken = null;

export const setTokenGetter = (getAccessToken) => {
  globalGetAccessToken = getAccessToken;
};

// --------------------------
// BASE QUERY WITH AUTH
// --------------------------
const baseQueryWithAuth = async (args, api, extraOptions) => {
  let token = "";

  try {
    if (typeof globalGetAccessToken === "function") {
      token = await globalGetAccessToken();
    } else {
      console.warn(
        "⚠️ No token getter function registered. Call setTokenGetter() inside useUser()"
      );
    }
  } catch (err) {
    console.error("❌ Failed to fetch token from MSAL:", err);
  }

  const baseQuery = fetchBaseQuery({
    baseUrl: process.env.REACT_APP_API_URL,
    credentials: "include",
    prepareHeaders: (headers) => {
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  });

  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    console.warn("🔄 Token might be invalid, attempting refresh...");
    try {
      const refreshedToken = await globalGetAccessToken();
      if (refreshedToken) {
        const retryBaseQuery = fetchBaseQuery({
          baseUrl: process.env.REACT_APP_API_URL,
          credentials: "include",
          prepareHeaders: (headers) => {
            headers.set("Authorization", `Bearer ${refreshedToken}`);
            headers.set("Content-Type", "application/json");
            return headers;
          },
        });
        result = await retryBaseQuery(args, api, extraOptions);
      } else {
        console.error("❌ Token refresh failed: still missing");
      }
    } catch (refreshError) {
      console.error("❌ Token refresh attempt failed:", refreshError);
    }
  }

  return result;
};

// --------------------------
// CREATE KPI API SERVICE
// --------------------------
export const kpiApi = createApi({
  reducerPath: "kpiApi",
  baseQuery: baseQueryWithAuth,
  keepUnusedDataFor: 86400,
  refetchOnMountOrArgChange: false,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  tagTypes: [
    "KPIData",
    "KPIBenchmarking",
    "MaturityData",
    "MaturityAssessmentData",
    "PeerFinancial",
    "Recommendations",
    "BusinessCase",
    "TrendlineData",
    "HeatmapData",
    "Files",
    "Months",
    "Channels",
    "ProductH1s",
    "BrandH2s",
    "Waterfall",
    "FinancialAnalysis",
    "ExecutiveSummary",
    "KpiDropdown",
    "ChatHistory",
  ],
  endpoints: (build) => ({
    uploadFile: build.mutation({
      query: (formData) => ({
        url: "/validate-and-summarize/",
        method: "POST",
        body: formData,
        credentials: "include",
      }),
      invalidatesTags: [
        { type: "Files" },
        { type: "KPIData" },
        { type: "HeatmapData" },
        { type: "Waterfall" },
        { type: "TrendlineData" },
        { type: "BusinessCase" },
        { type: "Recommendations" },
        { type: "ExecutiveSummary" },
      ],
    }),

    getKpiCalculation: build.query({
      query: ({ month, channel, productH1, brandH2 } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi-calculation${suffix}`;
      },
      providesTags: ["KPIData", "HeatmapData"],
      transformResponse: (resp) => {
        const heatmap = resp?.heatmap_json || {};
        return {
          raw: resp,
          heatmap,
        };
      },
      transformErrorResponse: (response) => {
        console.error("❌ KPI Calculation API Error:", response);
        return response;
      },
    }),

    getKpiWaterfallData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
        });
        return `/kpi/waterfall/data?${q.toString()}`;
      },
      providesTags: ["Waterfall"],
      transformResponse: (resp) => (Array.isArray(resp) ? resp : []),
      transformErrorResponse: (response) => {
        console.error("❌ KPI Waterfall API Error:", response);
        return response;
      },
    }),

    getKpiTrendlineData: build.query({
      query: ({ month, channel, productH1, brandH2 }) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("month", val);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("channel", val);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("product_h1", val);
        });
        (Array.isArray(brandH2) ? brandH2 : [brandH2]).forEach((val) => {
          if (val && val !== "Overall" && val !== "All") q.append("brand_h2", val);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/trandline/data${suffix}`;
      },
      providesTags: ["TrendlineData"],
      transformResponse: (resp) => {
        const weekly = Array.isArray(resp?.weekly_trends) ? resp.weekly_trends : [];
        const monthly = Array.isArray(resp?.monthly_trends) ? resp.monthly_trends : [];
        const metadata = resp?.metadata || null;
        return {
          weekly,
          monthly,
          metadata,
        };
      },
      transformErrorResponse: (response) => {
        console.error("❌ KPI Trendline API Error:", response);
        return response;
      },
    }),

    getKpiMonths: build.query({
      query: () => "/kpi/dropdown/month",
      providesTags: ["Months"],
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
    }),

    getKpiChannels: build.query({
      query: ({ month } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/channel${suffix}`;
      },
      providesTags: ["Channels"],
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
    }),

    getKpiProductH1s: build.query({
      query: ({ month, channel } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") q.append("channel", c);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/product_h1${suffix}`;
      },
      providesTags: ["ProductH1s"],
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
    }),

    getKpiBrandH2s: build.query({
      query: ({ month, channel, productH1 } = {}) => {
        const q = new URLSearchParams();
        (Array.isArray(month) ? month : [month]).forEach((m) => {
          if (m && m !== "Overall" && m !== "All") q.append("month", m);
        });
        (Array.isArray(channel) ? channel : [channel]).forEach((c) => {
          if (c && c !== "Overall" && c !== "All") q.append("channel", c);
        });
        (Array.isArray(productH1) ? productH1 : [productH1]).forEach((p) => {
          if (p && p !== "Overall" && p !== "All") q.append("product_h1", p);
        });
        const suffix = q.toString() ? `?${q.toString()}` : "";
        return `/kpi/dropdown/brand_h2${suffix}`;
      },
      providesTags: ["BrandH2s"],
      transformResponse: (resp) => (Array.isArray(resp?.options) ? resp.options : []),
    }),

    getKPIBenchmarkingOne: build.query({
      query: () => "/screen1-benchmarking",
      providesTags: ["KPIBenchmarking"],
      transformResponse: (response) => response,
    }),

    getKpiDropdown: build.query({
      query: () => "/screen2-kpi-dropdown",
      providesTags: ["KpiDropdown"],
      transformResponse: (response) => response,
      transformErrorResponse: (response) => {
        console.error("❌ KPI Dropdown API Error:", response);
        return response;
      },
    }),

    getKPIBenchmarkingTwo: build.query({
      query: (payload) => ({
        url: "/screen2-benchmarking",
        method: "POST",
        body: payload,
      }),
      providesTags: ["KPIBenchmarking"],
      transformResponse: (raw) => {
        if (!raw || typeof raw !== "object") {
          return {
            "KPI Payload": [],
            "Dropdown Structure": {},
            "Overall Insight": "",
          };
        }

        const kpiPayload =
          raw["KPI Payload"] ||
          raw.screen2_data?.["KPI Payload"] ||
          raw.kpi_payload ||
          [];

        const dropdownStructure =
          raw["Dropdown Structure"] ||
          raw.structure_data ||
          raw.screen2_data?.["Dropdown Structure"] ||
          {};

        const overallInsight =
          raw["Overall Insight"] ||
          raw.screen2_data?.["Overall Insight"] ||
          "";

        return {
          "KPI Payload": Array.isArray(kpiPayload) ? kpiPayload : [],
          "Dropdown Structure": dropdownStructure,
          "Overall Insight": overallInsight,
        };
      },
    }),

    getMaturityAssessment: build.query({
      query: () => "/maturity-assessment",
      providesTags: ["MaturityAssessmentData"],
      transformResponse: (rawResponse) => {
        if (!rawResponse || typeof rawResponse !== "object") {
          return {
            l1CapabilityTracking: null,
            l1l2CapabilityTracking: null,
            recommendations: [],
          };
        }

        return {
          l1CapabilityTracking: rawResponse.l1_capability_tracking ?? null,
          l1l2CapabilityTracking: rawResponse.l1_l2_capability_tracking ?? null,
          recommendations: Array.isArray(rawResponse.maturity_leading_practices)
            ? rawResponse.maturity_leading_practices
            : [],
        };
      },
    }),

    getFinancialAnalysis: build.query({
      query: () => "/financial-analyze",
      providesTags: [{ type: "FinancialAnalysis", id: "SINGLE" }],
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
      transformResponse: (raw) => ({
        data: raw?.data ?? null,
        insights: raw?.insights ?? [],
      }),
    }),

    getRecommendations: build.query({
      query: () => "/recomendation",
      providesTags: ["Recommendations"],
      transformResponse: (json) => {
        const arr = Array.isArray(json.roadmap_json)
          ? json.roadmap_json
          : Array.isArray(json.content)
            ? json.content
            : [];
        const recommendations = [];
        Object.entries(arr).forEach(([_, content]) => {
          if (typeof content === "object" && content !== null) {
            [
              "Short-term Recommendation",
              "Mid-term Recommendation",
              "Long-term Recommendation",
            ].forEach((term) => {
              if (content[term]) {
                const recs = Array.isArray(content[term])
                  ? content[term]
                  : content[term]
                    .split(/\n|,/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                recs.forEach((text) => {
                  recommendations.push({
                    category: content["Assessment"],
                    term,
                    text,
                    "Level 1 Category": content["Level 1 Category"],
                    Enhancedhypothesis: content["Enhanced_hypothesis"],
                  });
                });
              }
            });
          }
        });

        return {
          recommendations,
          roadmap_json: json.roadmap_json || null,
          raw: json,
        };
      },
    }),

    getBusinessCase: build.query({
      query: () => "/business-case",
      providesTags: ["BusinessCase"],
      transformResponse: (result) => result,
    }),

    getExecutiveSummary: build.query({
      query: () => "/executive-summary",
      providesTags: ["ExecutiveSummary"],
      transformResponse: (json) => json ?? null,
    }),

    downloadPpt: build.mutation({
      query: () => ({
        url: "/generate-ppt/download",
        method: "GET",
        responseHandler: async (response) => {
          const blob = await response.blob();

          let fileName = "SC Rapid Diagnostic Assessment Report.pptx";

          const disposition = response.headers.get("Content-Disposition");
          if (disposition && disposition.includes("filename=")) {
            fileName = disposition.split("filename=")[1].replace(/"/g, "");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          return { success: true };
        },
        cache: "no-cache",
      }),
    }),

    uploadPpt: build.mutation({
      query: (formData) => ({
        url: "/upload-ppt/",
        method: "POST",
        body: formData,
        credentials: "include",
      }),
      invalidatesTags: [
        "ExecutiveSummary",
        "Recommendations",
        "BusinessCase",
        "FinancialAnalysis",
      ],
    }),

// Replace getChatThreads endpoint
getChatThreads: build.query({
  query: () => "/chat/history/threads",
  providesTags: ["ChatHistory"],
  transformResponse: (resp) => {
    const threadsMap = {};
    (resp?.threads || []).forEach((t) => {
      threadsMap[t.thread_id] = {
        threadId: t.thread_id,
        // ✅ Backend thread list response — try every possible title field
        title:
          t.title ||
          t.first_message ||
          t.preview ||
          t.summary ||
          t.name ||
          null, // null = needs to be loaded
        createdAt: t.created_at,
        lastMessageAt: t.last_message_at,
        messages: [],
      };
    });
    return threadsMap;
  },
}),

    // ── GET messages of a specific thread ───────────────────────
    getChatThreadMessages: build.query({
      query: (threadId) => `/chat/history/${threadId}`,
      providesTags: (result, error, threadId) => [
        { type: "ChatHistory", id: threadId },
      ],
      transformResponse: (resp) => resp?.messages || [],
      transformErrorResponse: (response) => {
        console.error("❌ Chat Thread Messages API Error:", response);
        return response;
      },
    }),

    // ── DELETE a specific thread ─────────────────────────────────
    deleteChatThread: build.mutation({
      query: (threadId) => ({
        url: `/chat/history/${threadId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        console.error("❌ Delete Chat Thread API Error:", response);
        return response;
      },
    }),

    // ── POST send a chat message ─────────────────────────────────
    sendChatMessage: build.mutation({
      query: ({ message, threadId }) => ({
        url: "/chat",
        method: "POST",
        body: {
          user_message: message,
          thread_id: threadId || undefined,
        },
      }),
      invalidatesTags: ["ChatHistory"],
      transformErrorResponse: (response) => {
        console.error("❌ Send Chat Message API Error:", response);
        return response;
      },
    }),

  }),
  extractRehydrationInfo(action, { reducerPath }) {
    if (action.type === REHYDRATE) {
      return action.payload?.[reducerPath] ?? undefined;
    }
    return undefined;
  },
});

// --------------------------
// EXPORT HOOKS
// --------------------------
export const {
  useUploadFileMutation,
  useGetKpiCalculationQuery,
  useGetKpiWaterfallDataQuery,
  useGetKpiTrendlineDataQuery,
  useGetKpiMonthsQuery,
  useGetKpiChannelsQuery,
  useGetKpiProductH1sQuery,
  useGetKpiBrandH2sQuery,
  useGetKPIBenchmarkingOneQuery,
  useGetKPIBenchmarkingTwoQuery,
  useGetMaturityAssessmentQuery,
  useGetFinancialAnalysisQuery,
  useGetRecommendationsQuery,
  useGetBusinessCaseQuery,
  useGetExecutiveSummaryQuery,
  useDownloadPptMutation,
  useUploadPptMutation,
  useGetKpiDropdownQuery,
  useGetChatThreadsQuery,
  useGetChatThreadMessagesQuery,
  useDeleteChatThreadMutation,
  useSendChatMessageMutation,
} = kpiApi;

