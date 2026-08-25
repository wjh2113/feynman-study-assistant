import {
  TARGET_COACH_QUESTION_COUNT,
  buildConceptQuestions,
  expandQuestionsToCount
} from "./coach-questions.mjs";

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

function selectedSourceNames(project, documentIds = []) {
  return new Set(
    (project?.analysis?.sources || [])
      .filter((source) => documentIds.includes(source.id))
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

export function questionsForProject(project, secondArg = null) {
  const { documentIds, chapter } = resolveOptions(secondArg);
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
    const selectedNames = selectedSourceNames(project, documentIds);
    if (selectedNames.size) {
      const filtered = questions.filter((question) => questionMatchesDocuments(question, selectedNames));
      if (filtered.length) {
        questions = filtered;
      } else {
        const scopedConcepts = concepts.filter((concept) => conceptMatchesDocuments(concept, selectedNames));
        if (scopedConcepts.length) {
          questions = buildConceptQuestions(scopedConcepts);
        }
      }
    }
  }

  return expandQuestionsToCount(questions, concepts, TARGET_COACH_QUESTION_COUNT);
}
