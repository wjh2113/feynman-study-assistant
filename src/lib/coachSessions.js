const SCORE_KEYS = ["clarity", "logic", "example", "boundary"];

export function formatSessionDate(timestamp) {
  if (!timestamp) return "刚刚";
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return "刚刚";
  const diff = Date.now() - value;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`;
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function scoreFromEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return null;
  const values = SCORE_KEYS.map((key) => Number(evaluation[key])).filter((item) => Number.isFinite(item));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
}

export function formatSessionStatus(status) {
  if (status === "passed" || status === "通过") return "通过";
  if (status === "needs_review" || status === "需补漏") return "需补漏";
  return status || "进行中";
}

export function coachSessionToSummary(session) {
  const evaluations = Array.isArray(session?.evaluations) ? session.evaluations : [];
  const lastEvaluation = evaluations.at(-1);
  const score = Number.isFinite(Number(session?.score))
    ? Number(session.score)
    : scoreFromEvaluation(lastEvaluation) || 0;

  return {
    id: session.id,
    concept: session.concept || "未命名概念",
    question: session.question || "",
    score,
    date: formatSessionDate(session.updatedAt || session.createdAt),
    status: formatSessionStatus(session.status),
    isRetest: Boolean(session.meta?.isVariant),
    documentIds: session.documentIds?.length
      ? session.documentIds
      : session.meta?.practiceDocumentIds || []
  };
}

export function coachSessionsToSummaries(sessions = []) {
  return sessions.map(coachSessionToSummary);
}
