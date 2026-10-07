import React, { useRef, useState } from "react";
import { Mic, Square } from "./icons.jsx";
import { VoiceInputSheet } from "./VoiceInputSheet.jsx";

/**
 * Opens VoiceInputSheet: record → AI ASR + refine → confirm into the target field.
 * inline：不弹全屏层，点击开始/再点结束，转写直接写入当前页输入框。
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
  purpose = "",
  asyncMode = false,
  inline = false
}) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const sheetRef = useRef(null);

  const handleRecordingChange = (isRecording, isProcessing) => {
    setRecording(Boolean(isRecording));
    setProcessing(Boolean(isProcessing));
  };

  const handleClick = () => {
    if (disabled) return;
    if (!inline) {
      setOpen(true);
      return;
    }
    if (!open) {
      setOpen(true);
      return;
    }
    sheetRef.current?.toggleRecord();
  };

  const label = processing ? "识别中" : recording ? "结束" : "语音";

  return (
    <>
      <button
        type="button"
        className={`voice-input-btn ${recording ? "listening" : ""} ${processing ? "processing" : ""} ${className}`.trim()}
        onClick={handleClick}
        disabled={disabled || processing}
        aria-label={recording ? "结束录音" : "语音输入"}
        title={recording ? "再点一次结束录音" : title}
      >
        {recording ? <Square size={14} /> : <Mic size={16} />}
        <span>{label}</span>
      </button>
      <VoiceInputSheet
        ref={sheetRef}
        open={open}
        onClose={() => {
          setOpen(false);
          setRecording(false);
          setProcessing(false);
        }}
        showToast={showToast}
        title={title}
        tip={tip}
        placeholder={placeholder}
        confirmLabel={confirmLabel}
        purpose={purpose}
        asyncMode={asyncMode}
        inline={inline}
        autoStart={inline}
        onRecordingChange={handleRecordingChange}
        onConfirm={(text, meta) => onTranscript?.(text, meta)}
      />
    </>
  );
}
