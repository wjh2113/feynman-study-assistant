import { fetchJsonWithTimeout } from "./client.js";
import { evaluateAnswerOffline } from "../lib/offline-coach.js";
import { isLikelyOfflineError } from "../lib/runtime.js";

export async function askCoach(body, timeoutMs = 100_000) {
  try {
    return await fetchJsonWithTimeout("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }, timeoutMs, "费曼教练");
  } catch (error) {
    if (!isLikelyOfflineError(error) && navigator.onLine !== false) throw error;
    return evaluateAnswerOffline(body);
  }
}

export function diagnoseCoach(body, timeoutMs = 90_000) {
  return fetchJsonWithTimeout("/api/coach/diagnosis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs, "对练诊断").catch((error) => {
    if (!isLikelyOfflineError(error) && navigator.onLine !== false) throw error;
    return {
      diagnosis: {
        summary: "当前处于离线模式，暂无法生成完整学习诊断。联网后可重新生成。",
        strengths: ["已完成本地对练与评分"],
        gaps: ["网络恢复后建议再跑一轮正式教练诊断"],
        nextSteps: ["保持联网后打开本会话，或重新开始一轮对练"],
        offline: true
      }
    };
  });
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
