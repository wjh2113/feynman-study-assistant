import React, { useEffect, useState } from "react";
import { X } from "./icons.jsx";
import { Spinner } from "./Spinner.jsx";

export function RenameProjectModal({ title, busy = false, onClose, onSave }) {
  const [value, setValue] = useState(title || "");

  useEffect(() => {
    setValue(title || "");
  }, [title]);

  const submit = () => {
    const next = String(value || "").trim();
    if (!next || busy) return;
    onSave?.(next);
  };

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onClose}>
      <div className="modal rename-modal" role="dialog" aria-modal="true" aria-labelledby="rename-project-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span id="rename-project-title">学科改名</span>
            <small>只改显示名称，资料与对练记录会保留</small>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={19} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="rename-project-input">学科名称</label>
            <input
              id="rename-project-input"
              autoFocus
              value={value}
              disabled={busy}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="例如：思考与表达技巧"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="primary-btn" type="button" onClick={submit} disabled={busy || !value.trim()}>
            {busy ? <><Spinner /> 保存中</> : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
