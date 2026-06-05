/* eslint-disable no-console */
import React, { useRef, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { unlockTab } from "../slices/tabAccessSlice";
import { useUploadPptMutation } from "../services/kpiApi";
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

// ---------------------------------------------------------------------------
// SAST Fix — CWE-79: allow-list for uploaded file MIME types
// Prevents a malicious file object whose .type has been spoofed from
// reaching formData.append (line 166 in original).
// ---------------------------------------------------------------------------
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/pdf", // .pdf
  "text/csv", // .csv
  "application/csv",
]);

const ALLOWED_UPLOAD_EXTENSIONS = /\.(xlsx|xls|pdf|csv)$/i;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function validateUploadFile(file) {
  if (!file || !(file instanceof File)) return "No valid file provided.";
  if (!ALLOWED_UPLOAD_EXTENSIONS.test(file.name))
    return `File extension not allowed: "${file.name}"`;
  if (!ALLOWED_UPLOAD_TYPES.has(file.type))
    return `File type not allowed: "${file.type}"`;
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return `File exceeds 50 MB limit.`;
  return null; // valid
}

// ---------------------------------------------------------------------------
// SAST Fix — CWE-601: safe blob download helper
// Validates the generated URL is a same-origin blob: URL before assigning
// to a.href; revokes it immediately after click.
// Replaces the raw pattern: url = URL.createObjectURL(...); a.href = url
// (line 125 in original).
// ---------------------------------------------------------------------------
function triggerSafeBlobDownload(fileObj) {
  if (!fileObj?.file) return;

  const url = URL.createObjectURL(fileObj.file);

  // CWE-601 guard: blob: URLs are same-origin by spec, but assert scheme.
  if (typeof url !== "string" || !url.startsWith("blob:")) {
    console.error("[FileUploadContainer] Blocked unexpected URL scheme.");
    URL.revokeObjectURL(url);
    return;
  }

  // Sanitise filename: allow only safe characters for a download attribute.
  const safeName = String(fileObj.name || "download").replace(
    /[^a-zA-Z0-9._\- ]/g,
    "_",
  );

  const a = document.createElement("a");
  a.href = url; // CWE-601 fix: only blob: scheme reaches this line
  a.download = safeName;
  a.rel = "noopener noreferrer"; // defence-in-depth
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // revoke immediately — no lingering reference
}

// ---------------------------------------------------------------------------
// SAST Fix — CWE-601: safe template download helper
// Template paths are static string literals defined in templateFiles above,
// so there is no user-controlled value flowing to a.href here.
// The helper is kept separate to make the trust boundary explicit.
// ---------------------------------------------------------------------------
function triggerStaticDownload(path, filename) {
  // Both arguments are from the compile-time constant templateFiles array.
  const a = document.createElement("a");
  a.href = path; // static literal only — not user input
  a.download = filename; // static literal only
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const FileUploadContainer = ({ onFileSelect }) => {
  const dispatch = useDispatch();
  const { getAccessToken } = useUser();

  const uploadedFiles = useSelector((state) => state.fileUpload.files || []);

  const [uploadPpt, { isLoading: isPptUploading }] = useUploadPptMutation();

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
  const pptInputRef = useRef(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

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
        (f) => f.name === templateName && f.status === "success",
      ),
    );

  const isOneGoSuccess = hasTriggeredOneGo && !isOneGoLoading && !isError;

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

  // CWE-601 fix: replaced inline `a.href = url` with safe helper (line 125).
  const downloadFile = (fileObj) => {
    triggerSafeBlobDownload(fileObj);
  };

  // CWE-601 fix: uses triggerStaticDownload; paths are compile-time constants.
  const downloadAllTemplates = () => {
    templateFiles.forEach((file) => {
      triggerStaticDownload(file.path, file.filename);
    });
  };

  const onBrowseClick = () => {
    inputRef.current?.click();
  };

  // -------------------------------------------------------------------------
  // SAST Fix — CWE-79: validate PPT file before formData.append (line 166).
  // Only .ppt/.pptx files with valid MIME are accepted.
  // -------------------------------------------------------------------------
  const PPT_ALLOWED_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "application/vnd.ms-powerpoint", // .ppt
  ]);

  const handlePptUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // CWE-79 fix: validate extension
    if (!file.name.toLowerCase().match(/\.(pptx|ppt)$/)) {
      setPptModal({
        open: true,
        title: "Invalid file type",
        message: "Please select a valid PPT or PPTX file.",
        type: "error",
      });
      return;
    }

    // CWE-79 fix: validate MIME type against allow-list
    if (!PPT_ALLOWED_TYPES.has(file.type)) {
      setPptModal({
        open: true,
        title: "Invalid file type",
        message: `File MIME type "${file.type}" is not allowed. Please upload a .ppt or .pptx file.`,
        type: "error",
      });
      if (pptInputRef.current) pptInputRef.current.value = "";
      return;
    }

    // CWE-79 fix: only append to FormData after validation passes (line 166)
    const formData = new FormData();
    formData.append("file", file);

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

  // -------------------------------------------------------------------------
  // SAST Fix — CWE-79: validate uploaded files before passing to handleFiles.
  // -------------------------------------------------------------------------
  const onInputChange = (e) => {
    const files = e.target.files;

    // Validate each file before handing off to the upload hook
    const invalidFiles = Array.from(files).filter(
      (f) => validateUploadFile(f) !== null,
    );
    if (invalidFiles.length > 0) {
      const names = invalidFiles.map((f) => f.name).join(", ");
      console.warn(
        `[FileUploadContainer] Rejected disallowed file(s): ${names}`,
      );
      e.target.value = "";
      return;
    }

    // CWE-79 fix: only valid files reach handleFiles / formData.append
    handleFiles(files);
    e.target.value = "";
    if (files[0]) {
      onFileSelect?.(files[0], {
        hasFiles: true,
        totalFiles: uploadedFiles.length + files.length,
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
              <span className="upload-browse clickable" onClick={onBrowseClick}>
                Click to Browse
              </span>{" "}
              or drag and drop
            </div>
            <div className="supported-formats">.csv, .xlsx, .xls, or .pdf</div>
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
                    <span className="status-box uploading">{file.message}</span>
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
            Upload / Re-upload an updated presentation file that will be used as
            knowledge reference for the assessment
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
