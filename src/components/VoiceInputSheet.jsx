import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, Square, X } from "./icons.jsx";
import { Spinner } from "./Spinner.jsx";
import { transcribeVoice } from "../api/voice.js";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function VoiceInputSheet({
  open,
  onClose,
  showToast,
  title = "语音输入",
  tip = "点击录音，说完后由 AI 识别并修正",
  placeholder = "识别结果会出现在这里，也可以手动修改…",
  confirmLabel = "确认填入",
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
  const busyRef = useRef(false);
  const recordingRef = useRef(false);
  const processingRef = useRef(false);
  const filledRef = useRef(false);
  const transcriptBoxRef = useRef(null);
  const openRef = useRef(open);

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [livePreview, setLivePreview] = useState("");
  const [voiceTip, setVoiceTip] = useState(tip);
  const [filled, setFilled] = useState(false);
  const [statusLine, setStatusLine] = useState("");

  openRef.current = open;

  const setTranscriptSafe = (value) => {
    const next = String(value || "");
    transcriptRef.current = next;
    setTranscript(next);
  };
  const setLivePreviewSafe = (value) => {
    const next = String(value || "");
    livePreviewRef.current = next;
    setLivePreview(next);
  };
  const setRecordingSafe = (value) => {
    recordingRef.current = Boolean(value);
    setRecording(Boolean(value));
  };
  const setProcessingSafe = (value) => {
    processingRef.current = Boolean(value);
    setProcessing(Boolean(value));
  };

  const focusTranscript = () => {
    window.setTimeout(() => {
      const box = transcriptBoxRef.current;
      if (!box) return;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      try { box.focus(); } catch { /* ignore */ }
    }, 40);
  };

  const stopBrowserRecognition = useCallback(async ({ graceful = false } = {}) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    try { recognition.onerror = null; } catch { /* ignore */ }
    try { recognition.onend = null; } catch { /* ignore */ }
    if (graceful) {
      // Keep onresult briefly so the last final segment can land.
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          try { recognition.onresult = null; } catch { /* ignore */ }
          resolve();
        };
        const previous = recognition.onresult;
        recognition.onresult = (event) => {
          try { previous?.(event); } catch { /* ignore */ }
        };
        recognition.onend = finish;
        window.setTimeout(finish, 600);
        try { recognition.stop(); } catch { finish(); }
      });
      return;
    }
    try { recognition.onresult = null; } catch { /* ignore */ }
    try { recognition.stop(); } catch { /* ignore */ }
    try { recognition.abort(); } catch { /* ignore */ }
  }, []);

  const cleanupMedia = useCallback(() => {
    void stopBrowserRecognition({ graceful: false });
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* ignore */ }
    recorderRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, [stopBrowserRecognition]);

  const resetUi = useCallback(() => {
    busyRef.current = false;
    filledRef.current = false;
    setRecordingSafe(false);
    setProcessingSafe(false);
    setFilled(false);
    setTranscriptSafe("");
    setLivePreviewSafe("");
    setVoiceTip(tip);
    setStatusLine("");
    finalBrowserTextRef.current = "";
  }, [tip]);

  const cancelAll = useCallback(() => {
    cancelledRef.current = true;
    sessionRef.current += 1;
    busyRef.current = false;
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
      busyRef.current = false;
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
      setVoiceTip("正在录音… 当前浏览器无实时转写，结束后仍会用 AI 识别并显示在下方");
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
      if (recognitionRef.current === recognition && recorderRef.current?.state === "recording") {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceTip("正在录音… 实时转写未能启动，结束后会用 AI 识别并显示在下方");
    }
  };

  const beginRecording = async () => {
    if (busyRef.current || recordingRef.current || processingRef.current) return;
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
    filledRef.current = false;
    setFilled(false);
    sessionRef.current += 1;
    busyRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current || !openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        busyRef.current = false;
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      finalBrowserTextRef.current = "";
      setTranscriptSafe("");
      setLivePreviewSafe("");
      setStatusLine("");

      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setVoiceTip("录音失败，请重试");
        setRecordingSafe(false);
        setProcessingSafe(false);
        busyRef.current = false;
        cleanupMedia();
      };
      recorder.start(200);
      setRecordingSafe(true);
      setProcessingSafe(false);
      setVoiceTip(
        getSpeechRecognition()
          ? "正在录音… 下方会实时显示转写；点结束后会显示最终识别结果"
          : "正在录音… 点结束后会在下方显示 AI 识别结果"
      );
      startBrowserRecognition();
      focusTranscript();
    } catch {
      busyRef.current = false;
      setVoiceTip("麦克风权限未开启。请点击地址栏左侧图标，允许本站使用麦克风。");
      showToast?.("麦克风权限未开启");
      cleanupMedia();
    }
  };

  const pushToTarget = (text, { close = false } = {}) => {
    const value = String(text || "").trim();
    if (!value) return false;
    onConfirm?.(value);
    filledRef.current = true;
    setFilled(true);
    showToast?.(close ? "语音识别完成，已填入" : "识别结果已显示，并写入输入框");
    if (close) onClose?.();
    return true;
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !recorderRef.current || processingRef.current) return;
    const session = sessionRef.current;
    setRecordingSafe(false);
    setProcessingSafe(true);
    setStatusLine("正在生成识别结果…");
    setVoiceTip("录音已结束，正在识别并显示结果…");

    // Let SpeechRecognition flush the last finals into our refs/textarea.
    await stopBrowserRecognition({ graceful: true });
    await wait(120);

    const browserDraft = (
      livePreviewRef.current
      || transcriptRef.current
      || finalBrowserTextRef.current
      || ""
    ).trim();
    if (browserDraft) {
      setTranscriptSafe(browserDraft);
      setStatusLine("已显示浏览器转写，正在用 AI 修正…");
      focusTranscript();
    } else {
      // Keep the box visibly “working” so users don’t think nothing happened.
      setTranscriptSafe("");
      setStatusLine("正在调用 AI 识别，结果会显示在下方…");
    }

    const recorder = recorderRef.current;
    if (!recorder) {
      setProcessingSafe(false);
      busyRef.current = false;
      if (browserDraft) {
        setVoiceTip("录音设备已结束，可确认下方转写");
      } else {
        setVoiceTip("没有录到有效声音，请重试");
        setStatusLine("");
      }
      return;
    }

    const mimeType = recorder.mimeType || "audio/webm";
    try { recorder.requestData(); } catch { /* ignore */ }

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        // Final dataavailable can arrive just after onstop in some browsers.
        window.setTimeout(resolve, 80);
      };
      recorder.onstop = finish;
      try { recorder.stop(); } catch { finish(); }
    });
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;

    if (cancelledRef.current || session !== sessionRef.current || !openRef.current) {
      if (session === sessionRef.current) {
        setProcessingSafe(false);
        busyRef.current = false;
      }
      return;
    }

    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (!blob.size) {
      setProcessingSafe(false);
      busyRef.current = false;
      if (browserDraft) {
        setTranscriptSafe(browserDraft);
        setVoiceTip("没有录到音频文件，已保留下方转写。可点确认填入");
        setStatusLine("识别结果（浏览器转写）");
        focusTranscript();
      } else {
        setVoiceTip("没有录到有效声音，请靠近麦克风多说几秒后再结束");
        setStatusLine("");
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await transcribeVoice(blob, { purpose, signal: controller.signal });
      if (cancelledRef.current || session !== sessionRef.current || !openRef.current) return;
      const text = String(data.text || data.raw || "").trim();
      if (text) {
        setTranscriptSafe(text);
        setLivePreviewSafe("");
        setStatusLine(data.refined ? "识别结果（AI 已修正）" : "识别结果");
        setVoiceTip("识别完成，结果已显示在下方，并已写入输入框");
        focusTranscript();
        pushToTarget(text, { close: false });
      } else if (browserDraft) {
        setTranscriptSafe(browserDraft);
        setStatusLine("识别结果（浏览器转写）");
        setVoiceTip("AI 未返回文本，已保留下方转写。可点确认填入");
        focusTranscript();
      } else {
        throw new Error("没有识别到有效内容，请再说清晰一点后重试");
      }
    } catch (error) {
      if (error?.name === "AbortError" || cancelledRef.current || session !== sessionRef.current) return;
      if (browserDraft) {
        setTranscriptSafe(browserDraft);
        setStatusLine("识别结果（浏览器转写）");
        setVoiceTip(`${error.message || "AI 识别失败"}。已保留下方转写`);
        focusTranscript();
      } else {
        setStatusLine("");
        setVoiceTip(error.message || "语音识别失败，请重试");
      }
      showToast?.(error.message || "语音识别失败");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (session === sessionRef.current) {
        setProcessingSafe(false);
        busyRef.current = false;
      }
    }
  };

  const applyText = () => {
    const text = String(transcriptRef.current || transcript || "").trim();
    if (!text) {
      setVoiceTip("请先录音，等待识别结果出现在下方文本框");
      return;
    }
    pushToTarget(text, { close: true });
  };

  if (!open) return null;

  const heading = processing
    ? "识别中…"
    : recording
      ? "正在录音…"
      : transcript.trim()
        ? (filled ? "已填入，可关闭" : "识别待确认")
        : title;
  const busy = recording || processing;

  const sheet = (
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
          onClick={() => {
            if (recordingRef.current) void stopRecording();
            else void beginRecording();
          }}
          disabled={processing}
          aria-label={recording ? "结束录音" : "开始录音"}
        >
          {processing ? <Spinner /> : recording ? <Square size={28} /> : <Mic size={32} />}
        </button>
        <p className="voice-record-label">
          {processing
            ? "识别中，结果会出现在下方"
            : recording
              ? "点击结束录音"
              : filled
                ? "可再次录音，或关闭弹层"
                : "点击开始录音"}
        </p>

        <label className="voice-transcript-label" htmlFor="voice-transcript-box">
          {statusLine || "识别结果（会同步到输入框）"}
        </label>
        <textarea
          id="voice-transcript-box"
          ref={transcriptBoxRef}
          className={`voice-transcript ${recording && livePreview ? "live" : ""} ${transcript.trim() && !busy ? "ready" : ""} ${processing ? "processing" : ""}`}
          value={transcript}
          placeholder={processing ? "正在识别，请稍候…" : placeholder}
          readOnly={processing}
          onChange={(event) => {
            filledRef.current = false;
            setFilled(false);
            setTranscriptSafe(event.target.value);
          }}
        />
        {recording ? <p className="voice-live-badge">实时转写中</p> : null}
        {processing ? <p className="voice-live-badge">正在生成最终文本，请看下方结果框</p> : null}
        {!busy && transcript.trim() ? (
          <p className="voice-live-badge">{filled ? "已显示并写入输入框" : "结果已显示，待确认写入"}</p>
        ) : null}

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
            {filled ? "完成并关闭" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(sheet, document.body);
}
