import { apiFetch, fetchJsonWithTimeout } from "./client.js";

export function getRagHistory(projectId, limit = 50) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/rag-history?limit=${limit}`);
}

export function saveRagHistory(projectId, body) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/rag-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function askRag(body, timeoutMs = 60_000) {
  return fetchJsonWithTimeout("/api/rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs, "资料问答");
}
