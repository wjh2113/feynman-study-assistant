export function questionsForProject(project) {
  if (project.analysis?.questions?.length) return project.analysis.questions;
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts || []) || [];
  const templates = [
    (title) => `请不用专业术语，向一个12岁孩子解释“${title}”是什么，以及它为什么重要。`,
    (title) => `请用一个真实例子说明“${title}”是如何发挥作用的。`,
    (title) => `“${title}”在什么情况下会失效？请给出一个反例。`
  ];
  return concepts.map((concept, index) => ({
    id: `legacy-q-${concept.id || index}`,
    question: templates[index % templates.length](concept.title),
    conceptId: concept.id,
    concept: concept.title,
    why: "检验是否真正理解资料中的核心逻辑",
    sourceRefs: concept.sourceRefs || []
  }));
}
