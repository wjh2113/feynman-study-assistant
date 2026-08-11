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

export function questionsForProject(project, secondArg = null) {
  const { documentIds, chapter } = resolveOptions(secondArg);
  const chapterQuestions = chapter?.analysis?.questions;
  let questions;
  if (Array.isArray(chapterQuestions) && chapterQuestions.length) {
    questions = chapterQuestions;
  } else if (project?.analysis?.questions?.length) {
    questions = project.analysis.questions;
  } else {
    const concepts =
      (Array.isArray(chapter?.analysis?.modules) && chapter.analysis.modules.length
        ? chapter.analysis.modules
        : project?.analysis?.modules || []
      ).flatMap((module) => module.concepts || []);
    const templates = [
      (title) => `请不用专业术语，向一个12岁孩子解释“${title}”是什么，以及它为什么重要。`,
      (title) => `请用一个真实例子说明“${title}”是如何发挥作用的。`,
      (title) => `“${title}”在什么情况下会失效？请给出一个反例。`
    ];
    questions = concepts.map((concept, index) => ({
      id: `legacy-q-${concept.id || index}`,
      question: templates[index % templates.length](concept.title),
      conceptId: concept.id,
      concept: concept.title,
      why: "检验是否真正理解资料中的核心逻辑",
      sourceRefs: concept.sourceRefs || []
    }));
  }

  if (!documentIds.length) return questions;
  const selectedNames = new Set(
    (project?.analysis?.sources || [])
      .filter((source) => documentIds.includes(source.id))
      .map((source) => String(source.name || "").trim())
      .filter(Boolean)
  );
  if (!selectedNames.size) return questions;
  return questions.filter((question) => questionMatchesDocuments(question, selectedNames));
}
