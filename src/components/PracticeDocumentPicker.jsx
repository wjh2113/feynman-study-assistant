import React from "react";

export function PracticeDocumentPicker({
  sources = [],
  selectedIds = [],
  onChange,
  label = "练习资料"
}) {
  const selected = new Set(selectedIds || []);
  const allIds = (sources || []).map((source) => source.id).filter(Boolean);

  const toggle = (id) => {
    if (!onChange) return;
    const next = selected.has(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const selectAll = () => onChange?.(allIds);
  const clearAll = () => onChange?.([]);

  return (
    <section className="practice-doc-picker" aria-label={label}>
      <header className="practice-doc-picker-head">
        <div>
          <span className="section-kicker">{label}</span>
          <strong>{selected.size ? `已选 ${selected.size} 份` : "请勾选要练习的资料"}</strong>
        </div>
        <div className="practice-doc-picker-actions">
          <button type="button" className="text-btn" onClick={selectAll} disabled={!allIds.length}>全选</button>
          <button type="button" className="text-btn" onClick={clearAll} disabled={!selected.size}>清空</button>
        </div>
      </header>
      {!sources.length ? (
        <p className="practice-doc-picker-empty">还没有可练习的资料，请先在「学习资料」上传并完成解析。</p>
      ) : (
        <ul className="practice-doc-picker-list">
          {sources.map((source) => (
            <li key={source.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(source.id)}
                  onChange={() => toggle(source.id)}
                />
                <span>{source.name || source.id}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
