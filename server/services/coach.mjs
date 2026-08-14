import { embedTexts, fallbackRankCandidates, rerankCandidates } from "../embedding.mjs";
import { getEmbeddingConfig, getModelConfig } from "../model-config.mjs";
import {
  getCoachSession,
  getProject,
  hybridSearch,
  recordEvent,
  resolveChapterId,
  saveCoachSession,
  saveProject
} from "../storage.mjs";
import { getUserPreferences, resolveCoachRole } from "../user-preferences.mjs";
import { deepseek } from "./llm.mjs";

const SCORE_KEYS = ["clarity", "logic", "example", "boundary"];

function normalizeEvaluation(raw = {}) {
  const evaluation = {};
  for (const key of SCORE_KEYS) {
    const value = Number(raw[key]);
    evaluation[key] = Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
  }
  return evaluation;
}

function historyForPrompt(messages = [], limit = 8) {
  return (messages || [])
    .filter((item) => item?.from && item?.text)
    .slice(-limit)
    .map((item) => ({
      role: item.from === "user" ? "learner" : "coach",
      text: String(item.text).slice(0, 800)
    }));
}

function ensureBlindspot({ evaluation, blindspot, concept, threshold, force }) {
  const low = SCORE_KEYS.filter((key) => Number(evaluation[key]) < threshold);
  const need = Boolean(force) || low.length > 0;
  if (!need) return blindspot?.title ? blindspot : null;
  if (blindspot?.title && blindspot?.problem) return blindspot;
  const weakLabel = {
    clarity: "说人话",
    logic: "逻辑闭环",
    example: "举例能力",
    boundary: "边界意识"
  };
  const focus = low[0] || "boundary";
  return {
    title: `${concept?.title || "当前概念"}：${weakLabel[focus] || "理解"}不足`,
    problem: low.length
      ? `本轮在「${low.map((key) => weakLabel[key]).join("、")}」上偏弱，说明还没有经得住追问的稳定理解。`
      : "解释覆盖了表面含义，但对关键假设与失效条件仍不够清楚。",
    action: focus === "example"
      ? "补一个生活/工作正例，再补一个会失效的反例。"
      : focus === "boundary"
        ? "回到原文确认前提，写清什么情况下这个结论不成立。"
        : "用人话重讲一遍因果链，避免术语跳跃。"
  };
}

async function retrieveCoachEvidence(userId, projectId, question, concept, answer, documentIds = []) {
  if (!projectId) return [];
  const retrievalConfig = await getEmbeddingConfig(userId);
  const retrievalQuery = `${question?.question || ""} ${concept?.title || question?.concept || ""}`.trim()
    || String(answer || "").slice(0, 200);
  const [queryEmbedding] = await embedTexts([retrievalQuery], retrievalConfig.embedding);
  const candidates = await hybridSearch(
    projectId,
    userId,
    retrievalQuery,
    queryEmbedding,
    12,
    { documentIds: Array.isArray(documentIds) ? documentIds : [] }
  );
  if (!candidates.length) return [];
  try {
    return await rerankCandidates(retrievalQuery, candidates, 4, retrievalConfig.reranker);
  } catch {
    return fallbackRankCandidates(candidates, 4);
  }
}

function mapEvidence(evidence = []) {
  return evidence.map(({ filename, page, content, rerankScore }) => ({
    filename,
    page,
    quote: String(content || "").slice(0, 180),
    score: rerankScore == null ? null : Number(rerankScore)
  }));
}

async function syncPracticeStateToProject(projectId, userId, patch = {}) {
  if (!projectId || !userId) return null;
  const project = await getProject(projectId, userId);
  if (!project) return null;
  const next = { ...project, userId };
  if (patch.blindspots !== undefined) next.blindspots = patch.blindspots;
  if (patch.sessions !== undefined) next.sessions = patch.sessions;
  if (patch.onePager !== undefined) next.onePager = patch.onePager;
  return saveProject(next);
}

async function persistCoachTurn(sessionId, userId, projectId, answer, payload, chapterId = null, documentIds = null) {
  if (!projectId || !sessionId) return null;
  const session = await getCoachSession(sessionId);
  if (!session || session.projectId !== projectId || session.userId !== userId) return null;
  session.messages = session.messages || [];
  session.evaluations = session.evaluations || [];
  session.messages.push({ from: "user", text: answer.trim() });
  session.messages.push({ from: "ai", text: payload.reply });
  session.evaluations.push(payload.evaluation || { clarity: 0, logic: 0, example: 0, boundary: 0 });
  if (chapterId) session.chapterId = chapterId;
  if (Array.isArray(documentIds)) {
    session.documentIds = documentIds;
    session.meta = {
      ...(session.meta || {}),
      practiceDocumentIds: documentIds
    };
  }
  await saveCoachSession(session);
  return {
    id: session.id,
    chapterId: session.chapterId || null,
    documentIds: session.documentIds || [],
    messages: session.messages,
    evaluations: session.evaluations,
    meta: session.meta || {}
  };
}

async function maybePersistPracticeArtifacts({
  userId,
  projectId,
  documentIds = [],
  concept,
  sessionId,
  payload
}) {
  if (!projectId || !payload?.blindspot?.title) return;
  const project = await getProject(projectId, userId);
  if (!project) return;

  const blindspot = {
    id: `bs-${Date.now()}`,
    title: payload.blindspot.title,
    problem: payload.blindspot.problem || "",
    action: payload.blindspot.action || "",
    concept: concept?.title || "",
    conceptId: concept?.id || "",
    status: "open",
    createdAt: Date.now(),
    sessionId: sessionId || null,
    documentIds: Array.isArray(documentIds) ? documentIds : []
  };
  const exists = (project.blindspots || []).some((item) => item.title === blindspot.title);
  const nextBlindspots = exists
    ? project.blindspots
    : [...(project.blindspots || []), blindspot];
  const nextSessions = payload.completed
    ? [
        {
          id: sessionId || `session-${Date.now()}`,
          concept: concept?.title || "",
          score: Math.round(
            SCORE_KEYS.reduce((sum, key) => sum + Number(payload.evaluation?.[key] || 0), 0) / SCORE_KEYS.length
          ),
          at: Date.now(),
          documentIds: Array.isArray(documentIds) ? documentIds : []
        },
        ...(project.sessions || [])
      ].slice(0, 20)
    : project.sessions || [];

  if (!exists || payload.completed) {
    await syncPracticeStateToProject(projectId, userId, {
      blindspots: nextBlindspots,
      sessions: nextSessions
    });
  }
}

export async function runCoachTurn({
  userId,
  projectId,
  chapterId = null,
  documentIds = [],
  sessionId,
  question,
  concept,
  answer,
  role = "child",
  turn = 1
}) {
  let stage = "校验输入";
  try {
    if (!answer?.trim()) return { status: 400, body: { error: "请先写下你的解释" } };

    const preferences = await getUserPreferences(userId);
    const maxTurns = preferences.coachMaxTurns;
    const turnNumber = Math.max(1, Number(turn) || 1);
    const finalTurn = turnNumber >= maxTurns;
    const effectiveRole = resolveCoachRole(preferences.coachRoleMode, turnNumber, maxTurns)
      || role
      || "child";
    const requestedDocumentIds = Array.isArray(documentIds)
      ? [...new Set(documentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    const resolvedChapterId = chapterId
      ? await resolveChapterId(projectId, userId, chapterId)
      : null;

    let priorMessages = [];
    let normalizedDocumentIds = requestedDocumentIds;
    if (sessionId) {
      const existing = await getCoachSession(sessionId);
      if (existing && existing.projectId === projectId && existing.userId === userId) {
        priorMessages = existing.messages || [];
        if (!normalizedDocumentIds.length && Array.isArray(existing.documentIds)) {
          normalizedDocumentIds = existing.documentIds;
        }
      }
    }

    stage = "检索学习资料";
    const evidence = await retrieveCoachEvidence(
      userId,
      projectId,
      question,
      concept,
      answer,
      normalizedDocumentIds
    );
    const evidencePayload = mapEvidence(evidence);
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);

    if (!modelConfigured) {
      const hasExample = /比如|例如|就像|好比/.test(answer);
      const jargonMatch = answer.match(/赋能|抓手|闭环|范式|飞轮|方法论/);
      const usesJargon = Boolean(jargonMatch) && answer.length < 90;
      const evaluation = normalizeEvaluation({
        clarity: usesJargon ? 58 : 76,
        logic: answer.length > 80 ? 78 : 65,
        example: hasExample ? 86 : 48,
        boundary: turnNumber >= Math.max(2, maxTurns - 1) ? 72 : 42
      });
      const blindspot = ensureBlindspot({
        evaluation,
        blindspot: turnNumber >= Math.max(2, maxTurns - 1)
          ? {
              title: `${concept?.title || "当前概念"}的适用边界`,
              problem: "解释了它如何生效，但还没有说明失效条件和关键假设。",
              action: "回到原文确认前提，再用一个反例重新解释。"
            }
          : null,
        concept,
        threshold: preferences.coachBlindspotThreshold,
        force: finalTurn
      });
      const payload = {
        reply: finalTurn
          ? `本轮 ${maxTurns} 问已完成。你对“${concept?.title || "这个概念"}”的解释已经覆盖了核心含义；接下来请根据评分和盲区提示复习，结束本轮后可选择其他问题继续练习。`
          : usesJargon
            ? `你刚才用了“${jargonMatch?.[0]}”这个词。如果不能使用这个词，你会怎样向一个完全不懂的人解释？`
            : hasExample
              ? `这个例子很有帮助。现在换个方向：在什么情况下，${concept?.title || "这个方法"}可能不会奏效？`
              : `我大概听懂了，但还不够具体。你能用一个生活中的例子说明“${concept?.title || "这个概念"}”是怎样发生的吗？`,
        phase: effectiveRole,
        completed: finalTurn,
        maxTurns,
        evaluation,
        evaluationNotes: {
          clarity: usesJargon ? "术语偏多，需要用人话重述。" : "表达基本清楚。",
          logic: answer.length > 80 ? "因果链条较完整。" : "因果还可以再展开。",
          example: hasExample ? "已给出例子。" : "缺少具体例子。",
          boundary: turnNumber >= Math.max(2, maxTurns - 1) ? "开始触及边界。" : "边界意识尚未体现。"
        },
        blindspot,
        evidence: evidencePayload,
        demo: true,
        chapterId: resolvedChapterId,
        documentIds: normalizedDocumentIds
      };
      if (projectId) {
        await recordEvent(userId, projectId, "coach_turn", {
          concept: concept?.title,
          turn: turnNumber,
          maxTurns,
          evaluation: payload.evaluation,
          chapterId: resolvedChapterId,
          documentIds: normalizedDocumentIds
        });
      }
      const session = await persistCoachTurn(
        sessionId,
        userId,
        projectId,
        answer,
        payload,
        resolvedChapterId,
        normalizedDocumentIds
      );
      await maybePersistPracticeArtifacts({
        userId,
        projectId,
        documentIds: normalizedDocumentIds,
        concept,
        sessionId,
        payload
      });
      return { body: { ...payload, session } };
    }

    stage = "生成教练追问";
    const result = await deepseek([
      {
        role: "system",
        content:
          `你是费曼学习教练。一轮对练最多包含${maxTurns}个问题，初始问题算第1个。前几轮不要替用户完善答案，一次只追问一个最关键的问题；发现黑话就要求用人话，发现逻辑跳跃就追问因果。第${maxTurns}轮用户回答后必须结束本轮，只给简短总结、评分和盲区，不得再提出任何问题。只输出合法JSON。`
      },
      {
        role: "user",
        content: `资料生成的问题：${JSON.stringify(question)}
对应概念：${JSON.stringify(concept)}
当前角色：${effectiveRole === "child" ? "好奇的12岁小孩" : "严厉的行业专家"}
对话轮次：${turnNumber}/${maxTurns}
既有对话（含初始问题）：${JSON.stringify(historyForPrompt(priorMessages))}
用户本轮解释：${answer}
可用于核对的资料片段：${JSON.stringify(evidencePayload)}
本轮是否应结束：${finalTurn ? "是。不得继续追问，reply必须是陈述式总结。" : "否。reply只包含一个追问。"}

评分量规（0-100）：
- clarity：完全不用黑话、12岁能懂≈85+；术语堆砌≈40-
- logic：因果完整可复述≈80+；只有结论无过程≈45-
- example：有具体正例≈80+；只有抽象定义≈40-
- boundary：说清失效条件/假设≈80+；从未提到边界≈35-
任一维度低于${preferences.coachBlindspotThreshold}，或本轮应结束时，必须给出 blindspot。

返回：
{"reply":"追问或最终总结","phase":"child|expert","completed":${finalTurn},"evaluation":{"clarity":0,"logic":0,"example":0,"boundary":0},"evaluationNotes":{"clarity":"一句短评","logic":"一句短评","example":"一句短评","boundary":"一句短评"},"blindspot":null或{"title":"","problem":"","action":""}}`
      }
    ], 0.55, userId);

    if (!result?.reply || !result?.evaluation || typeof result.evaluation !== "object") {
      throw new Error("文本模型没有返回有效的教练追问结构");
    }

    const evaluation = normalizeEvaluation(result.evaluation);
    const blindspot = ensureBlindspot({
      evaluation,
      blindspot: result.blindspot,
      concept,
      threshold: preferences.coachBlindspotThreshold,
      force: finalTurn
    });

    const payload = {
      reply: result.reply,
      phase: effectiveRole,
      completed: finalTurn,
      maxTurns,
      evaluation,
      evaluationNotes: result.evaluationNotes && typeof result.evaluationNotes === "object"
        ? result.evaluationNotes
        : null,
      blindspot,
      evidence: evidencePayload,
      demo: false,
      chapterId: resolvedChapterId,
      documentIds: normalizedDocumentIds
    };

    if (projectId) {
      await recordEvent(userId, projectId, "coach_turn", {
        concept: concept?.title,
        turn: turnNumber,
        maxTurns,
        evaluation,
        chapterId: resolvedChapterId,
        documentIds: normalizedDocumentIds
      });
    }
    const session = await persistCoachTurn(
      sessionId,
      userId,
      projectId,
      answer,
      payload,
      resolvedChapterId,
      normalizedDocumentIds
    );
    await maybePersistPracticeArtifacts({
      userId,
      projectId,
      documentIds: normalizedDocumentIds,
      concept,
      sessionId,
      payload
    });
    return { body: { ...payload, session } };
  } catch (error) {
    return { status: 500, body: { error: `${stage}失败：${error.message || "教练暂时无法回应"}`, stage } };
  }
}

export async function generateVariantQuestion(project, blindspot, concept, userId) {
  const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
  const base = {
    id: `q-variant-${Date.now()}`,
    conceptId: concept?.id || "",
    concept: concept?.title || blindspot?.concept || "",
    sourceRefs: concept?.sourceRefs || [],
    isVariant: true,
    blindspotId: blindspot?.id,
    why: `针对盲区：${blindspot?.title || ""}`
  };
  if (modelConfigured && blindspot?.title && blindspot?.problem) {
    const result = await deepseek([
      {
        role: "system",
        content: "你是费曼学习教练。根据概念和盲区，生成一个能检验该盲区的变式追问。只输出合法JSON。"
      },
      {
        role: "user",
        content: `概念：${concept?.title || ""}
概念解释：${concept?.explanation || ""}
盲区标题：${blindspot.title}
盲区诊断：${blindspot.problem}
最小补漏动作：${blindspot.action || ""}

返回：{"question":"一个具体的变式追问"}`
      }
    ], 0.55, userId);
    if (result?.question) return { ...base, question: result.question };
  }
  return {
    ...base,
    question: `针对盲区「${blindspot?.title || "当前盲区"}」：${blindspot?.action || `请用自己的话解释「${concept?.title || "这个概念"}」，并说明它在什么情况下会失效。`}`
  };
}

export async function generateOnePager({ userId, project, chapter = null, documentIds = [], practiceDocs = null }) {
  try {
    if (!project || typeof project !== "object") {
      return { status: 400, body: { error: "缺少学科数据，请刷新页面后重试" } };
    }
    const practice = {
      blindspots: Array.isArray(project?.blindspots) && project.blindspots.length
        ? project.blindspots
        : (chapter?.blindspots || []),
      sessions: Array.isArray(project?.sessions) && project.sessions.length
        ? project.sessions
        : (chapter?.sessions || [])
    };
    const subjectTitle = project?.title || "学习主题";
    const selectedDocs = Array.isArray(practiceDocs) && practiceDocs.length
      ? practiceDocs
      : (Array.isArray(documentIds) && documentIds.length
        ? (project?.analysis?.sources || []).filter((source) => documentIds.includes(source.id))
        : []);
    const docsLabel = selectedDocs.length
      ? ` · ${selectedDocs.map((doc) => doc.name || doc.title || doc.id).filter(Boolean).slice(0, 3).join("、")}`
      : (chapter?.title ? ` · ${chapter.title}` : "");
    const fallbackSections = [
      {
        title: "问题与学习目标",
        purpose: "交代为什么学习这个主题，以及希望解决的真实问题。",
        keyPoints: [project?.analysis?.summary || "说明学习背景、目标与核心问题。"],
        evidence: (project?.analysis?.sources || []).slice(0, 2).map((item) => item.name),
        writingPrompt: "用一个真实困惑或工作场景开篇，不要从概念定义开始。"
      },
      ...((project?.analysis?.modules || []).length
        ? (project.analysis.modules || []).slice(0, 4).map((module) => ({
            title: module.title,
            purpose: module.description || "呈现该模块的核心逻辑与判断方法。",
            keyPoints: (module.concepts || []).slice(0, 3).map((item) => item.title),
            evidence: (module.concepts || [])
              .flatMap((item) => item.sourceRefs || [])
              .slice(0, 3)
              .map((item) => `${item.file} · 第${item.page || 1}页`),
            writingPrompt: "先解释底层逻辑，再用一个例子说明它如何影响实际判断。"
          }))
        : [
            {
              title: "核心概念与知识骨架",
              purpose: "建立读者理解主题所需的最小知识框架。",
              keyPoints: (project?.analysis?.highValue || []).slice(0, 3),
              evidence: (project?.analysis?.sources || []).slice(0, 3).map((item) => item.name),
              writingPrompt: "用概念之间的关系组织内容，不要写成名词解释清单。"
            },
            {
              title: "方法落地与适用边界",
              purpose: "说明知识如何用于真实场景，以及在什么情况下会失效。",
              keyPoints: ["给出一个应用场景", "说明资源限制与风险", "写清方法的适用边界"],
              evidence: [],
              writingPrompt: "至少写一个正例和一个反例，解释判断依据。"
            }
          ]),
      {
        title: "费曼对练暴露的盲区",
        purpose: "展示理解如何经过追问、修正和边界测试。",
        keyPoints: (practice?.blindspots || []).length
          ? (practice.blindspots || []).slice(0, 3).map((item) => item.title)
          : ["记录最容易产生“自以为懂了”的环节", "设计一个可以检验真实理解的追问"],
        evidence: (practice?.sessions || []).slice(0, 3).map((item) => `${item.concept} · 得分${item.score}`),
        writingPrompt: "写清原先哪里想错了、证据如何推翻直觉、现在如何判断。"
      },
      {
        title: "行动方案与下一步验证",
        purpose: "把知识转化为可以执行和检验的行动。",
        keyPoints: [project?.analysis?.highValue?.[0] || "选择一个真实场景进行最小验证。"],
        evidence: [],
        writingPrompt: "给出行动、成功指标、风险和复盘时间，不写空泛口号。"
      }
    ];
    const fallbackOutline = {
      title: `${subjectTitle}${docsLabel}：从知识骨架到实践判断`,
      format: "深度复盘 / 项目拆解文章",
      audience: "希望快速理解该主题并用于真实问题的读者",
      coreArgument: project?.analysis?.summary || "通过知识骨架、主动输出和定向补漏，把资料转化为可迁移的能力。",
      sections: fallbackSections.filter((item) => item.keyPoints?.length).slice(0, 7)
    };
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
    if (!modelConfigured) {
      const payload = {
        title: `${subjectTitle}${docsLabel}` || "学习一页纸",
        thesis: project?.analysis?.summary || "先掌握骨架，再通过输出和追问把知识变成能力。",
        takeaways: project?.analysis?.highValue || [],
        action: "明天选择一个真实问题，用“问题—假设—验证”的结构完成一次15分钟分析。",
        reflection: "我最大的变化，是从收集答案转向验证自己的理解。",
        outline: fallbackOutline,
        demo: true
      };
      if (project?.id) await recordEvent(userId, project.id, "one_pager_generated", payload);
      return { body: payload };
    }
    const result = await deepseek([
      {
        role: "system",
        content:
          "你负责把学习过程沉淀为简洁的一页纸和可直接写作的专业成果大纲。优先使用上传资料、知识地图、用户对练与盲区中形成的观点，不虚构资料、引文或用户经历。大纲必须体现底层逻辑、实战判断和认知修正，不要只罗列知识点。只输出JSON。"
      },
      {
        role: "user",
        content: `根据以下项目数据生成“一页纸学习卡 + 深度复盘/项目拆解文章大纲”：
${JSON.stringify(project ?? {}).slice(0, 120000)}
返回：
{"title":"","thesis":"","takeaways":["","",""],"action":"","reflection":"",
"outline":{"title":"","format":"深度复盘 / 项目拆解文章","audience":"","coreArgument":"",
"sections":[{"title":"","purpose":"","keyPoints":[""],"evidence":["仅填写项目数据中真实存在的文件、页码、对练或盲区"],"writingPrompt":""}]}}
要求 outline.sections 为5至7章，每章都说明写作目的、2至4个核心论点、可核对依据和具体写作提示。`
      }
    ], 0.35, userId);
    if (!result || typeof result !== "object") throw new Error("文本模型没有返回有效的学习成果结构");
    const normalized = {
      ...result,
      takeaways: Array.isArray(result.takeaways) ? result.takeaways : [],
      outline: {
        ...fallbackOutline,
        ...(result.outline || {}),
        sections: Array.isArray(result.outline?.sections) && result.outline.sections.length
          ? result.outline.sections.map((section) => ({
              title: section.title || "未命名章节",
              purpose: section.purpose || "",
              keyPoints: Array.isArray(section.keyPoints) ? section.keyPoints : [],
              evidence: Array.isArray(section.evidence) ? section.evidence : [],
              writingPrompt: section.writingPrompt || ""
            }))
          : fallbackOutline.sections
      },
      demo: false
    };
    if (project?.id) await recordEvent(userId, project.id, "learning_artifact_generated", normalized);
    return { body: normalized };
  } catch (error) {
    return { status: 500, body: { error: error.message || "生成失败" } };
  }
}
