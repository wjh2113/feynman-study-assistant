import { isLlmConfigured } from "../gateway-client.mjs";
import { getProject, saveProject } from "../storage.mjs";
import { getUserPreferences } from "../user-preferences.mjs";
import { enqueueTask, enqueueTaskLater } from "../task-queue.mjs";
import { deepseek, fastJson } from "./llm.mjs";
import {
  DOCUMENT_BANK_MAX,
  DOCUMENT_BANK_MIN,
  buildHeuristicDocumentBank,
  measureSourceChars,
  normalizeBankQuestion,
  resolveDocumentBankSize,
  sourcesNeedQuestionBank
} from "../../src/lib/document-question-bank.mjs";

const BANK_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 90_000);
const BANK_FAST_TIMEOUT_MS = Number(process.env.FAST_CHAT_TIMEOUT_MS || 60_000);
const CORPUS_BUDGET = 18_000;
/** Ask the model in chunks so 30–100 题 requests stay reliable. */
const BANK_BATCH_SIZE = 25;

function sourceCorpus(source) {
  const name = String(source.name || source.filename || "未命名资料").trim();
  const summary = source.summary?.summary || source.summary || "";
  const keyPoints = Array.isArray(source.summary?.keyPoints) ? source.summary.keyPoints : [];
  const pagesText = Array.isArray(source.pages)
    ? source.pages.map((page) => `第 ${page.page || "?"} 页\n${page.text || ""}`).join("\n\n")
    : "";
  const preview = String(pagesText || source.parsedPreview || "").slice(0, CORPUS_BUDGET);
  return [
    `【文件】${name}`,
    summary ? `摘要：${String(summary).slice(0, 500)}` : "",
    keyPoints.length ? `要点：${keyPoints.slice(0, 8).map((item) => String(item).slice(0, 120)).join("；")}` : "",
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
      content: "你是费曼学习教练出题助手。只根据这一份学习资料出题，不编造资料未覆盖的内容。只输出合法 JSON。"
    },
    {
      role: "user",
      content: `请为下面这一份资料再生成恰好 ${count} 道费曼对练题（整份资料题库目标范围 ${DOCUMENT_BANK_MIN}-${DOCUMENT_BANK_MAX}，本批 ${count} 道）。
要求：
1. 只围绕本文件内容，可覆盖解释、举例、边界、对比、失效条件、应用场景
2. sourceRefs.file 必须是「${name}」
3. 避免重复，尽量覆盖不同知识点
${avoid.length ? `4. 不要与下列已有题目重复或高度相似：\n${avoid.join("\n")}` : ""}

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

资料：
${sourceCorpus(source) || "（正文不足，请基于文件名与摘要谨慎出题）"}`
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
    seen.add(normalized.question);
    merged.push(normalized);
  }
  return merged;
}

export async function generateQuestionBankForSource(source, userId, capability = "fast-chat") {
  const targetCount = resolveDocumentBankSize(source);
  if (!(await isLlmConfigured(userId))) {
    return {
      questionBank: buildHeuristicDocumentBank(source, targetCount),
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
    let questionBank = [];
    let batches = 0;
    const maxBatches = Math.ceil(targetCount / BANK_BATCH_SIZE) + 1;
    while (questionBank.length < targetCount && batches < maxBatches) {
      const need = Math.min(BANK_BATCH_SIZE, targetCount - questionBank.length);
      const messages = bankMessages(source, need, questionBank);
      const result = capability === "quality-chat"
        ? await deepseek(messages, 0.35, userId, BANK_TIMEOUT_MS)
        : await fastJson(messages, 0.35, userId, BANK_FAST_TIMEOUT_MS);
      const raw = Array.isArray(result?.questions) ? result.questions : [];
      const before = questionBank.length;
      questionBank = mergeUniqueQuestions(questionBank, raw, source, targetCount);
      batches += 1;
      if (questionBank.length <= before) break;
    }

    if (questionBank.length < targetCount) {
      const filled = mergeUniqueQuestions(
        questionBank,
        buildHeuristicDocumentBank(source, targetCount),
        source,
        targetCount
      );
      return {
        questionBank: filled,
        questionBankMeta: {
          generated: questionBank.length > 0,
          fallback: true,
          capability,
          targetCount,
          batches,
          contentChars: measureSourceChars(source),
          generatedAt: Date.now()
        }
      };
    }

    return {
      questionBank: questionBank.slice(0, targetCount),
      questionBankMeta: {
        generated: true,
        capability,
        targetCount,
        batches,
        contentChars: measureSourceChars(source),
        generatedAt: Date.now()
      }
    };
  } catch (error) {
    return {
      questionBank: buildHeuristicDocumentBank(source, targetCount),
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
  const pending = sourcesNeedQuestionBank(targets);
  if (!pending.length) {
    progress(100);
    return { projectId, updated: 0, skipped: targets.length };
  }

  const prefs = await getUserPreferences(userId);
  const capability = prefs.practiceQuestionCapability === "quality-chat" ? "quality-chat" : "fast-chat";
  const byId = new Map(sources.map((source) => [source.id, source]));
  let done = 0;
  for (const source of pending) {
    const generated = await generateQuestionBankForSource(source, userId, capability);
    byId.set(source.id, {
      ...source,
      questionBank: generated.questionBank,
      questionBankMeta: {
        ...generated.questionBankMeta,
        pendingLlm: false
      }
    });
    done += 1;
    progress(Math.round((done / pending.length) * 100));
  }

  const nextSources = sources.map((source) => byId.get(source.id) || source);
  await saveProject({
    ...project,
    userId,
    analysis: {
      ...(project.analysis || {}),
      sources: nextSources
    }
  });
  return { projectId, updated: pending.length, capability };
}

export function enqueueDocumentQuestionBanks(payload) {
  return enqueueTask("document-question-banks", payload, runDocumentQuestionBankJob);
}

export function enqueueDocumentQuestionBanksLater(payload) {
  enqueueTaskLater("document-question-banks", payload, runDocumentQuestionBankJob);
}
