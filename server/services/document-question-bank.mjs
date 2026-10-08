import { isLlmConfigured } from "../gateway-client.mjs";
import { getProject, saveProject } from "../storage.mjs";
import { getUserPreferences } from "../user-preferences.mjs";
import { enqueueTask, enqueueTaskLater } from "../task-queue.mjs";
import { withAntiInjection, wrapUntrusted } from "../prompt-safety.mjs";
import { deepseek, fastJson } from "./llm.mjs";
import {
  DOCUMENT_BANK_MAX,
  DOCUMENT_BANK_MIN,
  buildHeuristicDocumentBank,
  isMetaDerivedQuestion,
  measureSourceChars,
  normalizeBankQuestion,
  resolveDocumentBankSize,
  healStuckQuestionBankMeta,
  sourcesNeedQuestionBank,
  stripStudyMetaContent
} from "../../src/lib/document-question-bank.mjs";
import { filterStudyKeyPoints } from "../../src/lib/study-content.mjs";

const BANK_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 90_000);
const BANK_FAST_TIMEOUT_MS = Number(process.env.FAST_CHAT_TIMEOUT_MS || 60_000);
/** Cap completion so quality/thinking models cannot dump 10k–20k+ tokens per batch. */
const BANK_FAST_MAX_TOKENS = Number(process.env.BANK_FAST_MAX_TOKENS || 8_000);
const BANK_QUALITY_MAX_TOKENS = Number(process.env.BANK_QUALITY_MAX_TOKENS || 8_000);
const CORPUS_BUDGET = 18_000;
/** Ask the model in chunks so 30–100 题 requests stay reliable. */
const BANK_BATCH_SIZE = 25;

function sourceCorpus(source) {
  const name = String(source.name || source.filename || "未命名资料").trim();
  const summary = source.summary?.summary || source.summary || "";
  const keyPoints = filterStudyKeyPoints(
    Array.isArray(source.summary?.keyPoints) ? source.summary.keyPoints : [],
    8
  );
  const pagesText = Array.isArray(source.pages)
    ? source.pages.map((page) => `第 ${page.page || "?"} 页\n${page.text || ""}`).join("\n\n")
    : "";
  const cleaned = stripStudyMetaContent(pagesText || source.parsedPreview || "");
  const preview = cleaned.slice(0, CORPUS_BUDGET);
  return [
    `【文件】${name}`,
    summary && !/按页序转写|分隔线为原资料/.test(String(summary))
      ? `摘要：${String(summary).slice(0, 500)}`
      : "",
    keyPoints.length ? `要点：${keyPoints.map((item) => String(item).slice(0, 120)).join("；")}` : "",
    preview ? `原文：\n${preview}` : ""
  ].filter(Boolean).join("\n");
}

function bankMessages(source, batchCount, existingQuestions = []) {
  const name = String(source.name || source.filename || "未命名资料").trim();
  const count = Math.max(1, Math.min(BANK_BATCH_SIZE, Number(batchCount) || DOCUMENT_BANK_MIN));
  const avoid = existingQuestions
    .slice(0, 40)
    .map((item, index) => `${index + 1}. ${String(item.question || "").slice(0, 80)}`)
    .filter(Boolean);
  return [
    {
      role: "system",
      content: withAntiInjection(
        "你是费曼学习教练出题助手。只根据这一份学习资料中的学科知识点出题，不编造资料未覆盖的内容。只输出合法 JSON。"
      )
    },
    {
      role: "user",
      content: `请为下面这一份资料再生成恰好 ${count} 道费曼对练题（整份资料题库目标范围 ${DOCUMENT_BANK_MIN}-${DOCUMENT_BANK_MAX}，本批 ${count} 道）。
要求：
1. 只围绕真正可学习的知识点（语法、概念、规则、用法、对比、应用场景等）
2. 严禁把文档排版/转写说明当成知识点，例如：PDF 页数、Markdown 转写、分页分隔线「----」、页眉页脚、目录装饰、文件格式说明
3. concept 必须是简短的学科概念名，不能是转写备注或分隔线说明
4. sourceRefs.file 必须是「${name}」
5. 避免重复，尽量覆盖不同知识点
${avoid.length ? `6. 不要与下列已有题目重复或高度相似：\n${avoid.join("\n")}` : ""}

返回 JSON：
{
  "questions":[{
    "id":"q1",
    "question":"完整问题",
    "concept":"概念名",
    "why":"考察意图",
    "sourceRefs":[{"file":"${name}","page":1,"quote":"出题依据"}]
  }]
}

${wrapUntrusted("学习资料", sourceCorpus(source) || "（正文不足，请基于文件名与摘要谨慎出题）")}`
    }
  ];
}

function mergeUniqueQuestions(existing, incoming, source, limit) {
  const seen = new Set(existing.map((item) => item.question));
  const merged = [...existing];
  for (const question of incoming) {
    if (merged.length >= limit) break;
    const normalized = normalizeBankQuestion(question, source, merged.length);
    if (!normalized.question || seen.has(normalized.question)) continue;
    if (isMetaDerivedQuestion(normalized)) continue;
    seen.add(normalized.question);
    merged.push(normalized);
  }
  return merged;
}

/** Guarantee a floor count with unique, non-meta filler questions. */
function padQuestionBankToCount(questionBank, source, targetCount) {
  let merged = mergeUniqueQuestions([], questionBank, source, targetCount);
  if (merged.length >= targetCount) return merged.slice(0, targetCount);
  const filename = String(source.name || source.filename || "本资料").trim();
  const concepts = [
    ...new Set([
      ...merged.map((item) => String(item.concept || "").trim()).filter(Boolean),
      filename,
      `${filename}核心概念`,
      `${filename}应用场景`,
      `${filename}常见误区`
    ])
  ];
  let guard = 0;
  while (merged.length < targetCount && guard < targetCount * 6) {
    guard += 1;
    const concept = concepts[merged.length % concepts.length] || filename;
    const n = merged.length + 1;
    const question = `结合本资料，说明「${concept}」的关键用法、一个正例和一个边界条件（补题 ${n}/${targetCount} · ${guard}）。`;
    const next = mergeUniqueQuestions(
      merged,
      [{
        id: `qb-pad-${source.id || "doc"}-${n}-${guard}`,
        question,
        concept,
        why: "补齐题库：保证每份资料有足够对练题"
      }],
      source,
      targetCount
    );
    if (next.length <= merged.length) break;
    merged = next;
  }
  return merged.slice(0, targetCount);
}

export async function generateQuestionBankForSource(source, userId, capability = "fast-chat", options = {}) {
  const seed = Array.isArray(options.seedBank) ? options.seedBank : [];
  const resolved = resolveDocumentBankSize(source);
  const targetCount = Math.max(
    DOCUMENT_BANK_MIN,
    Math.min(
      DOCUMENT_BANK_MAX,
      Number(options.targetCount) > 0 ? Math.round(Number(options.targetCount)) : resolved
    ),
    seed.length
  );
  if (!(await isLlmConfigured(userId))) {
    const heuristic = mergeUniqueQuestions(
      [],
      seed.length ? seed : buildHeuristicDocumentBank(source, targetCount),
      source,
      targetCount
    );
    const filled = mergeUniqueQuestions(
      heuristic,
      buildHeuristicDocumentBank(source, targetCount),
      source,
      targetCount
    );
    return {
      questionBank: filled,
      questionBankMeta: {
        generated: false,
        capability: null,
        targetCount,
        contentChars: measureSourceChars(source),
        generatedAt: Date.now()
      }
    };
  }

  try {
    let questionBank = mergeUniqueQuestions([], seed, source, targetCount);
    let batches = 0;
    const maxBatches = Math.ceil((targetCount - questionBank.length) / BANK_BATCH_SIZE) + 2;
    while (questionBank.length < targetCount && batches < maxBatches) {
      const need = Math.min(BANK_BATCH_SIZE, targetCount - questionBank.length);
      const messages = bankMessages(source, need, questionBank);
      const result = capability === "quality-chat"
        ? await deepseek(messages, 0.35, userId, BANK_TIMEOUT_MS, BANK_QUALITY_MAX_TOKENS)
        : await fastJson(messages, 0.35, userId, BANK_FAST_TIMEOUT_MS, BANK_FAST_MAX_TOKENS);
      const raw = Array.isArray(result?.questions) ? result.questions : [];
      const before = questionBank.length;
      questionBank = mergeUniqueQuestions(questionBank, raw, source, targetCount);
      batches += 1;
      if (questionBank.length <= before) break;
    }

    if (questionBank.length < targetCount) {
      const filled = padQuestionBankToCount(
        mergeUniqueQuestions(
          questionBank,
          buildHeuristicDocumentBank(source, targetCount),
          source,
          targetCount
        ),
        source,
        targetCount
      );
      return {
        questionBank: filled,
        questionBankMeta: {
          generated: questionBank.length > seed.length,
          fallback: true,
          capability,
          targetCount,
          batches,
          toppedUpFrom: seed.length,
          contentChars: measureSourceChars(source),
          generatedAt: Date.now()
        }
      };
    }

    return {
      questionBank: padQuestionBankToCount(questionBank, source, targetCount),
      questionBankMeta: {
        generated: true,
        capability,
        targetCount,
        batches,
        toppedUpFrom: seed.length || undefined,
        contentChars: measureSourceChars(source),
        generatedAt: Date.now()
      }
    };
  } catch (error) {
    return {
      questionBank: padQuestionBankToCount(
        mergeUniqueQuestions(
          seed,
          buildHeuristicDocumentBank(source, targetCount),
          source,
          targetCount
        ),
        source,
        targetCount
      ),
      questionBankMeta: {
        generated: false,
        fallback: true,
        capability,
        error: error.message || "题库生成失败",
        targetCount,
        contentChars: measureSourceChars(source),
        generatedAt: Date.now()
      }
    };
  }
}

/**
 * Build/refresh questionBank on analysis.sources for the given document ids.
 */
export async function runDocumentQuestionBankJob(payload, progress = () => {}) {
  const { projectId, userId, documentIds = [] } = payload || {};
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("学习项目不存在");

  const wanted = new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const sources = project.analysis?.sources || [];
  const targets = sources.filter((source) => {
    if (wanted.size && !wanted.has(String(source.id))) return false;
    return true;
  });

  // Heal stuck pendingLlm when a full/finished bank is already present.
  const healedUpdates = new Map();
  for (const source of targets) {
    const healed = healStuckQuestionBankMeta(source);
    if (healed !== source) {
      healedUpdates.set(String(source.id), {
        questionBank: healed.questionBank,
        questionBankMeta: healed.questionBankMeta
      });
    }
  }

  const pending = sourcesNeedQuestionBank(
    targets.map((source) => healedUpdates.get(String(source.id))
      ? { ...source, ...healedUpdates.get(String(source.id)) }
      : source)
  );
  if (!pending.length) {
    if (healedUpdates.size) {
      const latest = await getProject(projectId, userId);
      if (!latest) throw new Error("学习项目不存在");
      const nextSources = (latest.analysis?.sources || []).map((source) => {
        const update = healedUpdates.get(String(source.id));
        return update ? { ...source, ...update } : source;
      });
      await saveProject({
        ...latest,
        userId,
        analysis: { ...(latest.analysis || {}), sources: nextSources }
      });
    }
    progress(100);
    return { projectId, updated: healedUpdates.size, skipped: targets.length, healed: healedUpdates.size };
  }

  const prefs = await getUserPreferences(userId);
  const capability = prefs.practiceQuestionCapability === "quality-chat" ? "quality-chat" : "fast-chat";
  const bankUpdates = new Map(healedUpdates);
  let done = 0;
  for (const source of pending) {
    try {
      const generated = await generateQuestionBankForSource(source, userId, capability);
      bankUpdates.set(String(source.id), {
        questionBank: generated.questionBank,
        questionBankMeta: {
          ...generated.questionBankMeta,
          pendingLlm: false
        }
      });
    } catch (error) {
      // Never leave the UI spinning forever if one document fails.
      bankUpdates.set(String(source.id), {
        questionBank: Array.isArray(source.questionBank) ? source.questionBank : [],
        questionBankMeta: {
          ...(source.questionBankMeta || {}),
          pendingLlm: false,
          generated: Boolean(source.questionBankMeta?.generated),
          fallback: true,
          error: error.message || "题库生成失败",
          generatedAt: Date.now()
        }
      });
    }
    done += 1;
    progress(Math.round((done / pending.length) * 100));
  }

  // Re-read before write so a concurrent knowledge-map job is not clobbered.
  const latest = await getProject(projectId, userId);
  if (!latest) throw new Error("学习项目不存在");
  const latestSources = latest.analysis?.sources || [];
  const nextSources = latestSources.map((source) => {
    const update = bankUpdates.get(String(source.id));
    return update ? { ...source, ...update } : source;
  });
  await saveProject({
    ...latest,
    userId,
    analysis: {
      ...(latest.analysis || {}),
      sources: nextSources
    }
  });
  return { projectId, updated: bankUpdates.size, capability };
}

export function enqueueDocumentQuestionBanks(payload) {
  return enqueueTask("document-question-banks", payload, runDocumentQuestionBankJob);
}

export function enqueueDocumentQuestionBanksLater(payload) {
  enqueueTaskLater("document-question-banks", payload, runDocumentQuestionBankJob);
}

/**
 * Force-top-up document banks to at least minCount (keeps existing questions).
 */
export async function runTopUpDocumentQuestionBanksJob(payload, progress = () => {}) {
  const {
    projectId,
    userId,
    documentIds = [],
    minCount = 50
  } = payload || {};
  const floor = Math.max(DOCUMENT_BANK_MIN, Math.min(DOCUMENT_BANK_MAX, Number(minCount) || 50));
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("学习项目不存在");

  const wanted = new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const sources = project.analysis?.sources || [];
  const targets = sources.filter((source) => {
    if (!source?.id) return false;
    if (wanted.size && !wanted.has(String(source.id))) return false;
    const bank = Array.isArray(source.questionBank) ? source.questionBank : [];
    const usable = bank.filter((item) => item && !isMetaDerivedQuestion(item)).length;
    return usable < floor;
  });
  if (!targets.length) {
    progress(100);
    return { projectId, updated: 0, skipped: sources.length, minCount: floor };
  }

  const prefs = await getUserPreferences(userId);
  const capability = prefs.practiceQuestionCapability === "quality-chat" ? "quality-chat" : "fast-chat";
  const bankUpdates = new Map();
  let done = 0;
  for (const source of targets) {
    const seed = (Array.isArray(source.questionBank) ? source.questionBank : [])
      .filter((item) => item && !isMetaDerivedQuestion(item));
    const generated = await generateQuestionBankForSource(source, userId, capability, {
      targetCount: floor,
      seedBank: seed
    });
    bankUpdates.set(String(source.id), {
      questionBank: generated.questionBank,
      questionBankMeta: {
        ...generated.questionBankMeta,
        pendingLlm: false,
        toppedUpTo: floor
      }
    });
    done += 1;
    progress(Math.round((done / targets.length) * 100));
  }

  const latest = await getProject(projectId, userId);
  if (!latest) throw new Error("学习项目不存在");
  const nextSources = (latest.analysis?.sources || []).map((source) => {
    const update = bankUpdates.get(String(source.id));
    return update ? { ...source, ...update } : source;
  });
  await saveProject({
    ...latest,
    userId,
    analysis: {
      ...(latest.analysis || {}),
      sources: nextSources
    }
  });
  return {
    projectId,
    updated: bankUpdates.size,
    minCount: floor,
    capability,
    details: [...bankUpdates.entries()].map(([id, update]) => ({
      id,
      count: update.questionBank?.length || 0
    }))
  };
}
