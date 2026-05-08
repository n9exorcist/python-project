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



.methodone-virtual-assistant-container {
  position: relative;
  background: #fff;
  font-family: Inter, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.methodone-virtual-assistant-container .virtual-assistant-header {
  display: flex;
  background: #872bcc;
  color: #fff;
  border-radius: 18px 18px 0 0;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .fullscreen-header {
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border-radius: 18px 18px 0 0;
  z-index: 20;
  background: #872bcc;
  color: #fff;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .header-content {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.methodone-virtual-assistant-container .close-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.7rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .maximize-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.18rem;
  cursor: pointer;
  margin-right: 7px;
  margin-left: 4px;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .collapse-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-content-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  overflow: auto;
  border-radius: 12px;
}

.methodone-virtual-assistant-container .chat-history-sidebar {
  height: 100%;
  background: #fff;
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.methodone-virtual-assistant-container .sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-header span {
  font-weight: bold;
  font-size: 18px;
}

.methodone-virtual-assistant-container .sidebar-close-button {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-content {
  padding: 0 20px;
  overflow-y: auto;
  flex: 1;
}

.methodone-virtual-assistant-container .sidebar-item {
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-chat-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.methodone-virtual-assistant-container .welcome-title {
  padding: 22px 28px 10px;
  font-weight: 700;
  font-size: 1.11rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
  background: linear-gradient(180deg, #ad9be833, #c6b8f433);
}

.methodone-virtual-assistant-container .sample-questions {
  margin-bottom: 12px;
  padding: 0 28px;
  background: linear-gradient(180deg, #c6b8f433, #fff);
}

.methodone-virtual-assistant-container .sample-questions-title {
  font-weight: 600;
  color: #000;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.methodone-virtual-assistant-container .sample-query-button {
  margin-top: 8px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #a100ff52;
  border-radius: 8px;
  font-size: 0.92rem;
  color: #000;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.methodone-virtual-assistant-container .non-fullscreen-welcome {
  /* Padding handled inline due to conditional */
}

.methodone-virtual-assistant-container .welcome-message {
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
}

.methodone-virtual-assistant-container .options-grid {
  display: grid;
  margin-bottom: 7px;
}

.methodone-virtual-assistant-container .option-button {
  background: #fff;
  border: 1.7px solid #ebe0fb;
  border-radius: 9px;
  font-weight: 600;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 7px rgba(193, 126, 255, 0.06);
}

.methodone-virtual-assistant-container .chat-bubbles-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper {
  display: flex;
  align-items: flex-end;
  margin-bottom: 10px;
  margin-top: 10px;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper.user {
  flex-direction: row-reverse;
}

.methodone-virtual-assistant-container .chat-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #7e2efc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}

.methodone-virtual-assistant-container .chat-bubble {
  padding: 10px 15px;
  box-shadow: 0 1px 6px rgba(186, 106, 255, 0.06);
  font-size: 1.02rem;
  text-align: left;
  max-width: 74%;
  min-width: 80px;
  word-break: break-word;
}

.methodone-virtual-assistant-container .loading-indicator {
  color: #aaa;
  font-size: 1.01rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.methodone-virtual-assistant-container .loading-icon {
  width: 32px;
  height: 32px;
  margin-right: 8px;
}

.methodone-virtual-assistant-container .error-message {
  color: red;
  font-size: 1.01rem;
  text-align: center;
  margin: 10px 0;
}

.methodone-virtual-assistant-container .input-bar {
  border-top: 1.6px solid rgb(236, 238, 253);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-direction: row;
  border-radius: 12px;
  margin: 20px 0 0 0;
  position: relative;
}

.methodone-virtual-assistant-container .input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-history-toggle {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #7e2efc;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  z-index: 2;
  user-select: none;
}

.methodone-virtual-assistant-container .chat-history-toggle span {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .separator {
  font-size: 1.5rem;
  margin-left: 3px;
  margin-right: 3px;
  line-height: 1;
  font-weight: 100;
  color: #7e2efc;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-input {
  flex: 1;
  /* Increased right padding (50px) so the text doesn't type underneath the send button */
  padding: 12px 50px 12px 15px; 
  border: 1.5px solid #edeef8;
  border-radius: 12px; /* Slightly rounder to match modern UI */
  font-size: 1.01rem;
  background: #fafafd;
  margin: 0;
}

.methodone-virtual-assistant-container .fullscreen-input {
  padding-left: 156px;
  border: 1px solid #a100ff52;
}

.methodone-virtual-assistant-container .send-button {
  background: #7e2efc;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 34px;  /* Slightly smaller to fit beautifully inside the input box */
  height: 34px;
  cursor: pointer;
  
  /* 1. This perfectly centers the paper airplane icon inside the button */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  
  /* 2. This anchors the button perfectly inside the right side of the input field */
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%); /* Mathematically guarantees perfect vertical centering */
  margin: 0;
}

.methodone-virtual-assistant-container .footer-disclaimer {
  padding: 12px 30px;
  font-size: 0.91rem;
  color: #726590;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.methodone-virtual-assistant-container .footer-icons {
  display: flex;
}

.methodone-virtual-assistant-container .sidebar-new-chat-wrapper {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: #f3e6ff;
  color: #7e2efc;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button:hover {
  background: #e8d5ff;
}

.chat-markdown p {
  margin: 0 0 4px 0;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown ul {
  list-style-type: disc;
}

.chat-markdown ol {
  list-style-type: decimal;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chart-wrapper-bubble {
    background: #ffffff;
    border-radius: 8px;
    padding: 10px;
    border: 1px solid #e2e8f0;
    overflow: hidden; /* Prevents X-axis labels from leaking */
}

/* In MethodOneVirtualAssistant.css */
.methodone-virtual-assistant-container .chat-bubble.bot {
    max-width: 90% !important; /* Give it more room */
    width: 100%;
}

.chart-wrapper-bubble {
   margin-top: 12px;
    width: 100%;
    /* Remove overflow: hidden if it exists here */
    overflow-x: auto; 
    display: block;
    background: #fff;
}

/* Markdown tables inside chat bubbles */
.chat-markdown table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

.chat-markdown th,
.chat-markdown td {
  border: 1px solid #e2e8f0;
  padding: 6px 8px;
}

.chat-markdown th {
  background-color: #f5f5f5;
  font-weight: 600;
  text-align: left;
}

.chat-markdown tbody tr:nth-child(even) {
  background-color: #faf5ff;
}

.methodone-virtual-assistant-container {
  position: relative;
  background: #fff;
  font-family: Inter, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.methodone-virtual-assistant-container .virtual-assistant-header {
  display: flex;
  background: #872bcc;
  color: #fff;
  border-radius: 18px 18px 0 0;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .fullscreen-header {
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border-radius: 18px 18px 0 0;
  z-index: 20;
  background: #872bcc;
  color: #fff;
  padding: 15px 24px;
  font-size: 1.11rem;
  font-weight: 700;
  align-items: center;
  justify-content: space-between;
}

.methodone-virtual-assistant-container .header-content {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.methodone-virtual-assistant-container .close-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.7rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .maximize-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.18rem;
  cursor: pointer;
  margin-right: 7px;
  margin-left: 4px;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .collapse-button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-content-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  overflow: auto;
  border-radius: 12px;
}

.methodone-virtual-assistant-container .chat-history-sidebar {
  height: 100%;
  background: #fff;
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.methodone-virtual-assistant-container .sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-header span {
  font-weight: bold;
  font-size: 18px;
}

.methodone-virtual-assistant-container .sidebar-close-button {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-content {
  padding: 0 20px;
  overflow-y: auto;
  flex: 1;
}

.methodone-virtual-assistant-container .sidebar-item {
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  cursor: pointer;
}

.methodone-virtual-assistant-container .main-chat-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.methodone-virtual-assistant-container .welcome-title {
  padding: 22px 28px 10px;
  font-weight: 700;
  font-size: 1.11rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
  background: linear-gradient(180deg, #ad9be833, #c6b8f433);
}

.methodone-virtual-assistant-container .sample-questions {
  margin-bottom: 12px;
  padding: 0 28px;
  background: linear-gradient(180deg, #c6b8f433, #fff);
}

.methodone-virtual-assistant-container .sample-questions-title {
  font-weight: 600;
  color: #000;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.methodone-virtual-assistant-container .sample-query-button {
  margin-top: 8px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #a100ff52;
  border-radius: 8px;
  font-size: 0.92rem;
  color: #000;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.methodone-virtual-assistant-container .non-fullscreen-welcome {
  /* Padding handled inline due to conditional */
}

.methodone-virtual-assistant-container .welcome-message {
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #460073;
}

.methodone-virtual-assistant-container .options-grid {
  display: grid;
  margin-bottom: 7px;
}

.methodone-virtual-assistant-container .option-button {
  background: #fff;
  border: 1.7px solid #ebe0fb;
  border-radius: 9px;
  font-weight: 600;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 7px rgba(193, 126, 255, 0.06);
}

.methodone-virtual-assistant-container .chat-bubbles-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper {
  display: flex;
  align-items: flex-end;
  margin-bottom: 10px;
  margin-top: 10px;
}

.methodone-virtual-assistant-container .chat-bubble-wrapper.user {
  flex-direction: row-reverse;
}

.methodone-virtual-assistant-container .chat-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #7e2efc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}

.methodone-virtual-assistant-container .chat-bubble {
  padding: 10px 15px;
  box-shadow: 0 1px 6px rgba(186, 106, 255, 0.06);
  font-size: 1.02rem;
  text-align: left;
  max-width: 74%;
  min-width: 80px;
  word-break: break-word;
}

.methodone-virtual-assistant-container .loading-indicator {
  color: #aaa;
  font-size: 1.01rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.methodone-virtual-assistant-container .loading-icon {
  width: 32px;
  height: 32px;
  margin-right: 8px;
}

.methodone-virtual-assistant-container .error-message {
  color: red;
  font-size: 1.01rem;
  text-align: center;
  margin: 10px 0;
}

.methodone-virtual-assistant-container .input-bar {
  border-top: 1.6px solid rgb(236, 238, 253);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-direction: row;
  border-radius: 12px;
  margin: 20px 0 0 0;
  position: relative;
}

.methodone-virtual-assistant-container .input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-history-toggle {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #7e2efc;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  z-index: 2;
  user-select: none;
}

.methodone-virtual-assistant-container .chat-history-toggle span {
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .separator {
  font-size: 1.5rem;
  margin-left: 3px;
  margin-right: 3px;
  line-height: 1;
  font-weight: 100;
  color: #7e2efc;
  display: flex;
  align-items: center;
}

.methodone-virtual-assistant-container .chat-input {
  flex: 1;
  /* Increased right padding (50px) so the text doesn't type underneath the send button */
  padding: 12px 50px 12px 15px; 
  border: 1.5px solid #edeef8;
  border-radius: 12px; /* Slightly rounder to match modern UI */
  font-size: 1.01rem;
  background: #fafafd;
  margin: 0;
}

.methodone-virtual-assistant-container .fullscreen-input {
  padding-left: 156px;
  border: 1px solid #a100ff52;
}

.methodone-virtual-assistant-container .send-button {
  background: #7e2efc;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 34px;  /* Slightly smaller to fit beautifully inside the input box */
  height: 34px;
  cursor: pointer;
  
  /* 1. This perfectly centers the paper airplane icon inside the button */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  
  /* 2. This anchors the button perfectly inside the right side of the input field */
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%); /* Mathematically guarantees perfect vertical centering */
  margin: 0;
}

.methodone-virtual-assistant-container .footer-disclaimer {
  padding: 12px 30px;
  font-size: 0.91rem;
  color: #726590;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.methodone-virtual-assistant-container .footer-icons {
  display: flex;
}

.methodone-virtual-assistant-container .sidebar-new-chat-wrapper {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: #f3e6ff;
  color: #7e2efc;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.methodone-virtual-assistant-container .sidebar-new-chat-button:hover {
  background: #e8d5ff;
}

.chat-markdown p {
  margin: 0 0 4px 0;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown ul {
  list-style-type: disc;
}

.chat-markdown ol {
  list-style-type: decimal;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chat-markdown ul,
.chat-markdown ol {
  margin: 4px 0 4px 1.2rem;
  padding-left: 1.2rem;
}

.chat-markdown li {
  margin-bottom: 4px;
}

.chart-wrapper-bubble {
    background: #ffffff;
    border-radius: 8px;
    padding: 10px;
    border: 1px solid #e2e8f0;
    overflow: hidden; /* Prevents X-axis labels from leaking */
}

/* In MethodOneVirtualAssistant.css */
.methodone-virtual-assistant-container .chat-bubble.bot {
    max-width: 90% !important; /* Give it more room */
    width: 100%;
}

.chart-wrapper-bubble {
   margin-top: 12px;
    width: 100%;
    /* Remove overflow: hidden if it exists here */
    overflow-x: auto; 
    display: block;
    background: #fff;
}

/* Markdown tables inside chat bubbles */
.chat-markdown table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

.chat-markdown th,
.chat-markdown td {
  border: 1px solid #e2e8f0;
  padding: 6px 8px;
}

.chat-markdown th {
  background-color: #f5f5f5;
  font-weight: 600;
  text-align: left;
}

.chat-markdown tbody tr:nth-child(even) {
  background-color: #faf5ff;
}



// src/hooks/useChat.js
import { useState, useCallback, useEffect } from "react";
import {
  useGetChatThreadsQuery,
  useGetChatThreadMessagesQuery,
  useDeleteChatThreadMutation,
  useSendChatMessageMutation,
} from "../services/kpiApi";

const useChat = (user, getAccessToken) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [conversationsByThread, setConversationsByThread] = useState({});
  const [activeThreadIdToFetch, setActiveThreadIdToFetch] = useState(null);

  // ── 1. Fetch all threads on mount ────────────────────────────────
  const {
    data: threadsMap,
    isLoading: threadsLoading,
  } = useGetChatThreadsQuery(undefined, {
    skip: !user,
  });

  // Sync threadsMap into local state when it arrives
  useEffect(() => {
    if (threadsMap) {
      setConversationsByThread(threadsMap);
    }
  }, [threadsMap]);

  // ── 2. Fetch messages of a specific thread on demand ─────────────
  const { data: fetchedMessages, isFetching: messagesFetching } =
    useGetChatThreadMessagesQuery(activeThreadIdToFetch, {
      skip: !activeThreadIdToFetch,
    });

  useEffect(() => {
  if (fetchedMessages && activeThreadIdToFetch) {
    const normalizedMessages = (fetchedMessages || [])
      .filter((msg) => msg?.role !== "system")
      .map((msg) => {
        const role = msg?.role || "assistant";
        const metadata = msg?.metadata || {};
        const assistantResponse = metadata?.assistant_response || {};
        const chartSpec = assistantResponse?.chart_spec || {};

        const derivedMessage =
          msg?.content ??
          metadata?.content ??
          metadata?.message ??
          metadata?.text ??
          metadata?.user_message ??
          assistantResponse?.insight ??
          assistantResponse?.key_takeaway ??
          chartSpec?.title ??
          chartSpec?.description ??
          "";

        let finalMessage = "";
        if (typeof derivedMessage === "string") {
          finalMessage = derivedMessage.trim();
        } else if (derivedMessage != null) {
          finalMessage = String(derivedMessage).trim();
        }

        let chartData = null;
        let chartType = null;

        if (assistantResponse?.type === "financial_chart") {
          chartData = Array.isArray(assistantResponse?.data)
            ? assistantResponse.data
            : assistantResponse?.data || null;

          chartType = chartSpec?.chart_type || "bar";
        }

        return {
          from: role === "user" ? "user" : "bot",
          message: finalMessage,
          timestamp: msg?.timestamp,
          chartData,
          chartType,
          state: metadata?.state || null,
          raw: msg,
        };
      })
      .filter((msg) => {
        const hasText = !!msg.message;
        const hasChart =
          !!msg.chartData &&
          (Array.isArray(msg.chartData)
            ? msg.chartData.length > 0
            : Object.keys(msg.chartData || {}).length > 0);

        return hasText || hasChart;
      });

    setChatHistory(normalizedMessages);
    setThreadId(activeThreadIdToFetch);

    setConversationsByThread((prev) => ({
      ...prev,
      [activeThreadIdToFetch]: {
        ...prev[activeThreadIdToFetch],
        messages: normalizedMessages,
      },
    }));

    setActiveThreadIdToFetch(null);
  }
}, [fetchedMessages, activeThreadIdToFetch]);

  // ── 3. RTK mutations ──────────────────────────────────────────────
  const [sendChatMessageMutation, { isLoading: sendLoading }] =
    useSendChatMessageMutation();

  const [deleteChatThreadMutation] = useDeleteChatThreadMutation();

  // ── 4. Send a message ─────────────────────────────────────────────
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;

      // Optimistically show user message
      setChatHistory((prev) => [...prev, { from: "user", message }]);
      setError(null);

      try {
        const data = await sendChatMessageMutation({
          message,
          threadId,
        }).unwrap();

        const effectiveThreadId = data.thread_id || threadId || "temp_id";

        // ── Parse backend response ──
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

        // Replace optimistic user message + add bot reply
        setChatHistory((prev) => {
          const filtered = prev.filter(
            (m, i) => !(m.from === "user" && i === prev.length - 1)
          );
          return [...filtered, { from: "user", message }, botMessage];
        });

        if (effectiveThreadId !== threadId) {
          setThreadId(effectiveThreadId);
        }

        // Update thread sidebar in memory
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

  // ── 5. Load a thread's messages on sidebar click ──────────────────
  const loadThreadHistory = useCallback(
    (tId) => {
      const existing = conversationsByThread[tId];

      if (existing?.messages?.length > 0) {
        setThreadId(tId);
        setChatHistory(existing.messages);
        return;
      }

      setActiveThreadIdToFetch(tId);
    },
    [conversationsByThread]
  );

  // ── 6. Delete a thread ────────────────────────────────────────────
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

  // ── 7. Start a new chat ───────────────────────────────────────────
  const clearChat = useCallback(() => {
    setChatHistory([]);
    setThreadId(null);
  }, []);

  return {
    chatHistory,
    loading: sendLoading || messagesFetching,
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

// src/hooks/useChatApi.js
// ─────────────────────────────────────────────────────────────
// This file is the SINGLE SOURCE OF TRUTH for all chat API calls.
// When backend is ready, only this file needs to change.
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.REACT_APP_API_URL;

// ── Send a message ──────────────────────────────────────────
export const sendChatMessage = async (message, threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      user_message: message,
      thread_id: threadId || undefined,
    }),
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json();
};

// ── Fetch all threads for the logged-in user ────────────────
export const fetchAllThreads = async (token) => {
  const response = await fetch(`${BASE_URL}/chat/history/threads`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { threads: [...] }
};

// ── Fetch messages of a specific thread ─────────────────────
export const fetchThreadMessages = async (threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat/history/${threadId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { thread_id, messages: [...] }
};

// ── Delete a thread ──────────────────────────────────────────
export const deleteThread = async (threadId, token) => {
  const response = await fetch(`${BASE_URL}/chat/history/${threadId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  return response.json(); // { status: "deleted" }
};


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

    // ── GET all threads for logged-in user ──────────────────────
    getChatThreads: build.query({
      query: () => "/chat/history/threads",
      providesTags: ["ChatHistory"],
      transformResponse: (resp) => {
        const threadsMap = {};
        (resp?.threads || []).forEach((t) => {
          threadsMap[t.thread_id] = {
            threadId: t.thread_id,
            title: t.title,
            createdAt: t.created_at,
            lastMessageAt: t.last_message_at,
            messages: [],
          };
        });
        return threadsMap;
      },
      transformErrorResponse: (response) => {
        console.error("❌ Chat Threads API Error:", response);
        return response;
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

function metaReducer(state = metaInitialState, action) {
  switch (action.type) {
    case META_UPDATE:
      return {
        ...state,
        lastPersistedAt: Date.now(),
        isExpired: false,
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

// ✅ keep 24 hours for testing, switch back later
const EXPIRY_MS = 24 * 60 * 60 * 1000;

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
          action
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

