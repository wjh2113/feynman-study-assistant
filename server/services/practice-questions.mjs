import { getProject } from "../storage.mjs";
import { enqueueDocumentQuestionBanksLater } from "./document-question-bank.mjs";
import {
  PRACTICE_DRAW_MAX,
  PRACTICE_DRAW_MIN,
  resolvePracticeDrawCount,
  sampleQuestionsFromSources,
  sourcesNeedQuestionBank
} from "../../src/lib/document-question-bank.mjs";
import { questionsForProject } from "../../src/lib/questions.js";

export {
  PRACTICE_DRAW_MIN as PRACTICE_QUESTION_MIN,
  PRACTICE_DRAW_MAX as PRACTICE_QUESTION_MAX,
  resolvePracticeDrawCount as resolvePracticeQuestionCount
} from "../../src/lib/document-question-bank.mjs";

function selectedSources(project, documentIds = []) {
  const ids = new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  return (project?.analysis?.sources || []).filter((source) => ids.has(String(source.id || "")));
}

/**
 * Draw practice questions from per-document banks created at upload time.
 * If banks are still filling, kick off generation and fall back to the map/template bank.
 */
export async function generatePracticeQuestions({ userId, projectId, documentIds = [] }) {
  const project = await getProject(projectId, userId);
  if (!project) return { status: 404, body: { error: "学习项目不存在" } };

  const ids = [...new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { status: 400, body: { error: "请先选择要练习的资料" } };

  const sources = selectedSources(project, ids);
  if (!sources.length) return { status: 400, body: { error: "所选资料不存在或不属于当前项目" } };

  const pending = sourcesNeedQuestionBank(sources);
  if (pending.length) {
    enqueueDocumentQuestionBanksLater({
      userId,
      projectId,
      documentIds: pending.map((source) => source.id)
    });
  }

  const targetCount = resolvePracticeDrawCount(sources);
  const sampled = sampleQuestionsFromSources(sources, targetCount);
  if (sampled.length) {
    return {
      body: {
        questions: sampled,
        generated: false,
        fromBank: true,
        capability: null,
        targetCount,
        bankPending: pending.length > 0,
        documentIds: ids,
        filenames: sources.map((source) => source.name || source.filename).filter(Boolean)
      }
    };
  }

  const fallback = questionsForProject(project, { documentIds: ids }).slice(0, targetCount);
  return {
    body: {
      questions: fallback,
      generated: false,
      fromBank: false,
      fallback: true,
      bankPending: pending.length > 0,
      targetCount,
      documentIds: ids,
      filenames: sources.map((source) => source.name || source.filename).filter(Boolean)
    }
  };
}
