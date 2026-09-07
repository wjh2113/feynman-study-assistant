import { isLlmConfigured } from "../gateway-client.mjs";
import { getProject } from "../storage.mjs";
import { getUserPreferences } from "../user-preferences.mjs";
import { deepseek, fastJson } from "./llm.mjs";
import { normalizeQuestions } from "./analyze.mjs";
import { expandQuestionsToCount } from "../../src/lib/coach-questions.mjs";
import { questionsForProject } from "../../src/lib/questions.js";

const PRACTICE_QUESTION_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 90_000);
const PRACTICE_QUESTION_FAST_TIMEOUT_MS = Number(process.env.FAST_CHAT_TIMEOUT_MS || 60_000);
const CORPUS_BUDGET = 10_000;
export const PRACTICE_QUESTION_MIN = 5;
export const PRACTICE_QUESTION_MAX = 15;
/** Roughly one extra question per this many content characters. */
const CHARS_PER_EXTRA_QUESTION = 2_000;

function selectedSources(project, documentIds = []) {
  const ids = new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  return (project?.analysis?.sources || []).filter((source) => ids.has(String(source.id || "")));
}

function selectedNames(sources = []) {
  return new Set(
    sources
      .map((source) => String(source.name || source.filename || "").trim())
      .filter(Boolean)
  );
}

function scopedModules(project, nameSet) {
  const modules = project?.analysis?.modules || [];
  if (!nameSet.size) return modules;
  return modules
    .map((module) => ({
      ...module,
      concepts: (module.concepts || []).filter((concept) => {
        const refs = Array.isArray(concept.sourceRefs) ? concept.sourceRefs : [];
        if (!refs.length) return true;
        return refs.some((ref) => nameSet.has(String(ref?.file || "").trim()));
      })
    }))
    .filter((module) => (module.concepts || []).length);
}

/** Estimate selected material size for question budgeting. */
export function measurePracticeContentChars(sources = []) {
  return (sources || []).reduce((sum, source) => {
    const summary = source?.summary?.summary || source?.summary || "";
    const keyPoints = Array.isArray(source?.summary?.keyPoints)
      ? source.summary.keyPoints.join("")
      : "";
    const preview = source?.parsedPreview || "";
    return sum
      + String(summary).length
      + String(keyPoints).length
      + String(preview).length;
  }, 0);
}

/**
 * Scale question count by selected material length (and lightly by file count).
 * Always clamped to [5, 15].
 */
export function resolvePracticeQuestionCount(sources = [], concepts = []) {
  const files = Math.max(1, (sources || []).length);
  const chars = measurePracticeContentChars(sources);
  const conceptBonus = Math.min(3, Math.floor((concepts || []).filter((item) => item?.title).length / 4));
  const fromChars = Math.floor(chars / CHARS_PER_EXTRA_QUESTION);
  const fromFiles = Math.max(0, files - 1);
  const raw = PRACTICE_QUESTION_MIN + fromChars + fromFiles + conceptBonus;
  return Math.max(PRACTICE_QUESTION_MIN, Math.min(PRACTICE_QUESTION_MAX, raw));
}

/** Build a compact corpus from selected practice sources for question generation. */
export function buildPracticeCorpus(sources = [], { maxChars = CORPUS_BUDGET } = {}) {
  const budget = Math.max(2_000, Number(maxChars) || CORPUS_BUDGET);
  const perFile = Math.max(800, Math.floor(budget / Math.max(sources.length, 1)));
  const blocks = [];
  let used = 0;
  for (const source of sources) {
    if (used >= budget) break;
    const name = String(source.name || source.filename || "未命名资料").trim();
    const summary = source.summary?.summary || source.summary || "";
    const keyPoints = Array.isArray(source.summary?.keyPoints) ? source.summary.keyPoints : [];
    const preview = String(source.parsedPreview || "").slice(0, perFile);
    const body = [
      `【文件】${name}`,
      summary ? `摘要：${String(summary).slice(0, 400)}` : "",
      keyPoints.length ? `要点：${keyPoints.slice(0, 6).map((item) => String(item).slice(0, 120)).join("；")}` : "",
      preview ? `原文摘录：\n${preview}` : ""
    ].filter(Boolean).join("\n");
    const slice = body.slice(0, Math.min(perFile, budget - used));
    blocks.push(slice);
    used += slice.length;
  }
  return blocks.join("\n\n");
}

function practiceQuestionMessages(project, sources, concepts, targetCount) {
  const names = sources.map((source) => source.name || source.filename).filter(Boolean);
  const conceptLines = (concepts || [])
    .slice(0, 24)
    .map((concept) => `- ${concept.title}${concept.explanation ? `：${String(concept.explanation).slice(0, 80)}` : ""}`)
    .join("\n");
  const corpus = buildPracticeCorpus(sources);
  const count = Math.max(PRACTICE_QUESTION_MIN, Math.min(PRACTICE_QUESTION_MAX, Number(targetCount) || PRACTICE_QUESTION_MIN));
  return [
    {
      role: "system",
      content:
        "你是费曼学习教练出题助手。只根据给定练习资料出题，不编造资料未覆盖的内容。只输出合法 JSON。"
    },
    {
      role: "user",
      content: `学科：${project.title || "未命名"}
练习资料（仅限这些文件）：${names.join("、") || "无"}
相关概念：
${conceptLines || "（无现成概念列表，请从资料提炼）"}

请基于上述资料生成恰好 ${count} 道费曼对练题（不少于 ${PRACTICE_QUESTION_MIN}、不多于 ${PRACTICE_QUESTION_MAX}，本次目标 ${count} 题），要求：
1. 问题必须能检验真实理解（解释、举例、边界、对比、失效条件等），不要只考死记硬背
2. 每题明确对应一个概念名
3. sourceRefs.file 必须是上面练习资料中的原文件名
4. 覆盖所选资料的主要知识点，避免重复；资料越短题越少、越长题越多

返回 JSON：
{
  "questions":[{
    "id":"q1",
    "question":"完整问题",
    "conceptId":"c1",
    "concept":"概念名",
    "why":"考察意图",
    "sourceRefs":[{"file":"原文件名","page":1,"quote":"出题依据"}]
  }]
}

资料正文：
${corpus || "（资料缺少可引用正文，请基于摘要与概念谨慎出题）"}`
    }
  ];
}

/**
 * Regenerate Feynman practice questions for the currently selected documents.
 * Capability comes from user preference: quality-chat (default) or fast-chat.
 * Question count scales with selected material length (5–15).
 * Falls back to local filtered/template questions when the model is unavailable.
 */
export async function generatePracticeQuestions({ userId, projectId, documentIds = [] }) {
  const project = await getProject(projectId, userId);
  if (!project) return { status: 404, body: { error: "学习项目不存在" } };

  const ids = [...new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { status: 400, body: { error: "请先选择要练习的资料" } };

  const sources = selectedSources(project, ids);
  if (!sources.length) return { status: 400, body: { error: "所选资料不存在或不属于当前项目" } };

  const nameSet = selectedNames(sources);
  const modules = scopedModules(project, nameSet);
  const concepts = modules.flatMap((module) => module.concepts || []);
  const targetCount = resolvePracticeQuestionCount(sources, concepts);
  const contentChars = measurePracticeContentChars(sources);
  const fallback = expandQuestionsToCount(
    questionsForProject(project, { documentIds: ids }),
    concepts,
    targetCount
  );
  const scopedAnalysis = {
    modules: modules.length ? modules : project.analysis?.modules || [],
    sources
  };
  const prefs = await getUserPreferences(userId);
  const capability = prefs.practiceQuestionCapability === "fast-chat" ? "fast-chat" : "quality-chat";

  if (!(await isLlmConfigured(userId))) {
    return {
      body: {
        questions: fallback,
        generated: false,
        capability: null,
        targetCount,
        contentChars,
        documentIds: ids,
        filenames: [...nameSet]
      }
    };
  }

  try {
    const messages = practiceQuestionMessages(project, sources, concepts, targetCount);
    const result = capability === "fast-chat"
      ? await fastJson(messages, 0.4, userId, PRACTICE_QUESTION_FAST_TIMEOUT_MS)
      : await deepseek(messages, 0.4, userId, PRACTICE_QUESTION_TIMEOUT_MS);
    const questions = normalizeQuestions(result?.questions, scopedAnalysis, targetCount);
    if (!questions.length) {
      return {
        body: {
          questions: fallback,
          generated: false,
          capability,
          fallback: true,
          targetCount,
          contentChars,
          documentIds: ids,
          filenames: [...nameSet]
        }
      };
    }
    return {
      body: {
        questions,
        generated: true,
        capability,
        targetCount,
        contentChars,
        documentIds: ids,
        filenames: [...nameSet]
      }
    };
  } catch (error) {
    return {
      body: {
        questions: fallback,
        generated: false,
        capability,
        fallback: true,
        targetCount,
        contentChars,
        error: error.message || "出题失败，已使用本地题库",
        documentIds: ids,
        filenames: [...nameSet]
      }
    };
  }
}
