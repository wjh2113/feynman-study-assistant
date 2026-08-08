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
