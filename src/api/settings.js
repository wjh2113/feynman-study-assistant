import { apiFetch } from "./client.js";

export function getHealth() {
  return apiFetch("/api/health");
}

export function getModelSettings() {
  return apiFetch("/api/settings/model");
}

export function putModelSettings(body) {
  return apiFetch("/api/settings/model", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function testModelSettings(body) {
  return apiFetch("/api/settings/model/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function getVisionSettings() {
  return apiFetch("/api/settings/vision");
}

export function putVisionSettings(body) {
  return apiFetch("/api/settings/vision", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function testVisionSettings(body) {
  return apiFetch("/api/settings/vision/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function getEmbeddingSettings() {
  return apiFetch("/api/settings/embedding");
}

export function putEmbeddingSettings(body) {
  return apiFetch("/api/settings/embedding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function testEmbeddingSettings(body) {
  return apiFetch("/api/settings/embedding/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function testRerankerSettings(body) {
  return apiFetch("/api/settings/reranker/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function exportModelConfig() {
  const response = await fetch("/api/settings/config/export", { credentials: "same-origin" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "导出响应无法解析" };
  }
  if (!response.ok) throw new Error(data.error || `导出失败（HTTP ${response.status}）`);

  const disposition = response.headers.get("Content-Disposition") || "";
  const matched = disposition.match(/filename="([^"]+)"/i);
  const filename = matched?.[1] || `zhifan-model-config-${new Date().toISOString().slice(0, 10)}.json`;
  return { payload: data, filename, text: `${JSON.stringify(data, null, 2)}\n` };
}

export function importModelConfig(payload) {
  return apiFetch("/api/settings/config/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function getPreferences() {
  return apiFetch("/api/settings/preferences");
}

export function putPreferences(body) {
  return apiFetch("/api/settings/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
