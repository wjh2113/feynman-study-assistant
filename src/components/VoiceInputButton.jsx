import React, { useState } from "react";
import { Mic } from "./icons.jsx";
import { VoiceInputSheet } from "./VoiceInputSheet.jsx";

/**
 * Opens VoiceInputSheet: record → AI ASR + refine → confirm into the target field.
 */
export function VoiceInputButton({
  onTranscript,
  showToast,
  disabled = false,
  className = "",
  title = "语音输入",
  tip = "点击录音，说完后由 AI 识别并修正",
  placeholder = "识别结果会出现在这里，也可以手动修改…",
  confirmLabel = "确认",
  purpose = ""
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`voice-input-btn ${className}`.trim()}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="语音输入"
        title="语音输入"
      >
        <Mic size={16} />
        <span>语音</span>
      </button>
      <VoiceInputSheet
        open={open}
        onClose={() => setOpen(false)}
        showToast={showToast}
        title={title}
        tip={tip}
        placeholder={placeholder}
        confirmLabel={confirmLabel}
        purpose={purpose}
        onConfirm={(text) => onTranscript?.(text)}
      />
    </>
  );
}
