import React from "react";
import { FileText } from "../../components/icons.jsx";

export function FileTypeIcon({ name }) {
  const ext = name.split(".").pop()?.toUpperCase();
  return <div className={`file-icon ${ext?.toLowerCase()}`}><FileText size={19} /><small>{ext}</small></div>;
}
