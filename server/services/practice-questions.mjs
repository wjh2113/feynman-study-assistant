import { isLlmConfigured } from "../gateway-client.mjs";
import { getProject } from "../storage.mjs";
import { getUserPreferences } from "../user-preferences.mjs";
import { deepseek, fastJson } from "./llm.mjs";
import { normalizeQuestions } from "./analyze.mjs";
import { TARGET_COACH_QUESTION_COUNT } from "../../src/lib/coach-questions.mjs";
import { questionsForProject } from "../../src/lib/questions.js";

const PRACTICE_QUESTION_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 90_000);
const PRACTICE_QUESTION_FAST_TIMEOUT_MS = Number(process.env.FAST_CHAT_TIMEOUT_MS || 60_000);
const CORPUS_BUDGET = 18_000;

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

function practiceQuestionMessages(project, sources, concepts) {
  const names = sources.map((source) => source.name || source.filename).filter(Boolean);
  const conceptLines = (concepts || [])
    .slice(0, 16)
    .map((concept) => `- ${concept.title}${concept.explanation ? `：${String(concept.explanation).slice(0, 80)}` : ""}`)
    .join("\n");
  const corpus = buildPracticeCorpus(sources);
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

请基于上述资料生成 ${TARGET_COACH_QUESTION_COUNT} 道费曼对练题，要求：
1. 问题必须能检验真实理解（解释、举例、边界、对比、失效条件等），不要只考死记硬背
2. 每题明确对应一个概念名
3. sourceRefs.file 必须是上面练习资料中的原文件名
4. 覆盖所选资料的主要知识点，避免重复

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
  const fallback = questionsForProject(project, { documentIds: ids });
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
        documentIds: ids,
        filenames: [...nameSet]
      }
    };
  }

  try {
    const messages = practiceQuestionMessages(project, sources, concepts);
    const result = capability === "fast-chat"
      ? await fastJson(messages, 0.4, userId, PRACTICE_QUESTION_FAST_TIMEOUT_MS)
      : await deepseek(messages, 0.4, userId, PRACTICE_QUESTION_TIMEOUT_MS);
    const questions = normalizeQuestions(result?.questions, scopedAnalysis);
    if (!questions.length) {
      return {
        body: {
          questions: fallback,
          generated: false,
          capability,
          fallback: true,
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
        error: error.message || "出题失败，已使用本地题库",
        documentIds: ids,
        filenames: [...nameSet]
      }
    };
  }
}
