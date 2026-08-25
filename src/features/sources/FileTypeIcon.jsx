import React from "react";
import { FileText } from "../../components/icons.jsx";

function extOf(name) {
  return String(name || "").split(".").pop()?.toLowerCase() || "";
}

export function fileKind(name) {
  const ext = extOf(name);
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx"].includes(ext)) return "docx";
  if (["md", "markdown", "txt"].includes(ext)) return "txt";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "img";
  return ext || "file";
}

export function FileTypeIcon({ name, compact = false }) {
  const kind = fileKind(name);
  const label = (extOf(name) || "FILE").toUpperCase();
  return (
    <div className={`file-icon ${kind}${compact ? " compact" : ""}`}>
      <FileText size={compact ? 14 : 19} />
      <small>{label}</small>
    </div>
  );
}
