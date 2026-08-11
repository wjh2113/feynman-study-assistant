import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "./icons.jsx";
import { Spinner } from "./Spinner.jsx";
import { transcribeVoice } from "../api/voice.js";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function VoiceInputSheet({
  open,
  onClose,
  showToast,
  title = "语音输入",
  tip = "点击录音，说完后由 AI 识别并修正",
  placeholder = "识别结果会出现在这里，也可以手动修改…",
  confirmLabel = "确认",
  cancelLabel = "取消",
  purpose = "",
  onConfirm
}) {
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const finalBrowserTextRef = useRef("");
  const livePreviewRef = useRef("");
  const transcriptRef = useRef("");
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);
  const sessionRef = useRef(0);

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [livePreview, setLivePreview] = useState("");
  const [voiceTip, setVoiceTip] = useState(tip);

  const setTranscriptSafe = (value) => {
    transcriptRef.current = value;
    setTranscript(value);
  };
  const setLivePreviewSafe = (value) => {
    livePreviewRef.current = value;
    setLivePreview(value);
  };

  const stopBrowserRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    try { recognition.onresult = null; } catch { /* ignore */ }
    try { recognition.onerror = null; } catch { /* ignore */ }
    try { recognition.onend = null; } catch { /* ignore */ }
    try { recognition.stop(); } catch { /* ignore */ }
    try { recognition.abort(); } catch { /* ignore */ }
  }, []);

  const cleanupMedia = useCallback(() => {
    stopBrowserRecognition();
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, [stopBrowserRecognition]);

  const resetUi = useCallback(() => {
    setRecording(false);
    setProcessing(false);
    setTranscriptSafe("");
    setLivePreviewSafe("");
    setVoiceTip(tip);
    finalBrowserTextRef.current = "";
  }, [tip]);

  const cancelAll = useCallback(() => {
    cancelledRef.current = true;
    sessionRef.current += 1;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    abortRef.current = null;
    cleanupMedia();
    resetUi();
    onClose?.();
  }, [cleanupMedia, onClose, resetUi]);

  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      sessionRef.current += 1;
      try { abortRef.current?.abort(); } catch { /* ignore */ }
      abortRef.current = null;
      cleanupMedia();
      resetUi();
      cancelledRef.current = false;
    }
  }, [open, cleanupMedia, resetUi]);

  useEffect(() => () => {
    cancelledRef.current = true;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    cleanupMedia();
  }, [cleanupMedia]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") cancelAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cancelAll]);

  const startBrowserRecognition = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceTip("正在录音… 当前浏览器无实时转写，结束后仍会用 AI 识别");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finals = "";
      let live = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finals += piece;
        else live += piece;
      }
      finalBrowserTextRef.current = finals.trim();
      const preview = `${finals}${live}`.trim();
      setLivePreviewSafe(preview);
      setTranscriptSafe(preview);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        setVoiceTip("麦克风权限未开启，仍可录音后由 AI 识别");
      }
    };

    recognition.onend = () => {
      // Keep continuous listening while MediaRecorder is active
      if (recognitionRef.current === recognition && recorderRef.current?.state === "recording") {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceTip("正在录音… 实时转写未能启动，结束后会用 AI 识别");
    }
  };

  const beginRecording = async () => {
    if (!window.isSecureContext) {
      setVoiceTip("当前不是安全连接。请使用 localhost 或 HTTPS，浏览器才会开放麦克风。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceTip("当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari。");
      showToast?.("当前浏览器不支持录音");
      return;
    }

    cancelledRef.current = false;
    sessionRef.current += 1;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      finalBrowserTextRef.current = "";
      setTranscriptSafe("");
      setLivePreviewSafe("");

      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setVoiceTip("录音失败，请重试");
        setRecording(false);
        cleanupMedia();
      };
      recorder.start(400);
      setRecording(true);
      setVoiceTip(
        getSpeechRecognition()
          ? "正在录音… 下方实时显示浏览器转写，结束后自动交给 AI 修正"
          : "正在录音… 说完后点击结束，自动交给 AI 识别并修正"
      );
      startBrowserRecognition();
    } catch {
      setVoiceTip("麦克风权限未开启。请点击地址栏左侧图标，允许本站使用麦克风。");
      showToast?.("麦克风权限未开启");
      cleanupMedia();
    }
  };

  const stopRecording = async () => {
    if (!recording || !recorderRef.current) return;
    const session = sessionRef.current;
    setRecording(false);
    setProcessing(true);
    setVoiceTip("录音结束，正在调用 AI 语音识别并修正…");

    const browserDraft = (livePreviewRef.current || transcriptRef.current || finalBrowserTextRef.current || "").trim();
    if (browserDraft) setTranscriptSafe(browserDraft);

    stopBrowserRecognition();

    const recorder = recorderRef.current;
    const mimeType = recorder.mimeType || "audio/webm";

    await new Promise((resolve) => {
      recorder.onstop = () => resolve();
      try { recorder.stop(); } catch { resolve(); }
    });
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;

    if (cancelledRef.current || session !== sessionRef.current) return;

    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (!blob.size) {
      setProcessing(false);
      if (browserDraft) {
        setVoiceTip("没有录到有效音频，可继续编辑下方浏览器转写后确认");
      } else {
        setVoiceTip("没有录到有效声音，请靠近麦克风后重试");
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await transcribeVoice(blob, { purpose, signal: controller.signal });
      if (cancelledRef.current || session !== sessionRef.current) return;
      const text = String(data.text || data.raw || "").trim();
      if (!text) throw new Error("没有识别到有效内容");
      setTranscriptSafe(text);
      setLivePreviewSafe("");
      setVoiceTip(data.refined ? "AI 已识别并修正，可再编辑后确认" : "识别完成，可再编辑后确认");
    } catch (error) {
      if (error?.name === "AbortError" || cancelledRef.current || session !== sessionRef.current) return;
      // Keep browser draft visible so user can still confirm
      if (browserDraft) {
        setTranscriptSafe(browserDraft);
        setVoiceTip(`${error.message || "AI 识别失败"}，已保留浏览器转写，可编辑后确认`);
      } else {
        setVoiceTip(error.message || "语音识别失败，请重试");
      }
      showToast?.(error.message || "语音识别失败");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (session === sessionRef.current) setProcessing(false);
    }
  };

  const applyText = () => {
    const text = transcript.trim();
    if (!text) {
      setVoiceTip("请先录音，等待识别完成");
      return;
    }
    onConfirm?.(text);
    onClose?.();
  };

  if (!open) return null;

  const heading = processing
    ? "AI 识别中…"
    : recording
      ? "正在录音…"
      : transcript.trim()
        ? "识别待确认"
        : title;
  const busy = recording || processing;

  return (
    <div
      className="voice-sheet-overlay"
      onMouseDown={() => {
        if (!busy) onClose?.();
      }}
    >
      <section
        className="voice-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="voice-sheet-handle" />
        <button type="button" className="icon-btn voice-sheet-close" onClick={cancelAll} aria-label="取消并关闭">
          <X size={18} />
        </button>

        <h2 id="voice-sheet-title">{heading}</h2>
        <p className={`voice-sheet-tip ${recording || processing ? "live" : ""}`}>{voiceTip}</p>

        <button
          type="button"
          className={`voice-record-btn ${recording ? "recording" : ""} ${processing ? "processing" : ""}`}
          onClick={recording ? stopRecording : beginRecording}
          disabled={processing}
          aria-label={recording ? "结束录音" : "开始录音"}
        >
          {processing ? <Spinner /> : recording ? <Square size={28} /> : <Mic size={32} />}
        </button>
        <p className="voice-record-label">
          {processing ? "识别并修正中" : recording ? "点击结束录音（将自动 AI 识别）" : "点击开始录音"}
        </p>

        <textarea
          className={`voice-transcript ${recording && livePreview ? "live" : ""}`}
          value={transcript}
          placeholder={placeholder}
          disabled={processing}
          onChange={(event) => setTranscriptSafe(event.target.value)}
        />
        {recording ? <p className="voice-live-badge">实时转写中</p> : null}

        <div className="voice-sheet-actions">
          <button type="button" className="secondary-btn" onClick={cancelAll}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="primary-btn voice-sheet-primary"
            disabled={!transcript.trim() || busy}
            onClick={applyText}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
