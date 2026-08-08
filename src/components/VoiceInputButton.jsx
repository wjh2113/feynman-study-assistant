import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "./icons.jsx";

export function VoiceInputButton({ onTranscript, showToast, disabled = false, className = "" }) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      try { recognition.abort(); } catch {}
    }
  }, []);

  useEffect(() => () => {
    stopRecognition();
  }, [stopRecognition]);

  useEffect(() => {
    if (disabled && recognitionRef.current) stopRecognition();
  }, [disabled, stopRecognition]);

  const toggle = useCallback(() => {
    if (listening) {
      stopRecognition();
      return;
    }
    if (!supported) {
      showToast("当前浏览器不支持语音识别，请使用最新版 Chrome 或 Edge");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalBuffer = "";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let interimText = "";
      let newFinalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          newFinalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (newFinalText) {
        finalBuffer += newFinalText;
        onTranscript(finalBuffer.trim());
        finalBuffer = "";
      } else if (interimText) {
        onTranscript((finalBuffer + interimText).trim());
      }
    };
    recognition.onerror = (event) => {
      const messages = {
        "not-allowed": "麦克风权限未开启，请允许浏览器访问麦克风",
        "audio-capture": "没有检测到可用的麦克风",
        "no-speech": "没有识别到语音，请靠近麦克风后重试",
        network: "语音识别服务暂时不可用，请检查网络后重试",
        "service-not-allowed": "语音识别服务不可用，请检查浏览器设置",
        "bad-grammar": "语音识别语法错误",
        "language-not-supported": "当前浏览器不支持中文语音识别"
      };
      if (event.error !== "aborted" && event.error !== "no-speech") {
        showToast(messages[event.error] || `语音识别失败：${event.error}`);
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setListening(false);
        recognitionRef.current = null;
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setListening(false);
      showToast(error.message || "无法启动语音识别");
    }
  }, [listening, supported, onTranscript, showToast, stopRecognition]);

  return (
    <button
      type="button"
      className={`voice-input-btn ${listening ? "listening" : ""} ${className}`.trim()}
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? "停止语音输入" : "开始语音输入"}
      title={listening ? "停止语音输入" : "语音输入"}
    >
      {listening ? <Square size={13} /> : <Mic size={16} />}
      <span>{listening ? "停止" : "语音"}</span>
    </button>
  );
}
