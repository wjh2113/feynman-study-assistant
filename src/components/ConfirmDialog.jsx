import React, { useEffect } from "react";
import { CircleAlert, LogOut, X } from "./icons.jsx";

const ICONS = {
  danger: LogOut,
  warn: CircleAlert,
  default: CircleAlert
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  tone = "default",
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const Icon = ICONS[tone] || ICONS.default;

  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={onCancel}>
      <div
        className={`modal confirm-modal tone-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-btn confirm-close" onClick={onCancel} aria-label="关闭">
          <X size={18} />
        </button>
        <div className={`confirm-icon tone-${tone}`}>
          <Icon size={22} />
        </div>
        <h2 id="confirm-dialog-title">{title}</h2>
        {description && <p>{description}</p>}
        <div className="confirm-actions">
          <button type="button" className="secondary-btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={tone === "danger" ? "danger-btn" : "primary-btn"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
