import { apiFetch, fetchJsonWithTimeout } from "./client.js";

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

export function deleteProject(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE"
  });
}

export function deleteDocument(projectId, documentId) {
  return fetchJsonWithTimeout(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
    15_000,
    "删除资料"
  );
}

export function reindexProject(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/reindex`, { method: "POST" });
}

export function resummarizeProject(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/resummarize`, { method: "POST" });
}

export function syncProjectSources(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sync-sources`, { method: "POST" });
}

export function listChapters(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/chapters`);
}

export function createChapter(projectId, body) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
}

export function updateChapterApi(projectId, chapterId, body) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
}

export function deleteChapterApi(projectId, chapterId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "DELETE"
  });
}

export function listSessions(projectId, { chapterId, documentIds } = {}) {
  const params = new URLSearchParams();
  if (chapterId) params.set("chapterId", chapterId);
  if (Array.isArray(documentIds) && documentIds.length) {
    params.set("documentIds", documentIds.join(","));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sessions${query}`);
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

export function variantQuestion(projectId, blindspotId, { chapterId, documentIds } = {}) {
  const body = {};
  if (chapterId) body.chapterId = chapterId;
  if (Array.isArray(documentIds) && documentIds.length) body.documentIds = documentIds;
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/blindspots/${encodeURIComponent(blindspotId)}/variant-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function generateOnePager(project, { chapter, documentIds, practiceDocumentIds, practiceDocs } = {}) {
  return fetchJsonWithTimeout("/api/one-pager", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      chapter,
      documentIds: documentIds || practiceDocumentIds,
      practiceDocumentIds,
      practiceDocs
    })
  }, 200_000, "一页纸生成");
}

export function generateLearningPlan({ title, goal, level }) {
  return apiFetch("/api/learning-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, goal, level })
  });
}
