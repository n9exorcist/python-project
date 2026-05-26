Issues - By Fix Groups:
M Common API Call: Authentication.Credentials.Unprotected: response =
await fetch(`$
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-26 08:12:02Z
API: response = await fetch(`$
How to Fix: Authentication.Credentials.Unprotected
Issue 1 of 4
Issue ID: 08905b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:11
Line 11
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 522
Source: async (message, threadId, token) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks
/useChatApi.js:10
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
1
Issue 1 of 4 - Details
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
0a
sync (message, threadId, token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
1f
etch(`${BASE_URL}/chat`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
1r
esponse = await fetch(`${BASE_URL}/chat`, {...})
Issue 1 of 4 - Audit Trail
05/26/2026 08:12:03 Issue type: Authentication.Credentials.Unprotected
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/hooks/useChatApi.js:11
Severity: Medium
Scanner: AppScan Static Analyzer
Issue 2 of 4
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
0a
sync (message, threadId, token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
1f
etch(`${BASE_URL}/chat`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:1
1r
esponse = await fetch(`${BASE_URL}/chat`, {...})
4
Issue ID: 17905b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:29
Line 29
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 522
Source: async (token) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:2
8
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:2
9
Issue 2 of 4 - Details
Issue 2 of 4 - Audit Trail
05/26/2026 08:12:03 Issue type: Authentication.Credentials.Unprotected
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/hooks/useChatApi.js:29
Severity: Medium
Scanner: AppScan Static Analyzer
Issue 3 of 4
Issue ID: 1d905b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:45
Line 45
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 522
Source: async (threadId, token) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatA
pi.js:43
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
5
Issue 3 of 4 - Details
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:2
8a
sync (token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:2
9fetch(`${BASE_URL}/chat/history/threads`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
response = await fetch(`${BASE_URL}/chat/history/threads`, {...})
Issue 2 of 4 - Audit Trail
05/26/2026 08:12:03 Issue type: Authentication.Credentials.Unprotected
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/hooks/useChatApi.js:29
Severity: Medium
Scanner: AppScan Static Analyzer
Issue 3 of 4
Issue ID: 1d905b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:45
Line 45
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 522
Source: async (threadId, token) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatA
pi.js:43
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
5
Issue 3 of 4 - Details

Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
3a
sync (threadId, token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
5f
etch(`${BASE_URL}/chat/history/${safeThreadId}`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:45
response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {...})

Issue 3 of 4 - Audit Trail
05/26/2026 08:12:03 Issue type: Authentication.Credentials.Unprotected
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/hooks/useChatApi.js:45
Severity: Medium
Scanner: AppScan Static Analyzer
Issue 4 of 4
Issue ID: 23905b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: a48f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:61
Line 61
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 522
Source: async (threadId, token) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatA
pi.js:59
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:6

Issue 4 of 4 - Details
Issue 4 of 4 - Audit Trail
05/26/2026 08:12:03 Issue type: Authentication.Credentials.Unprotected
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/hooks/useChatApi.js:61
Severity: Medium
Scanner: AppScan Static Analyzer
M Common API Call: Configuration: Insecure use of base image version
detected in Dockerfile
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
3a
sync (threadId, token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:4
5f
etch(`${BASE_URL}/chat/history/${safeThreadId}`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:45
response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {...})
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:5
9a
sync (threadId, token) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:6
1f
etch(`${BASE_URL}/chat/history/${safeThreadId}`, {...token...})
Supply Chain Rapid Diagnostics Factory/FrontEnd/hooks/useChatApi.js:61
response = await fetch(`${BASE_URL}/chat/history/${safeThreadId}`, {...})


Fix Group ID: 6a415b92-5b53-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-19 08:20:27Z
API: Insecure use of base image version detected in Dockerfile
How to Fix: Insecure use of base image version detected in Dockerfile
Issue 1 of 1
Issue ID: 4d9382a5-5b53-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: 6a415b92-5b53-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory\backend-python\Dockerfile:5
Line 5
Source File Supply Chain Rapid Diagnostics Factory\backend-python\Dockerfile
Date Created Tuesday, May 19, 2026
Last Updated Tuesday, May 19, 2026
CWE: 16
API: Insecure use of base image version detected in Dockerfile
Caller: Supply Chain Rapid Diagnostics Factory\backend-python\Dockerfile:
5
Issue 1 of 1 - Details
Issue 1 of 1 - Audit Trail
05/19/2026 08:20:28 Issue type: Configuration
Location: SupplyChainRapidDiagnosticsFactory\backendpython\
Dockerfile:5
Severity: Medium
Scanner: AppScan Static Analyzer
M Common API Call: Cross-Site Scripting: formData.append("file", file)
Fix Group ID: 988f5b90-da58-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-26 08:12:02Z
API: formData.append("file", file)
How to Fix: Cross-Site Scripting
Issue 1 of 1
Call
FROM python:3.12-slim


Issue ID: b48f5b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: 988f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:166
Line 166
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 79
Source: async (e) => {...} via Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContai
ner.jsx:150
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:16
6
Issue 1 of 1 - Details
Issue 1 of 1 - Audit Trail
05/26/2026 08:12:03 Issue type: Cross-SiteScripting
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/components/FileUpload
Container.jsx:166
Severity: Medium
Scanner: AppScan Static Analyzer
M Common API Call: Cross-Site Scripting: interval = setInterval(checkExpiry,
5 * 60 * 1000)
Fix Group ID: 9a8f5b90-da58-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-26 08:12:02Z
API: interval = setInterval(checkExpiry, 5 * 60 * 1000)
How to Fix: Cross-Site Scripting
Issue 1 of 1
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.js
x
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:15
0a
sync (e) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:15
1f
ile = e.target.files[0]
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:15
2i
f (!file) return;
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/FileUploadContainer.jsx:16
6f
ormData.append("file", file)



Issue ID: ae8f5b90-da58-f111-8fcb-0022484e63bd
Severity: Medium
Status Open
Fix Group ID: 9a8f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:85
Line 85
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 79
Source: persisted = localStorage.getItem("persist:root") via Supply Chain Rapid Diagnostics Factory/FrontEnd/
App.js:69
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:8
5
Issue 1 of 1 - Details
Issue 1 of 1 - Audit Trail
05/26/2026 08:12:03 Issue type: Cross-SiteScripting
Location: SupplyChainRapidDiagnosticsFactory/FrontEnd/App.js:85
Severity: Medium
Scanner: AppScan Static Analyzer
C Common API Call: Cross-Site Scripting: return createPortal(loaderContent,
document.body);
Fix Group ID: 958f5b90-da58-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-26 08:12:02Z
API: return createPortal(loaderContent, document.body);
How to Fix: Cross-Site Scripting
Issue 1 of 1
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/App.j
s
Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:6
9p
ersisted = localStorage.getItem("persist:root")
Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:6
8(
) => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:6
8c
heckExpiry = () => {...}
Supply Chain Rapid Diagnostics Factory/FrontEnd/App.js:8
5i
nterval = setInterval(checkExpiry, 5 * 60 * 1000)


Issue 1 of 1 - Audit Trail
05/26/2026 08:12:03 Issue type: Cross-SiteScripting
Location: SupplyChainRapidDiagnosticsFactory/FrontEnd/App.js:85
Severity: Medium
Scanner: AppScan Static Analyzer
C Common API Call: Cross-Site Scripting: return createPortal(loaderContent,
document.body);
Fix Group ID: 958f5b90-da58-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-26 08:12:02Z
API: return createPortal(loaderContent, document.body);
How to Fix: Cross-Site Scripting
Issue 1 of 1


Issue ID: ff8f5b90-da58-f111-8fcb-0022484e63bd
Severity: Critical
Status Open
Fix Group ID: 958f5b90-da58-f111-8fcb-0022484e63bd
Location Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.jsx:39
Line 39
Source File Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.jsx
Date Created Tuesday, May 26, 2026
Last Updated Tuesday, May 26, 2026
CWE: 79
Source: createPortal(loaderContent, document.body) via Supply Chain Rapid Diagnostics Factory/FrontEnd/co
mponents/common/BotLoader.jsx:39
Sink: via Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.jsx:3
9
Issue 1 of 1 - Details
Issue 1 of 1 - Audit Trail
05/26/2026 08:12:03 Issue type: Cross-SiteScripting
Location:
SupplyChainRapidDiagnosticsFactory/FrontEnd/components/common/B
otLoader.jsx:39
Severity: Critical
Scanner: AppScan Static Analyzer
M Common API Call: Improper Handling of Exceptional Conditions: Exposure
of confidential information through print or logging m...
Fix Group ID: 6b415b92-5b53-f111-8fcb-0022484e63bd
Status: Open
Date: 2026-05-19 08:20:27Z
API: Exposure of confidential information through print or logging methods in python code
How to Fix: Improper Handling of Exceptional Conditions
Issue 1 of 1
Trace
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.js
x
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.jsx:3
9c
reatePortal(loaderContent, document.body)
Supply Chain Rapid Diagnostics Factory/FrontEnd/components/common/BotLoader.jsx:3
9r
eturn createPortal(loaderContent, document.body);

--

/* eslint-disable no-console */
import React, { useRef, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { unlockTab } from "../slices/tabAccessSlice";
import { useUploadPptMutation } from "../services/kpiApi"; // Add this import
import "../assets/css/FileUploadContainer.css";
import Loader from "./common/Loader";
import ConfidentialDisclaimerModal from "./modal/ConfidentialDisclaimerModal";
import useFileUpload from "../hooks/useFileUpload";
import { useUser } from "./usecontext/UserContext";
import useOneGoAssessmentPrefetch from "../hooks/useOneGoAssessmentPrefetch";
import { purgePersistedState } from "../store";

const templateFiles = [
  {
    label: "Client Inputs KPI_Template",
    filename: "Client Inputs KPI_Template.xlsx",
    path: "/templates/Client Inputs KPI_Template.xlsx",
  },
  {
    label: "MyD SCO Questionnaire_Template",
    filename: "MyD SCO Questionnaire_Template.xlsx",
    path: "/templates/MyD SCO Questionnaire_Template.xlsx",
  },
  {
    label: "OTIF_On time Targets_Template",
    filename: "OTIF_On time Targets_Template.xlsx",
    path: "/templates/OTIF_On time Targets_Template.xlsx",
  },
  {
    label: "OTIF Sales Data_Template",
    filename: "OTIF Sales Data_Template.xlsx",
    path: "/templates/OTIF Sales Data_Template.xlsx",
  },
  {
    label: "NPV Inputs Template",
    filename: "NPV_Inputs_Template.csv",
    path: "/templates/NPV_Inputs_Template.csv",
  },
  {
    label: "Financial Analysis Template",
    filename: "Financial_Analysis_Template.xlsx",
    path: "/templates/Financial_Analysis_Template.xlsx",
  },
];

const FileUploadContainer = ({ onFileSelect }) => {
  const dispatch = useDispatch();
  const { getAccessToken } = useUser();

  // Redux-backed file list (authoritative & persisted)
  const uploadedFiles = useSelector((state) => state.fileUpload.files || []);

  // RTK Query mutations
  const [uploadPpt, { isLoading: isPptUploading }] = useUploadPptMutation();

  // File upload hook (now fully Redux-driven)
  const {
    dragActive,
    handleFiles,
    onDrag,
    onDrop,
    removeFile,
    getBoxClass,
    isLoading,
  } = useFileUpload(getAccessToken);

  const inputRef = useRef(null);
  const pptInputRef = useRef(null); // Separate ref for PPT upload
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // simple modal state for PPT upload result
  const [pptModal, setPptModal] = useState({
    open: false,
    title: "",
    message: "",
    type: "success",
  });

  const {
    isRunning,
    isError,
    error: oneGoError,
    runOneGoAssessment,
  } = useOneGoAssessmentPrefetch();

  const isOneGoLoading = isRunning;
  const [hasTriggeredOneGo, setHasTriggeredOneGo] = useState(false);

  const handleRunOneGoAssessment = () => {
    setHasTriggeredOneGo(true);
    runOneGoAssessment();
  };

  const requiredTemplateNames = templateFiles.map((t) => t.filename);

  const hasAllRequiredTemplatesUploaded =
    requiredTemplateNames.length > 0 &&
    requiredTemplateNames.every((templateName) =>
      uploadedFiles.some(
        (f) => f.name === templateName && f.status === "success"
      )
    );

  const isOneGoSuccess =
    hasTriggeredOneGo && !isOneGoLoading && !isError;

  useEffect(() => {
    if (hasAllRequiredTemplatesUploaded && isOneGoSuccess) {
      dispatch(unlockTab("KPI-calculation"));
    }
  }, [hasAllRequiredTemplatesUploaded, isOneGoSuccess, dispatch]);

  useEffect(() => {
    if (!hasAllRequiredTemplatesUploaded) return;
    dispatch(unlockTab("KPI-calculation"));
  }, [hasAllRequiredTemplatesUploaded, dispatch]);

  const isOneGoDisabled = isOneGoLoading || !hasAllRequiredTemplatesUploaded;

  const downloadFile = (fileObj) => {
    if (!fileObj.file) return;
    const url = URL.createObjectURL(fileObj.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileObj.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllTemplates = () => {
    templateFiles.forEach((file) => {
      const a = document.createElement("a");
      a.href = file.path;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const onBrowseClick = () => {
    inputRef.current?.click();
  };

  // New PPT upload handler
  // UPDATE handlePptUpload function:
  const handlePptUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().match(/\.(pptx|ppt)$/)) {
      setPptModal({
        open: true,
        title: "Invalid file type",
        message: "Please select a valid PPT or PPTX file.",
        type: "error",
      });
      return;
    }

    const formData = new FormData();
    // Backend likely expects "file" or "ppt_file" - try both if needed
    formData.append("file", file); // ← CHANGE: use "file" (standard name)
    // formData.append("ppt_file", file); // fallback if backend expects this

    try {
      await uploadPpt(formData).unwrap();
      setPptModal({
        open: true,
        title: "PPT uploaded successfully",
        message:
          "PPT uploaded successfully. The Executive Summary will be refreshed with the latest content.",
        type: "success",
      });
      if (pptInputRef.current) {
        pptInputRef.current.value = "";
      }
    } catch (error) {
      console.error("PPT upload failed:", error);
      const errorMsg =
        error?.data?.detail ||
        error?.data?.message ||
        error?.data ||
        "Upload failed. Check file format and try again.";
      setPptModal({
        open: true,
        title: "PPT upload failed",
        message: typeof errorMsg === "string" ? errorMsg : "Unknown error.",
        type: "error",
      });
    }
  };

  const onInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = "";
    if (e.target.files[0]) {
      onFileSelect?.(e.target.files[0], {
        hasFiles: true,
        totalFiles: uploadedFiles.length + e.target.files.length,
      });
    }
  };

  useEffect(() => {
    if (!onFileSelect) return;
    const hasFiles = uploadedFiles.length > 0;
    onFileSelect(null, { hasFiles, totalFiles: uploadedFiles.length });
  }, [uploadedFiles.length, onFileSelect]);

  return (
    <div className="fileupload-container">
      {/* Download section */}
      <div className="download-section">
        <div className="download-title">Download Templates</div>
        <div className="download-desc">
          Templates must follow the required format with file Name
        </div>
        <button
          className="download-btn"
          onClick={() => setShowDisclaimer(true)}
        >
          Download{" "}
          <span className="material-symbols-outlined sc-downloadIcon">
            download
          </span>
        </button>
      </div>

      {/* Upload section */}
      <div className="upload-section">
        <div className="upload-header-row">
          <div>
            <div className="upload-title">Upload Templates</div>
            <div className="upload-desc">
              Upload the documents to support the Rapid Diagnostics Assessment
            </div>
            <div className="upload-mandatory">
              <span className="required-stars">**</span> All required templates
              from the list must be uploaded successfully before running the
              One‑Go Assessment.
            </div>
          </div>

          {/* One‑Go Assessment CTA */}
          <div
            className="one-go-assessment-block"
            style={{ marginTop: "1.5rem" }}
          >
            <button
              type="button"
              className={`one-go-btn d-flex align-items-center ${
                isOneGoDisabled ? "one-go-btn-disabled" : "one-go-btn-active"
              }`}
              onClick={handleRunOneGoAssessment}
              disabled={isOneGoDisabled}
              title={
                !hasAllRequiredTemplatesUploaded
                  ? "Upload all required templates before running the One‑Go Assessment."
                  : ""
              }
            >
              {isOneGoLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Running One‑Go Assessment...
                </>
              ) : (
                <>
                  Run One‑Go Assessment
                  <span className="material-symbols-outlined ms-1">
                    flash_on
                  </span>
                </>
              )}
            </button>

            {!hasAllRequiredTemplatesUploaded && (
              <div className="one-go-status one-go-status-info">
                Upload all required templates to enable the One‑Go Assessment.
              </div>
            )}

            {isOneGoSuccess && hasAllRequiredTemplatesUploaded && (
              <div className="one-go-status one-go-status-success">
                ✓ All assessment data has been prefetched. You can now navigate
                through the tabs instantly.
              </div>
            )}

            {isError && (
              <div className="one-go-status one-go-status-error">
                <div>
                  One‑Go Assessment failed.{" "}
                  {typeof oneGoError === "string"
                    ? `Reason: ${oneGoError}`
                    : oneGoError?.message
                    ? `Reason: ${oneGoError.message}`
                    : "Please try again."}
                </div>

                <button
                  type="button"
                  className="one-go-clear-cache-btn"
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.85rem",
                    borderRadius: "999px",
                    border: "1px solid #8236ff",
                    background: "#fff",
                    color: "#8236ff",
                    cursor: "pointer",
                  }}
                  onClick={async () => {
                    await purgePersistedState();
                    window.location.reload();
                  }}
                >
                  Clear cache and retry
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className={`drag-drop-zone${dragActive ? " drag-active" : ""}`}
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={onDrag}
          onDrop={onDrop}
          tabIndex={-1}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.pdf,.csv"
            multiple
            style={{ display: "none" }}
            onChange={onInputChange}
          />
          <div className="drag-drop-content">
            <div
              className="upload-icon"
              style={{
                fontSize: "2.5rem",
                color: "rgba(117, 0, 192, 1)",
                cursor: "pointer",
              }}
              onClick={onBrowseClick}
            >
              <span className="material-symbols-outlined fs-2">
                upload_file
              </span>
            </div>
            <div className="upload-text">
              <span
                className="upload-browse clickable"
                onClick={onBrowseClick}
              >
                Click to Browse
              </span>{" "}
              or drag and drop
            </div>
            <div className="supported-formats">
              .csv, .xlsx, .xls, or .pdf
            </div>
          </div>
        </div>

        <div className="uploaded-files-list" style={{ marginTop: "1.5rem" }}>
          {(isLoading ||
            uploadedFiles.some((f) => f.status === "uploading")) && <Loader />}
          {uploadedFiles.length === 0 && (
            <span className="no-files">No files uploaded yet.</span>
          )}
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className={`uploaded-file-panel ${getBoxClass(file.status)}`}
            >
              <div className="uploaded-file-panel-header">
                <span>
                  <span style={{ marginRight: 7 }}>
                    {file.status === "success" && (
                      <span style={{ color: "#1eb06d" }}>✔</span>
                    )}
                    {file.status === "error" && (
                      <span style={{ color: "#e7511e" }}>✖</span>
                    )}
                    {file.status === "uploading" && (
                      <span style={{ color: "#8236FF" }}>⏳</span>
                    )}
                  </span>
                  <strong>{file.name}</strong>
                </span>
                <div className="file-panel-actions">
                  {file.status === "error" && file.file && (
                    <span
                      className="icon-download"
                      title="Download"
                      style={{ cursor: "pointer", marginRight: "7px" }}
                      onClick={() => downloadFile(file)}
                    >
                      ⬇️
                    </span>
                  )}
                  <span
                    className="icon-delete"
                    onClick={() => removeFile(file.id)}
                    title="Remove"
                    style={{ cursor: "pointer" }}
                  >
                    🗑️
                  </span>
                </div>
              </div>
              <div className="file-status-message">
                {file.status === "success" && (
                  <span className="status-box success">{file.message}</span>
                )}
                {file.status === "error" && (
                  <span className="status-box error">{file.message}</span>
                )}
                {file.status === "uploading" && (
                  <>
                    <span className="status-box uploading">
                      {file.message}
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-inner"
                        style={{ width: file.progress + "%" }}
                      />
                    </div>
                  </>
                )}
              </div>
              {file.detail && (
                <div
                  className="file-detail"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "normal",
                    maxWidth: "100%",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                    }}
                  >
                    {file.detail}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Re-upload Executive Summary PPT */}
      <div className="reupload-section">
        <div className="reupload-text-block">
          <div className="reupload-title">Upload Executive Summary PPT</div>
          <div className="reupload-desc">
            Upload / Re-upload an updated presentation file that will be used as knowledge reference for the assessment
          </div>
        </div>
        <div className="reupload-upload-block">
          <input
            ref={pptInputRef}
            type="file"
            accept=".pptx,.ppt"
            style={{ display: "none" }}
            onChange={handlePptUpload}
          />
          <button
            type="button"
            className={`reupload-btn ${isPptUploading ? "uploading" : ""}`}
            onClick={() => pptInputRef.current?.click()}
            disabled={isPptUploading}
          >
            {isPptUploading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Uploading PPT...
              </>
            ) : (
              <>
                Re-upload PPT
                <span className="material-symbols-outlined ms-2">
                  upload_file
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal */}
      <ConfidentialDisclaimerModal
        open={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
        onAccept={() => {
          setShowDisclaimer(false);
          downloadAllTemplates();
        }}
      />

            {/* Simple PPT status modal */}
      {pptModal.open && (
        <div className="ppt-modal-backdrop">
          <div className="ppt-modal">
            <div className="ppt-modal-header">
              <span
                className={
                  pptModal.type === "success"
                    ? "ppt-modal-title ppt-modal-title-success"
                    : "ppt-modal-title ppt-modal-title-error"
                }
              >
                {pptModal.title}
              </span>
              <button
                type="button"
                className="ppt-modal-close"
                onClick={() =>
                  setPptModal((prev) => ({ ...prev, open: false }))
                }
              >
                ×
              </button>
            </div>

            <div className="ppt-modal-body">
              <p className="ppt-modal-message">{pptModal.message}</p>
            </div>

            <div className="ppt-modal-footer">
              <button
                type="button"
                className="ppt-modal-button"
                onClick={() =>
                  setPptModal((prev) => ({ ...prev, open: false }))
                }
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FileUploadContainer;
--

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
import {
  persistor,
  updateMetaTimestamp,
  purgePersistedState,
} from "./store";
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

  // ── ✅ NEW: Runtime expiry check every 5 minutes ───────────────
  useEffect(() => {
    const checkExpiry = () => {
      const persisted = localStorage.getItem("persist:root");
      if (!persisted) return;
      try {
        const parsed = JSON.parse(persisted);
        const meta = parsed.meta ? JSON.parse(parsed.meta) : null;
        if (!meta) return;
        const age = Date.now() - (meta.lastPersistedAt ?? 0);
        if (age > 24 * 60 * 60 * 1000) {
          dispatch({ type: "meta/EXPIRE" });
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    checkExpiry(); // run immediately on mount
    const interval = setInterval(checkExpiry, 5 * 60 * 1000); // every 5 min
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
    <Router future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppInner {...props} />
    </Router>
  );
}

export default App;

--

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import "../../assets/css/botloader.css"; // Your CSS file

const BotLoader = () => {
  const messages = useMemo(
    () => [
      "Working on it...",
      "Fetching data from database...",
      "Loading the results...",
      "Analyzing your query...",
      "Generating response...",
    ],
    []
  );

  const [currentMessage, setCurrentMessage] = useState(messages[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => {
        const nextIndex = (messages.indexOf(prev) + 1) % messages.length;
        return messages[nextIndex];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [messages]);

  const loaderContent = (
    <div className="bot-loader">
      <div className="bot-loader-container">
        <span className="material-symbols-outlined robot-icon">robot_2</span>
        <p className="loading-text">{currentMessage}</p>
      </div>
    </div>
  );

  return createPortal(loaderContent, document.body);
};

export default BotLoader;
