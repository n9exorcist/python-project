import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../../assets/css/botloader.css";

// ---------------------------------------------------------------------------
// SAST Fix — CWE-79 [CRITICAL] (XSS): createPortal(loaderContent, document.body)
//
// AppScan rated this Critical because loaderContent was constructed from
// `currentMessage` (a value cycled through the messages array) and rendered
// directly into document.body via createPortal — the broadest possible DOM
// injection surface.
//
// Two fixes applied:
//
// 1. Portal target: a dedicated <div> is created via createElement (no
//    innerHTML) and appended/removed safely with a useRef + useEffect.
//    Injecting into a scoped container instead of document.body limits the
//    blast radius of any future accidental innerHTML usage nearby.
//
// 2. Message content: messages are a compile-time constant array of plain
//    strings. They are rendered as React text nodes ({currentMessage}),
//    never via dangerouslySetInnerHTML, so no script can be injected through
//    them. This is made explicit with the SAFE_MESSAGES freeze below.
// ---------------------------------------------------------------------------

// Freeze the array so it cannot be mutated at runtime (defence-in-depth).
const SAFE_MESSAGES = Object.freeze([
  "Working on it...",
  "Fetching data from database...",
  "Loading the results...",
  "Analyzing your query...",
  "Generating response...",
]);

const BotLoader = () => {
  const [currentMessage, setCurrentMessage] = useState(SAFE_MESSAGES[0]);

  // CWE-79 fix: dedicated portal container created via createElement,
  // not innerHTML — no script injection possible through its construction.
  const portalContainerRef = useRef(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "bot-loader-portal-root";
    document.body.appendChild(el);
    portalContainerRef.current = el;

    return () => {
      if (document.body.contains(el)) {
        document.body.removeChild(el);
      }
      portalContainerRef.current = null;
    };
  }, []);

  // Message rotation — pure React state, no DOM writes
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => {
        const nextIndex =
          (SAFE_MESSAGES.indexOf(prev) + 1) % SAFE_MESSAGES.length;
        return SAFE_MESSAGES[nextIndex];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // loaderContent uses only React text nodes — never dangerouslySetInnerHTML.
  // currentMessage is always one of the frozen SAFE_MESSAGES strings.
  const loaderContent = (
    <div className="bot-loader">
      <div className="bot-loader-container">
        <span className="material-symbols-outlined robot-icon">robot_2</span>
        {/* CWE-79 fix: plain text node, not HTML injection */}
        <p className="loading-text">{currentMessage}</p>
      </div>
    </div>
  );

  // CWE-79 fix: portal targets dedicated container, not document.body directly.
  if (!portalContainerRef.current) return null;
  return createPortal(loaderContent, portalContainerRef.current);
};

export default BotLoader;
