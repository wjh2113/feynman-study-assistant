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
const CORPUS_BUDGET = 12_000;

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

function bankMessages(source, targetCount) {
  const name = String(source.name || source.filename || "未命名资料").trim();
  const count = Math.max(DOCUMENT_BANK_MIN, Math.min(DOCUMENT_BANK_MAX, Number(targetCount) || DOCUMENT_BANK_MIN));
  return [
    {
      role: "system",
      content: "你是费曼学习教练出题助手。只根据这一份学习资料出题，不编造资料未覆盖的内容。只输出合法 JSON。"
    },
    {
      role: "user",
      content: `请为下面这一份资料生成恰好 ${count} 道费曼对练题（范围 ${DOCUMENT_BANK_MIN}-${DOCUMENT_BANK_MAX}，本次目标 ${count}）。
要求：
1. 只围绕本文件内容，可覆盖解释、举例、边界、对比、失效条件、应用场景
2. sourceRefs.file 必须是「${name}」
3. 避免重复，尽量覆盖不同知识点

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
    const messages = bankMessages(source, targetCount);
    const result = capability === "quality-chat"
      ? await deepseek(messages, 0.35, userId, BANK_TIMEOUT_MS)
      : await fastJson(messages, 0.35, userId, BANK_FAST_TIMEOUT_MS);
    const raw = Array.isArray(result?.questions) ? result.questions : [];
    const questionBank = raw
      .map((question, index) => normalizeBankQuestion(question, source, index))
      .filter((question) => question.question)
      .slice(0, DOCUMENT_BANK_MAX);
    if (questionBank.length < Math.min(DOCUMENT_BANK_MIN, targetCount)) {
      const filled = [
        ...questionBank,
        ...buildHeuristicDocumentBank(source, targetCount).filter(
          (item) => !questionBank.some((existing) => existing.question === item.question)
        )
      ].slice(0, targetCount);
      return {
        questionBank: filled,
        questionBankMeta: {
          generated: questionBank.length > 0,
          fallback: true,
          capability,
          targetCount,
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
