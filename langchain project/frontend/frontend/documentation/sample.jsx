import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import MethodOneVirtualAssistant from "../components/chatbot/MethodOneVirtualAssistant";
import AssistantTabScreen from "../components/chatbot/AssistantTabScreen";
import "../assets/css/VirtualAssistantProvider.css";

const VirtualAssistantProvider = ({ children }) => {
  const [isVirtualAssistantVisible, setIsVirtualAssistantVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const location = useLocation();

  // Floating Button always shown, unless you want to block it in special routes
  const showFloatingButton = !location.pathname.startsWith("/assistant/");

  // --- Drag Button Logic ---
  const [position, setPosition] = useState({
    top: window.innerHeight - 262,
    left: window.innerWidth - 182,
  });
  const draggingRef = useRef(false);
  const wasDragged = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const buttonRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    draggingRef.current = true;
    wasDragged.current = false;
    const rect = buttonRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    wasDragged.current = true;
    let newLeft = e.clientX - dragOffset.current.x;
    let newTop = e.clientY - dragOffset.current.y;
    const btnWidth = buttonRef.current.offsetWidth;
    const btnHeight = buttonRef.current.offsetHeight;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    
    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft + btnWidth > winWidth) newLeft = winWidth - btnWidth;
    if (newTop + btnHeight > winHeight) newTop = winHeight - btnHeight;
    
    setPosition({ left: newLeft, top: newTop });
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false; // ✅ Fixed: was 'stable'
  }, []);

  // Floating button handler - defined first for dependency
  const handleOpenSmallChatbot = useCallback(() => {
    setIsVirtualAssistantVisible(true);
    setIsModalOpen(false);
  }, []);

  // Click handler to prevent opening if dragged
  const handleClick = useCallback((e) => {
    if (wasDragged.current) {
      wasDragged.current = false;
      e.preventDefault();
      return;
    }
    handleOpenSmallChatbot();
  }, [handleOpenSmallChatbot]); // ✅ Fixed: Added dependency

  // New effect to minimize on route change
  useEffect(() => {
    setIsVirtualAssistantVisible(false);
    setPosition({
      top: window.innerHeight - 262,
      left: window.innerWidth - 182,
    });
  }, [location.pathname]);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Modal close handler - RESTORE: show small chatbot
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setIsVirtualAssistantVisible(true);
  }, []);

  // Small bot maximize handler
  const handleMaximize = useCallback(() => {
    setIsModalOpen(true);
    setIsVirtualAssistantVisible(false);
  }, []);

  return (
    <>
      {children}
      {/* Floating Button (Small Chatbot Trigger) */}
      {showFloatingButton && !isVirtualAssistantVisible && !isModalOpen && (
        <div
          ref={buttonRef}
          className="virtual-assistant-button-container"
          style={{
            left: position.left,
            top: position.top,
            position: "fixed",
            zIndex: 1300,
          }}
          onMouseDown={onMouseDown}
          onClick={handleClick}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="virtual-assistant-center-stack">
            <img
              src="/chatbot.png"
              alt="Open Virtual Assistant"
              className="virtual-assistant-image-button"
            />
            <span className="virtual-assistant-label">
              Rapid Supply Chain
              <br />
              Diagnostics
              <br />
              Assistance
            </span>
          </div>
        </div>
      )}
      {/* Small Chatbot */}
      {isVirtualAssistantVisible && !isModalOpen && (
        <div
          className="virtual-assistant-chat-box"
          style={{
            borderRadius: 18,
            boxShadow: "0 4px 18px rgba(3, 3, 3, 0.12)",
            width: 400,
            height: "auto",
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 1300,
          }}
        >
          <div className="chat-box-header">
            <span className="material-symbols-outlined fs-4">robot_2</span>
            <span className="header-title">
              Rapid Supply Chain Diagnostic Assistant
            </span>
            <div className="header-actions header-actions-virtual">
              <button
                aria-label="Maximize"
                className="maximize-button"
                onClick={handleMaximize}
              >
                <span className="material-symbols-outlined fs-5">fullscreen</span>
              </button>
              <button
                className="close-button fs-3 mb-0"
                onClick={() => setIsVirtualAssistantVisible(false)}
                aria-label="Close Chat"
              >
                ×
              </button>
            </div>
          </div>
          <div className="chat-box-content">
            <MethodOneVirtualAssistant
              isOpen
              isCompact
              onClose={() => setIsVirtualAssistantVisible(false)}
            />
          </div>
        </div>
      )}
      {/* Modal Chatbot (Normal/Fullscreen, with Restore button) */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(30, 24, 60, 0.35)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              maxWidth: "98vw",
              maxHeight: "100vh",
              position: "relative",
            }}
          >
            <AssistantTabScreen
              tabname="guidebook"
              hideStyles
              hideClose={false}
              onClose={handleModalClose}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default VirtualAssistantProvider;

--

/* VirtualAssistantProvider.css */

/* Pulsing animation: scales bigger and smaller infinitely */
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

/* Animation for fade-in + scale effect on initial load */
@keyframes fadeScaleIn {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Updated animation for chat box: slide-in with size increase to 1.1 then decrease to 1 */
@keyframes chatBoxSlideIn {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.8);
  }
  50% {
    opacity: 1;
    transform: translateY(0) scale(1.1);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Optional: Add a fade-out animation for the tooltip when it hides (not used now) */
@keyframes fadeOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

.virtual-assistant-button-container {
 position: fixed;
  z-index: 1200; /* was zindex         */
  cursor: pointer;
  user-select: none; /* was userselect       */
  display: flex;
  flex-direction: column;
  align-items: center; /* centres cross-axis   */
  justify-content: center; /* centres main axis */
  /* remove inline-flex duplication */
  text-align: center;
  padding: 0; /* remove any default padding */
}

.virtual-assistant-center-stack {
 display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 140px;        /* fixed stack width */
}

.virtual-assistant-image-button {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  box-shadow: 0 4px 14px rgba(87, 34, 202, 0.15);
  animation: pulse 1.5s ease-in-out infinite;
  background: #fff;
  display: flex;
  object-fit: contain;
  margin-right: 0;
  transform: translateY(3px);   /* <— key visual fix */
}

.virtual-assistant-label {
   width: 100%;           /* use same 140px as stack */
  margin-top: 4px;
  font-weight: 600;
  font-size: 0.98rem;
  text-align: center;
  color: transparent;
  animation: fadeScaleIn 0.8s ease forwards;
  background: linear-gradient(90deg, #7c3aed, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  border-radius: 11px;
}

.virtual-assistant-label.fade-out {
  animation: fadeOut 0.3s ease forwards;
}

.virtual-assistant-chat-box {
  position: fixed;
  right: 24px;
  bottom: 30px;
  width: 360px;
  height: auto;
  max-height: 520px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 6px 28px rgba(87, 34, 202, 0.12);
  z-index: 1250;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: chatBoxSlideIn 0.6s ease-out forwards;
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}

.chat-box-header {
  padding: 9px 17px;
  border-bottom: 1px solid #eceefe;
  background: #7500c0;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
}

.chat-box-header .material-symbols-outlined {
  font-size: 1.5rem; /* Adjust based on 'fs-4' if needed */
}

.header-title {
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
}

.close-button {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 1.4rem;
  cursor: pointer;
  font-weight: 400;
}

.chat-box-content {
  flex: 1;
  overflow: auto;
}

.virtual-assistant-chat-box .header-actions {
  display: flex;
  align-items: center;
  gap: 0; /* No gap between maximize and close */
}

.virtual-assistant-chat-box .maximize-button {
      background: transparent;
    color: white;
    border: none;
    display: flex;
    align-items: center;
}
--

// components/chatbot/MethodOneVirtualAssistant.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import BotLoader from "../common/BotLoader";
import { useUser } from "../usecontext/UserContext";
import { useMsal } from "@azure/msal-react";
import useChat from "../../hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ✅ NEW: GFM plugin for tables [web:22][web:25][web:31]
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

  // ✅ CORRECT - Always call hook, handle null data
  const chatHook = useChat(user, getAccessToken);
  const {
    chatHistory,
    loading,
    error,
    sendMessage,
    clearChat,
    threadId,
    setThreadId,
    conversationsByThread,
    loadThreadHistory,
  } = chatHook || {
    chatHistory: [],
    loading: false,
    error: null,
    sendMessage: async () => {},
    clearChat: () => {},
    threadId: null,
    setThreadId: () => {},
    conversationsByThread: {},
    loadThreadHistory: () => {},
  };
  

  const [input, setInput] = useState(isFullScreen ? "" : initialMsg);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [isCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [closing, setClosing] = useState(false);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  // ✅ CREATE A GUARANTEED DISPLAY NAME
  const displayName =
    user?.name ||
    accounts[0]?.name ||
    accounts[0]?.username ||
    "Guest";

  // ✅ UPDATE INITIALS TO USE DISPLAY NAME
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
            <span className="material-symbols-outlined fs-3">
              analytics
            </span>
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
            <span className="material-symbols-outlined fs-3">
              balance
            </span>
          ),
          label: "Show me the peer financial analysis",
          tab: "peer-financial-analysis",
        },
        {
          icon: (
            <span className="material-symbols-outlined fs-3">
              calculate
            </span>
          ),
          label: "Give the KPI benchmarks for CPG industry",
          tab: "kpi-benchmarking",
        },
      ];
    }
    return [
      {
        icon: (
          <span className="material-symbols-outlined fs-3">event</span>
        ),
        label: "Show the demo video",
      },
      {
        icon: (
          <span className="material-symbols-outlined fs-3">book</span>
        ),
        label: "View the guidebook",
      },
      {
        icon: (
          <span className="material-symbols-outlined fs-3">build</span>
        ),
        label: "Open Workbench",
      },
      {
        icon: (
          <span className="material-symbols-outlined fs-3">home</span>
        ),
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
          "Take me to the business case":
            "/assessment?tab=business-case",
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
    [input, sendMessage, setInput]
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
    if (chatContainerRef.current)
      chatContainerRef.current.scrollTop = 0;
  };

  const handleLoadThread = (tId) => {
    setShowChatSidebar(false);
    setThreadId(tId);
    loadThreadHistory(tId);
  };

  // Auto-send initial message for tab screens
  useEffect(() => {
    if (initialMsg && chatHistory.length === 0 && !isFullScreen) {
      handleSubmit(initialMsg);
    }
  }, [initialMsg, chatHistory.length, isFullScreen, handleSubmit]);

  // Handle global loading vs user loading
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

  return (
    <div
      className="methodone-virtual-assistant-container"
      style={{
        borderRadius: isCompact ? 0 : isMaximized ? 0 : 18,
        boxShadow: isCompact
          ? "none"
          : "0 6px 40px rgba(137,27,247,0.14)",
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
            <span className="material-symbols-outlined fs-3">
              robot_2
            </span>
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
                <span className="material-symbols-outlined fs-4">
                  add
                </span>
                <span style={{ marginLeft: 6 }}>New Chat</span>
              </button>
            </div>
            <div className="sidebar-content">
              {Object.values(conversationsByThread || {})
                .sort((a, b) =>
                  new Date(a?.createdAt || 0) <
                  new Date(b?.createdAt || 0)
                    ? 1
                    : -1
                )
                .map((conv) => (
                  <div
                    key={conv.threadId}
                    className={`sidebar-item${
                      conv.threadId === threadId ? " active" : ""
                    }`}
                    onClick={() => handleLoadThread(conv.threadId)}
                  >
                    <div className="sidebar-item-title">
                      {conv.title && conv.title.length > 50
                        ? `${conv.title.substring(0, 50)}...`
                        : conv.title || conv.threadId}
                    </div>
                  </div>
                ))}
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
          {chatHistory.length === 0 &&
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
          {chatHistory.length === 0 && !isFullScreen && (
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
            {chatHistory.map((c, i) => (
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
                  {/* Text */}
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]} // ✅ ENABLE GFM (tables, etc.) [web:22][web:25][web:31]
                      components={{
                        strong: ({ node, ...props }) => (
                          <strong
                            style={{ fontWeight: 700 }}
                            {...props}
                          />
                        ),
                        p: ({ node, ...props }) => (
                          <p
                            style={{ margin: "0 0 4px 0" }}
                            {...props}
                          />
                        ),
                      }}
                    >
                      {c.message || ""}
                    </ReactMarkdown>
                  </div>

                  {/* FIXED Chart Rendering Condition */}
                  {c.from === "bot" && c.chartData && (Array.isArray(c.chartData) ? c.chartData.length > 0 : Object.keys(c.chartData).length > 0) && (
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
                  onClick={() =>
                    setShowChatSidebar(!showChatSidebar)
                  }
                  title={
                    showChatSidebar ? "Close sidebar" : "Open sidebar"
                  }
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
                    {showChatSidebar
                      ? "left_panel_close"
                      : "view_sidebar"}
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
                <span className="material-symbols-outlined">
                  send
                </span>
              </button>
            </div>
          </div>

          {/* FOOTER */}
          <div className="footer-disclaimer">
            <span>
              AI-generated content. Use at your own discretion.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MethodOneVirtualAssistant;
--

import { useState, useCallback, useEffect, useMemo } from "react";

const API_URL = `${process.env.REACT_APP_API_URL}/chat`;

const useChat = (user, getAccessToken) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [conversationsByThread, setConversationsByThread] = useState({});

  // 1) Build a stable storage key
  const storageKey = useMemo(() => {
    // Gracefully handle if user is passed as an object or a string
    const identifier =
      user?.email ||
      user?.username ||
      user?.name ||
      (typeof user === "string" ? user : null) ||
      "anonymous";
      
    return `conversationsByThread_${identifier}`;
  }, [user]);

  // 2) HYDRATE from localStorage (Runs once per user change)
  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);
      
      // If no data exists for this user, clear the current view safely
      if (!saved) {
        setConversationsByThread({});
        setChatHistory([]);
        setThreadId(null);
        return;
      }

      const parsed = JSON.parse(saved);
      const convObj = parsed || {};
      
      setConversationsByThread(convObj);

      const threads = Object.values(convObj);
      if (threads.length > 0) {
        // Find the most recent thread
        const last = threads
          .slice()
          .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))[0];
        
        if (last?.threadId) {
          setThreadId(last.threadId);
          setChatHistory(last.messages || []);
        }
      } else {
        setChatHistory([]);
        setThreadId(null);
      }
    } catch (e) {

      setError("Failed to load chat history from local storage.");
    }
  }, [storageKey]);

  // Notice: We completely removed the dangerous persistence useEffect!

  // 3) Send a message and explicitly save to local storage
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      // Optimistically add user message to the UI immediately
      setChatHistory((prev) => [...prev, { from: "user", message }]);
      setLoading(true);
      setError(null);

      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const payload = {
          user_message: message,
          thread_id: threadId || undefined,
        };

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        const effectiveThreadId = data.thread_id || threadId || "temp_id";

        const rawResponse = data.assistant_response;
        let textForMarkdown = "I have generated the analysis below:";
        let chartDataForRenderer = null;
        let finalChartType = data.state?.chart_intent?.chart_type || "bar";

        // Handle various backend response shapes
        if (rawResponse && typeof rawResponse === "object" && rawResponse.type === "financial_text") {
          const { insight, key_takeaway } = rawResponse;
          textForMarkdown = [insight, key_takeaway].filter(Boolean).join("\n\n");
          chartDataForRenderer = null;
          finalChartType = null;
        } else if (rawResponse && typeof rawResponse === "object" && rawResponse.type === "financial_chart") {
          const { chart_spec, data: seriesData } = rawResponse;
          if (chart_spec?.chart_type) {
            finalChartType = chart_spec.chart_type;
          }
          chartDataForRenderer = Array.isArray(seriesData) ? seriesData : [];
          if (chart_spec?.title || chart_spec?.description) {
            textForMarkdown = [chart_spec.title, chart_spec.description].filter(Boolean).join("\n\n");
          }
        } else if (typeof rawResponse === "string") {
          textForMarkdown = rawResponse;
        } else if (Array.isArray(rawResponse)) {
          chartDataForRenderer = rawResponse;
        } else if (rawResponse && typeof rawResponse === "object") {
          chartDataForRenderer = rawResponse;
        }

        // Special case: pie chart waterfall fallback
        if (finalChartType === "pie" && !Array.isArray(rawResponse)) {
          setLoading(false);
          const waterfallPayload = {
            user_message: "show me OTIF breakdown waterfall chart",
            thread_id: effectiveThreadId,
          };

          const waterfallResponse = await fetch(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(waterfallPayload),
          });

          if (waterfallResponse.ok) {
            const waterfallData = await waterfallResponse.json();
            if (Array.isArray(waterfallData.assistant_response)) {
              chartDataForRenderer = waterfallData.assistant_response;
              finalChartType = "pie";
              textForMarkdown = "I have generated the pie chart below:";
            }
          }
          setLoading(true);
        }

        const botMessage = {
          from: "bot",
          message: textForMarkdown,
          chartData: chartDataForRenderer,
          chartType: finalChartType,
          timestamp: data.timestamp,
          state: data.state,
        };

        // Update the active chat history
        setChatHistory((prev) => {
          // Remove the optimistic user message to prevent duplicates, then add the real ones
          const filtered = prev.filter((m, i) => !(m.from === "user" && i === prev.length - 1));
          return [...filtered, { from: "user", message }, botMessage];
        });

        if (effectiveThreadId !== threadId) {
          setThreadId(effectiveThreadId);
        }

        // ✅ SAFE PERSISTENCE: Write state AND localStorage together synchronously 
        setConversationsByThread((prev) => {
          const updatedThread = {
            threadId: effectiveThreadId,
            messages: [
              ...(prev[effectiveThreadId]?.messages || []),
              { from: "user", message },
              botMessage,
            ],
            createdAt: prev[effectiveThreadId]?.createdAt || data.timestamp,
            title: prev[effectiveThreadId]?.title || message,
          };

          const newState = {
            ...prev,
            [effectiveThreadId]: updatedThread,
          };

          // Commit to localStorage ONLY when a new message sequence completes
          if (storageKey) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(newState));
            } catch (e) {
          
            }
          }

          return newState;
        });

      } catch (err) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, threadId, storageKey]
  );

  const clearChat = () => {
    setChatHistory([]);
    setThreadId(null);
    // History is intentionally kept in conversationsByThread
  };

  const loadThreadHistory = useCallback(
    (tId) => {
      const thread = conversationsByThread[tId];
      if (thread) {
        setThreadId(tId);
        setChatHistory(thread.messages || []);
      }
    },
    [conversationsByThread]
  );

  return {
    chatHistory,
    loading,
    error,
    sendMessage,
    clearChat,
    threadId,
    setThreadId,
    conversationsByThread,
    loadThreadHistory,
  };
};

export default useChat;
--

// src/components/usecontext/UserContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { protectedResources } from "../../authConfig";
import { useDispatch } from "react-redux";
import { kpiApi, setTokenGetter } from "../../services/kpiApi";
import { EventType } from "@azure/msal-browser";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msalReady, setMsalReady] = useState(false);
  const [tokenGetterReady, setTokenGetterReady] = useState(false);
  const navigate = useNavigate();
  const { instance } = useMsal();
  const dispatch = useDispatch();

  // 1️⃣ Initialize MSAL on mount
  useEffect(() => {
    const initializeMsal = async () => {
      try {
        if (instance.initialize) {
          await instance.initialize();
        }
        setMsalReady(true);
      } catch (err) {
        setMsalReady(false);
      }
    };
    initializeMsal();
  }, [instance]);

  // 2️⃣ Token getter (useCallback)
  const getAccessToken = useCallback(async () => {
    try {
      const account = instance.getActiveAccount();
      if (!account) {
        return "";
      }
      const scopes = protectedResources.customApi.scopes;
      const tokenResponse = await instance.acquireTokenSilent({ account, scopes });
      return tokenResponse.accessToken;
    } catch (error) {
      // Try interactive popup
      try {
        const tokenResponse = await instance.acquireTokenPopup({
          scopes: protectedResources.customApi.scopes,
        });
        return tokenResponse.accessToken;
      } catch (interactiveError) {
        return "";
      }
    }
  }, [instance]);

  // 3️⃣ Refresh user (useCallback)
  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setUser(null);
        setLoading(false);
        return;
      }

      let msalAccount = null;
      try {
        msalAccount = instance.getActiveAccount();
      } catch {
        msalAccount = null;
      }

      const resp = await fetch(`${process.env.REACT_APP_API_URL}/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });

      let data = {};
      if (resp.status === 200) {
        data = await resp.json();
      }

      setUser({
        ...data,
        name:
          data.name ||
          (msalAccount && (msalAccount.name || msalAccount.username || msalAccount.email)) ||
          data.username ||
          data.email ||
          "User",
        email: data.email || (msalAccount && msalAccount.username) || null,
      });

    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, instance]);

  // 4️⃣ Logout (useCallback)
  const logout = useCallback(
    async (redirectPath = "/logout") => {
      try {
        dispatch(kpiApi.util.resetApiState());
        try {
          await fetch(`${process.env.REACT_APP_API_URL}/logout`, {
            method: "GET",
            credentials: "include",
          });
        } catch (logoutError) {
          // Backend logout fail
        }

        setUser(null);
        navigate(redirectPath);
      } catch (err) {
        setUser(null);
        navigate(redirectPath);
      }
    },
    [dispatch, navigate]
  );

  // 5️⃣ Login (useCallback)
  const login = useCallback(() => {
    instance.loginRedirect({ redirectUri: "/" });
  }, [instance]);

  // 6️⃣ Context value (useMemo)
  const contextValue = useMemo(
    () => ({
      user,
      loading,
      refreshUser,
      login,
      logout,
      isAuthenticated: !!user,
      getAccessToken,
      tokenGetterReady,
    }),
    [user, loading, refreshUser, login, logout, getAccessToken, tokenGetterReady]
  );

  // 7️⃣ Register token getter with RTK Query
  useEffect(() => {
    if (msalReady && getAccessToken) {
      setTokenGetter(getAccessToken);
      setTokenGetterReady(true);
    }
  }, [msalReady, getAccessToken]);

  // 8️⃣ Refresh user on mount
  useEffect(() => {
    if (msalReady) {
      refreshUser();
    }
  }, [refreshUser, msalReady]);

  // 9️⃣ MSAL event sync (THIS IS THE IMPORTANT FIX)
  useEffect(() => {
    if (!instance) return;
    const callbackId = instance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
        instance.setActiveAccount(event.payload.account);
        refreshUser(); // Auto-update context
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        setUser(null);
      }
    });
    return () => {
      if (callbackId) instance.removeEventCallback(callbackId);
    };
  }, [instance, refreshUser]);

  // 10️⃣ Prevent rendering until ready
  if (!msalReady || !tokenGetterReady) {
    return <div>Initializing authentication...</div>;
  }

  // 11️⃣ Provide context
  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

// Hook export
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};



