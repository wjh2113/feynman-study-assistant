import { apiFetch } from "./client.js";

export function listProjects() {
  return apiFetch("/api/projects");
}

export function getProject(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}`);
}

export function putProject(projectId, project) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
}

export function deleteDocument(projectId, documentId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE"
  });
}

export function reindexProject(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/reindex`, { method: "POST" });
}

export function listSessions(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sessions`);
}

export function createSession(projectId, body) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateSession(projectId, sessionId, body) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function variantQuestion(projectId, blindspotId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/blindspots/${encodeURIComponent(blindspotId)}/variant-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
}

export function generateOnePager(project) {
  return apiFetch("/api/one-pager", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project })
  });
}
