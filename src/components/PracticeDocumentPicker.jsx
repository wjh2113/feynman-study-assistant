import React, { useMemo } from "react";
import { FileTypeIcon } from "../features/sources/FileTypeIcon.jsx";
import { dedupeAnalysisSources } from "../lib/analysis-sources.mjs";

export function PracticeDocumentPicker({
  sources = [],
  selectedIds = [],
  onChange,
  label = "选择练习资料"
}) {
  const visibleSources = useMemo(() => dedupeAnalysisSources(sources), [sources]);
  const selected = new Set(selectedIds || []);
  const allIds = visibleSources.map((source) => source.id).filter(Boolean);

  const toggle = (id) => {
    if (!onChange) return;
    const next = selected.has(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <section className="practice-doc-picker" aria-label={label}>
      <header className="practice-doc-picker-head">
        <div>
          <span className="section-kicker">{label}</span>
          <strong>{selected.size ? `已选 ${selected.size} 份` : "请勾选要练习的资料"}</strong>
        </div>
        <div className="practice-doc-picker-actions">
          <button type="button" className="text-btn" onClick={() => onChange?.(allIds)} disabled={!allIds.length}>全选</button>
          <button type="button" className="text-btn" onClick={() => onChange?.([])} disabled={!selected.size}>清空</button>
        </div>
      </header>
      {!visibleSources.length ? (
        <p className="practice-doc-picker-empty">还没有可练习的资料，请先在「学习资料」上传并完成解析。</p>
      ) : (
        <ul className="practice-doc-grid">
          {visibleSources.map((source) => {
            const checked = selected.has(source.id);
            return (
              <li key={source.id}>
                <label className={`practice-doc-card ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(source.id)}
                  />
                  <FileTypeIcon name={source.name} />
                  <span>{source.name || source.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
