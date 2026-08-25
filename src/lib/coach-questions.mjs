export const TARGET_COACH_QUESTION_COUNT = 10;

export const COACH_QUESTION_TEMPLATES = [
  (title) => `请不用专业术语，向一个12岁孩子解释“${title}”是什么，以及它为什么重要。`,
  (title) => `请用一个真实例子说明“${title}”是如何发挥作用的。`,
  (title) => `“${title}”在什么情况下会失效？请给出一个反例。`,
  (title) => `如果资源和时间都减少一半，你会如何运用“${title}”解决问题？`,
  (title) => `请比较“${title}”与一个容易混淆的做法，并说明你会如何做出选择。`,
  (title) => `解释“${title}”的关键步骤或结构，并说明每一步的作用。`,
  (title) => `如果要向同事教会“${title}”，你会怎么讲？`,
  (title) => `“${title}”和资料里哪个相邻概念最容易混？请说明区别。`,
  (title) => `请说出“${title}”的一个常见误区，并纠正它。`,
  (title) => `结合你的学习资料，举一个“${title}”在实际场景中的应用。`
];

export function buildConceptQuestions(concepts, { target = TARGET_COACH_QUESTION_COUNT } = {}) {
  const list = Array.isArray(concepts) ? concepts.filter((concept) => concept?.title) : [];
  if (!list.length) return [];

  const questions = [];
  let templateIndex = 0;
  while (questions.length < target) {
    const concept = list[questions.length % list.length];
    const template = COACH_QUESTION_TEMPLATES[templateIndex % COACH_QUESTION_TEMPLATES.length];
    const id = `legacy-q-${concept.id || concept.title}-${templateIndex}`;
    questions.push({
      id,
      question: template(concept.title),
      conceptId: concept.id,
      concept: concept.title,
      why: "检验是否真正理解资料中的核心逻辑",
      sourceRefs: concept.sourceRefs || []
    });
    templateIndex += 1;
  }
  return questions.slice(0, target);
}

function questionKey(question) {
  return String(question?.id || question?.question || "").trim();
}

export function expandQuestionsToCount(questions, concepts, target = TARGET_COACH_QUESTION_COUNT) {
  const seen = new Set();
  const merged = [];
  for (const question of questions || []) {
    const key = questionKey(question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(question);
  }
  if (merged.length >= target) return merged.slice(0, target);

  for (const generated of buildConceptQuestions(concepts, { target })) {
    const key = questionKey(generated);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(generated);
    if (merged.length >= target) break;
  }
  return merged.slice(0, target);
}
