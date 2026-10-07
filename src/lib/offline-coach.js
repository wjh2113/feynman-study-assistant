/**
 * Lightweight offline coach evaluation when the LLM gateway is unreachable.
 */

function clampScore(value) {
  return Math.max(35, Math.min(92, Math.round(value)));
}

export function evaluateAnswerOffline({ answer = "", question = {}, concept = {}, role = "child", turn = 1 } = {}) {
  const text = String(answer || "").trim();
  const length = text.length;
  const hasExample = /例如|比如|举例|比如|譬如|比如说|比如像|instance|example|たとえば/i.test(text);
  const hasBoundary = /但是|不过|如果|除非|边界|失效|不适用|条件|前提|限制|不会|不能/i.test(text);
  const mentionsConcept = Boolean(
    (concept?.title && text.includes(String(concept.title).slice(0, 8)))
    || (question?.concept && text.includes(String(question.concept).slice(0, 8)))
  );
  const sentenceCount = (text.match(/[。！？.!?]/g) || []).length || (length > 40 ? 1 : 0);

  const clarity = clampScore(48 + Math.min(28, length / 8) + (role === "child" ? 4 : 0));
  const logic = clampScore(46 + sentenceCount * 8 + (mentionsConcept ? 10 : 0));
  const example = clampScore(42 + (hasExample ? 28 : length > 60 ? 10 : 0));
  const boundary = clampScore(40 + (hasBoundary ? 30 : length > 80 ? 8 : 0));
  const evaluation = { clarity, logic, example, boundary };
  const avg = Math.round((clarity + logic + example + boundary) / 4);

  const tips = [];
  if (!hasExample) tips.push("再补一个具体例子，别人更容易听懂。");
  if (!hasBoundary) tips.push("说明一下在什么情况下这个说法会失效。");
  if (length < 40) tips.push("解释再展开一点，把关键步骤说清楚。");
  if (!tips.length) tips.push("离线模式：继续用自己的话复述一遍核心逻辑。");

  const reply = role === "expert" && turn >= 2
    ? `（离线评分 ${avg}）我听到了你的解释。${tips[0]}还有没有反例或适用边界？`
    : `（离线评分 ${avg}）我大致听懂了。${tips[0]}${tips[1] ? tips[1] : ""}`;

  return {
    reply,
    evaluation,
    evaluationNotes: {
      mode: "offline",
      tips,
      note: "当前无网络，已使用本地评分；联网后可获得完整教练追问。"
    },
    evidence: [],
    phase: turn >= 2 ? "expert" : role,
    completed: turn >= 3 || avg >= 80,
    offline: true,
    maxTurns: 2
  };
}
