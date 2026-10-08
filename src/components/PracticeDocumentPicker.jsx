import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText } from "./icons.jsx";
import { dedupeAnalysisSources } from "../lib/analysis-sources.mjs";
import { supportsMaterialUpload } from "../lib/runtime.js";

function summarizeSelection(visibleSources, selectedIds) {
  const selected = visibleSources.filter((source) => selectedIds.includes(source.id));
  if (!selected.length) return "未选择资料";
  if (selected.length === 1) return selected[0].name || selected[0].id;
  if (selected.length === visibleSources.length) return `全部 ${selected.length} 份资料`;
  const first = selected[0].name || selected[0].id;
  return `${first} 等 ${selected.length} 份`;
}

export function PracticeDocumentPicker({
  sources = [],
  selectedIds = [],
  onChange,
  label = "练习资料"
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const visibleSources = useMemo(() => dedupeAnalysisSources(sources), [sources]);
  const selected = new Set(selectedIds || []);
  const allIds = visibleSources.map((source) => source.id).filter(Boolean);
  const summary = summarizeSelection(visibleSources, selectedIds || []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (id) => {
    if (!onChange) return;
    const next = selected.has(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <section className="practice-doc-picker practice-doc-picker--compact" aria-label={label} ref={rootRef}>
      <div className="practice-doc-picker-row">
        <span className="practice-doc-picker-label">{label}</span>
        <button
          type="button"
          className={`practice-doc-select ${open ? "open" : ""} ${selected.size ? "has-value" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={!visibleSources.length}
          onClick={() => setOpen((value) => !value)}
        >
          <FileText size={15} />
          <span className="practice-doc-select-text">{visibleSources.length ? summary : "暂无资料"}</span>
          <em>{selected.size || 0}/{allIds.length || 0}</em>
          <ChevronDown size={15} />
        </button>
        <div className="practice-doc-picker-actions">
          <button type="button" className="text-btn" onClick={() => onChange?.(allIds)} disabled={!allIds.length}>全选</button>
          <button type="button" className="text-btn" onClick={() => onChange?.([])} disabled={!selected.size}>清空</button>
        </div>
      </div>

      {!visibleSources.length ? (
        <p className="practice-doc-picker-empty">
          {supportsMaterialUpload()
            ? "还没有可练习的资料，请先在「学习资料」上传并完成解析。"
            : "还没有可练习的资料，请先在电脑网页端「学习资料」上传并完成解析。"}
        </p>
      ) : open ? (
        <ul className="practice-doc-dropdown" role="listbox" aria-multiselectable="true">
          {visibleSources.map((source) => {
            const checked = selected.has(source.id);
            return (
              <li key={source.id} role="option" aria-selected={checked}>
                <label className={`practice-doc-option ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(source.id)}
                  />
                  <span>{source.name || source.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
