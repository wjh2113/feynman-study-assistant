import { fetchJsonWithTimeout } from "./client.js";

export function askCoach(body, timeoutMs = 55_000) {
  return fetchJsonWithTimeout("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs, "费曼教练");
}
