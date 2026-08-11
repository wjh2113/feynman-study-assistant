export async function transcribeVoice(blob, { purpose = "", signal } = {}) {
  const body = new FormData();
  const extension = (blob.type || "").includes("mp4") ? "m4a" : "webm";
  body.append("audio", blob, `recording.${extension}`);
  if (purpose) body.append("purpose", purpose);

  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body,
    credentials: "same-origin",
    signal
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: `语音识别接口返回了异常响应（HTTP ${response.status}）` };
  }
  if (!response.ok) throw new Error(data.error || "语音识别失败");
  return data;
}
