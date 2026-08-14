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
