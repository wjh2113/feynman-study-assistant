import { COACH_QUESTION_TEMPLATES } from "./coach-questions.mjs";

export const DOCUMENT_BANK_MIN = 10;
export const DOCUMENT_BANK_MAX = 30;
export const PRACTICE_DRAW_MIN = 5;
export const PRACTICE_DRAW_MAX = 15;

const BANK_CHARS_PER_EXTRA = 1_200;
const DRAW_CHARS_PER_EXTRA = 2_000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
}

/** Content length used to size a per-document question bank. */
export function measureSourceChars(source = {}) {
  const pagesText = Array.isArray(source.pages)
    ? source.pages.map((page) => String(page?.text || "")).join("")
    : "";
  const summary = source?.summary?.summary || source?.summary || "";
  const keyPoints = Array.isArray(source?.summary?.keyPoints)
    ? source.summary.keyPoints.join("")
    : "";
  const preview = source?.parsedPreview || "";
  return String(pagesText).length
    + String(summary).length
    + String(keyPoints).length
    + String(preview).length;
}

/** 10–30 questions per uploaded document, scaled by content length. */
export function resolveDocumentBankSize(source = {}) {
  const chars = measureSourceChars(source);
  return clamp(
    DOCUMENT_BANK_MIN + Math.floor(chars / BANK_CHARS_PER_EXTRA),
    DOCUMENT_BANK_MIN,
    DOCUMENT_BANK_MAX
  );
}

/** 5–15 questions drawn for a practice session from selected documents. */
export function resolvePracticeDrawCount(sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  const files = Math.max(1, list.length);
  const chars = list.reduce((sum, source) => sum + measureSourceChars(source), 0);
  return clamp(
    PRACTICE_DRAW_MIN + Math.floor(chars / DRAW_CHARS_PER_EXTRA) + Math.max(0, files - 1),
    PRACTICE_DRAW_MIN,
    PRACTICE_DRAW_MAX
  );
}

export function normalizeBankQuestion(question, source, index = 0) {
  const filename = String(source?.name || source?.filename || "").trim();
  return {
    id: String(question?.id || `qb-${source?.id || "doc"}-${index + 1}`),
    question: String(question?.question || "").trim(),
    conceptId: question?.conceptId || "",
    concept: String(question?.concept || filename || "资料理解").trim(),
    why: String(question?.why || "检验是否真正理解本资料中的核心逻辑").trim(),
    sourceRefs: Array.isArray(question?.sourceRefs) && question.sourceRefs.length
      ? question.sourceRefs
      : (filename ? [{ file: filename, page: 1, quote: "" }] : [])
  };
}

export function collectQuestionPool(sources = []) {
  const pool = [];
  for (const source of sources || []) {
    const bank = Array.isArray(source?.questionBank) ? source.questionBank : [];
    bank.forEach((question, index) => {
      const normalized = normalizeBankQuestion(question, source, index);
      if (!normalized.question) return;
      pool.push({
        ...normalized,
        sourceId: source.id,
        sourceName: source.name || source.filename || ""
      });
    });
  }
  return pool;
}

function shuffleInPlace(items, random = Math.random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapAt = Math.floor(random() * (index + 1));
    [items[index], items[swapAt]] = [items[swapAt], items[index]];
  }
  return items;
}

/** Randomly sample up to `count` questions from selected document banks. */
export function sampleQuestionsFromSources(sources = [], count = PRACTICE_DRAW_MIN, random = Math.random) {
  const target = clamp(count, PRACTICE_DRAW_MIN, PRACTICE_DRAW_MAX);
  const pool = collectQuestionPool(sources);
  if (!pool.length) return [];
  return shuffleInPlace([...pool], random).slice(0, Math.min(target, pool.length));
}

/** Offline / demo bank built from templates when LLM is unavailable. */
export function buildHeuristicDocumentBank(source = {}, target = DOCUMENT_BANK_MIN) {
  const size = clamp(target, DOCUMENT_BANK_MIN, DOCUMENT_BANK_MAX);
  const filename = String(source.name || source.filename || "本资料").trim();
  const keyPoints = Array.isArray(source.summary?.keyPoints)
    ? source.summary.keyPoints.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const titles = keyPoints.length
    ? keyPoints
    : [filename, `${filename} 的核心概念`, `${filename} 的应用场景`, `${filename} 的易错点`];
  const bank = [];
  let templateIndex = 0;
  while (bank.length < size) {
    const title = titles[bank.length % titles.length];
    const template = COACH_QUESTION_TEMPLATES[templateIndex % COACH_QUESTION_TEMPLATES.length];
    bank.push(normalizeBankQuestion({
      id: `qb-heuristic-${source.id || filename}-${bank.length + 1}`,
      question: template(title),
      concept: title,
      why: "本地题库：检验是否真正理解本资料"
    }, source, bank.length));
    templateIndex += 1;
  }
  return bank;
}

export function sourcesNeedQuestionBank(sources = []) {
  return (sources || []).filter((source) => {
    if (!source?.id) return false;
    const bank = source.questionBank;
    if (!Array.isArray(bank) || bank.length < DOCUMENT_BANK_MIN) return true;
    // Heuristic seed banks still need the async LLM refresh.
    if (source.questionBankMeta?.pendingLlm) return true;
    return false;
  });
}
