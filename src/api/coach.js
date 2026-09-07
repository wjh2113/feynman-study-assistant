import { fetchJsonWithTimeout } from "./client.js";

export function askCoach(body, timeoutMs = 100_000) {
  return fetchJsonWithTimeout("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs, "费曼教练");
}

export function diagnoseCoach(body, timeoutMs = 90_000) {
  return fetchJsonWithTimeout("/api/coach/diagnosis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs, "对练诊断");
}

export function generatePracticeQuestions(projectId, documentIds = [], timeoutMs = 100_000) {
  return fetchJsonWithTimeout(
    `/api/projects/${encodeURIComponent(projectId)}/practice-questions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds })
    },
    timeoutMs,
    "按所选资料出题"
  );
}
