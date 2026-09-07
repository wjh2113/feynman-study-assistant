import {
  TARGET_COACH_QUESTION_COUNT,
  buildConceptQuestions,
  expandQuestionsToCount
} from "./coach-questions.mjs";
import {
  PRACTICE_DRAW_MIN,
  resolvePracticeDrawCount,
  sampleQuestionsFromSources
} from "./document-question-bank.mjs";

function isLegacyChapterArg(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value.analysis != null || value.blindspots != null || value.sessions != null || value.onePager != null));
}

function resolveOptions(secondArg) {
  if (secondArg == null) return { documentIds: [], chapter: null };
  if (Array.isArray(secondArg)) return { documentIds: secondArg, chapter: null };
  if (isLegacyChapterArg(secondArg)) return { documentIds: [], chapter: secondArg };
  if (typeof secondArg === "object") {
    return {
      documentIds: Array.isArray(secondArg.documentIds) ? secondArg.documentIds : [],
      chapter: null
    };
  }
  return { documentIds: [], chapter: null };
}

function questionMatchesDocuments(question, selectedNames) {
  const refs = Array.isArray(question?.sourceRefs) ? question.sourceRefs : [];
  if (!refs.length) return true;
  return refs.some((ref) => selectedNames.has(String(ref?.file || "").trim()));
}

function conceptMatchesDocuments(concept, selectedNames) {
  const refs = Array.isArray(concept?.sourceRefs) ? concept.sourceRefs : [];
  if (!refs.length) return true;
  return refs.some((ref) => selectedNames.has(String(ref?.file || "").trim()));
}

function selectedSources(project, documentIds = []) {
  const ids = new Set((documentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  return (project?.analysis?.sources || []).filter((source) => ids.has(String(source.id || "")));
}

function selectedSourceNames(project, documentIds = []) {
  return new Set(
    selectedSources(project, documentIds)
      .map((source) => String(source.name || source.filename || "").trim())
      .filter(Boolean)
  );
}

function projectConcepts(project, chapter = null) {
  if (Array.isArray(chapter?.analysis?.modules) && chapter.analysis.modules.length) {
    return chapter.analysis.modules.flatMap((module) => module.concepts || []);
  }
  return (project?.analysis?.modules || []).flatMap((module) => module.concepts || []);
}

function legacyQuestionsForProject(project, documentIds, chapter) {
  const concepts = projectConcepts(project, chapter);
  const chapterQuestions = chapter?.analysis?.questions;
  let questions;
  if (Array.isArray(chapterQuestions) && chapterQuestions.length) {
    questions = chapterQuestions;
  } else if (project?.analysis?.questions?.length) {
    questions = project.analysis.questions;
  } else {
    questions = buildConceptQuestions(concepts);
  }

  if (documentIds.length) {
    const names = selectedSourceNames(project, documentIds);
    if (names.size) {
      const filtered = questions.filter((question) => questionMatchesDocuments(question, names));
      if (filtered.length) {
        questions = filtered;
      } else {
        const scopedConcepts = concepts.filter((concept) => conceptMatchesDocuments(concept, names));
        if (scopedConcepts.length) {
          questions = buildConceptQuestions(scopedConcepts);
        }
      }
    }
  }

  const sources = selectedSources(project, documentIds);
  const drawCount = sources.length
    ? resolvePracticeDrawCount(sources)
    : TARGET_COACH_QUESTION_COUNT;
  return expandQuestionsToCount(questions, concepts, drawCount);
}

/**
 * Prefer per-document question banks created at upload time; randomly draw 5–15.
 * Fall back to map/template questions when banks are not ready yet.
 */
export function questionsForProject(project, secondArg = null) {
  const { documentIds, chapter } = resolveOptions(secondArg);
  const sources = documentIds.length
    ? selectedSources(project, documentIds)
    : (project?.analysis?.sources || []);

  if (sources.length) {
    const drawCount = resolvePracticeDrawCount(sources);
    const sampled = sampleQuestionsFromSources(sources, drawCount);
    if (sampled.length >= PRACTICE_DRAW_MIN || sampled.length >= Math.min(drawCount, sources.length)) {
      return sampled;
    }
    if (sampled.length) {
      const legacy = legacyQuestionsForProject(project, documentIds, chapter);
      const seen = new Set(sampled.map((item) => item.id || item.question));
      for (const question of legacy) {
        const key = question.id || question.question;
        if (seen.has(key)) continue;
        sampled.push(question);
        seen.add(key);
        if (sampled.length >= drawCount) break;
      }
      return sampled.slice(0, drawCount);
    }
  }

  return legacyQuestionsForProject(project, documentIds, chapter);
}
