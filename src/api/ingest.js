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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "分析失败");
  return data;
}
