import { apiFetch } from "./client.js";

export function listIngestions(status = "waiting,active") {
  return apiFetch(`/api/ingestions?status=${encodeURIComponent(status)}`);
}

export function getIngestion(ingestionId) {
  return apiFetch(`/api/ingestions/${encodeURIComponent(ingestionId)}`);
}

export function retryIngestion(ingestionId) {
  return apiFetch(`/api/ingestions/${encodeURIComponent(ingestionId)}/retry`, { method: "POST" });
}

export async function analyzeBackground(formData) {
  const response = await fetch("/api/analyze?background=true", { method: "POST", body: formData, credentials: "same-origin" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: response.status === 413
      ? "上传被拒绝：单个文件不超过 100 MB，一次最多 12 个文件；若仍失败请联系管理员检查服务器上传限制"
      : `分析接口返回了异常响应（HTTP ${response.status}）` };
  }
  if (!response.ok) throw new Error(data.error || "分析失败");
  return data;
}
