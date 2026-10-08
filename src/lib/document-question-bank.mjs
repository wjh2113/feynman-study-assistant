import { COACH_QUESTION_TEMPLATES } from "./coach-questions.mjs";
import {
  extractStudyConceptTitles,
  filterStudyKeyPoints,
  isMetaDerivedQuestion
} from "./study-content.mjs";

export const DOCUMENT_BANK_MIN = 30;
export const DOCUMENT_BANK_MAX = 100;
export const PRACTICE_DRAW_MIN = 5;
export const PRACTICE_DRAW_MAX = 15;

/** Extra question roughly every N chars beyond the minimum bank size. */
const BANK_CHARS_PER_EXTRA = 800;
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

/** 30–100 questions per uploaded document, scaled by content length. */
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
      if (!normalized.question || isMetaDerivedQuestion(normalized)) return;
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
  const titles = extractStudyConceptTitles(source, 16);
  const fallbackTitles = filterStudyKeyPoints(
    Array.isArray(source.summary?.keyPoints) ? source.summary.keyPoints : [],
    8
  );
  const concepts = titles.length
    ? titles
    : fallbackTitles.length
      ? fallbackTitles
      : [filename, `${filename} 的核心概念`, `${filename} 的应用场景`, `${filename} 的易错点`];
  const bank = [];
  let templateIndex = 0;
  while (bank.length < size) {
    const title = concepts[bank.length % concepts.length];
    const template = COACH_QUESTION_TEMPLATES[templateIndex % COACH_QUESTION_TEMPLATES.length];
    const question = normalizeBankQuestion({
      id: `qb-heuristic-${source.id || filename}-${bank.length + 1}`,
      question: template(title),
      concept: title,
      why: "本地题库：检验是否真正理解本资料"
    }, source, bank.length);
    if (!isMetaDerivedQuestion(question)) bank.push(question);
    templateIndex += 1;
    if (templateIndex > size * 4) break;
  }
  return bank;
}

export function questionBankHasMetaPollution(bank = []) {
  const list = Array.isArray(bank) ? bank : [];
  if (!list.length) return false;
  const bad = list.filter((item) => isMetaDerivedQuestion(item)).length;
  return bad >= 3 || bad / list.length >= 0.15;
}

function usableBankCount(source = {}) {
  const bank = Array.isArray(source.questionBank) ? source.questionBank : [];
  return bank.filter((item) => item && !isMetaDerivedQuestion(item)).length;
}

/**
 * UI / banner: whether this source should show “题库生成中”.
 * Ignores stuck pendingLlm when a finished or full-size bank is already present.
 */
export function isQuestionBankUiPending(source = {}) {
  const meta = source?.questionBankMeta || {};
  if (!meta.pendingLlm) return false;
  if (meta.generated) return false;
  const usable = usableBankCount(source);
  const target = Math.max(
    DOCUMENT_BANK_MIN,
    Math.min(DOCUMENT_BANK_MAX, Number(meta.targetCount) || DOCUMENT_BANK_MIN)
  );
  if (usable >= target && !questionBankHasMetaPollution(source.questionBank)) return false;
  return true;
}

export function sourcesNeedQuestionBank(sources = []) {
  return (sources || []).filter((source) => {
    if (!source?.id) return false;
    const bank = Array.isArray(source.questionBank) ? source.questionBank : [];
    const usable = usableBankCount(source);
    const meta = source.questionBankMeta || {};
    // 导入或 LLM 已经产出可用题库后，不要每次对练都当成“还在生成”。
    if (meta.generated && usable >= PRACTICE_DRAW_MIN && !questionBankHasMetaPollution(bank)) {
      return false;
    }
    if (usable < DOCUMENT_BANK_MIN) return true;
    if (questionBankHasMetaPollution(bank)) return true;
    if (meta.pendingLlm) return true;
    return false;
  });
}

/** Clear stuck pendingLlm flags when the bank is already usable/finished. */
export function healStuckQuestionBankMeta(source = {}) {
  const meta = source?.questionBankMeta || {};
  if (!meta.pendingLlm) return source;
  const bank = Array.isArray(source.questionBank) ? source.questionBank : [];
  const usable = usableBankCount(source);
  const target = Math.max(
    DOCUMENT_BANK_MIN,
    Math.min(DOCUMENT_BANK_MAX, Number(meta.targetCount) || DOCUMENT_BANK_MIN)
  );
  const finished = Boolean(meta.generated) && usable >= PRACTICE_DRAW_MIN && !questionBankHasMetaPollution(bank);
  const fullSeed = !meta.generated && usable >= target && !questionBankHasMetaPollution(bank);
  if (!finished && !fullSeed) return source;
  return {
    ...source,
    questionBankMeta: {
      ...meta,
      pendingLlm: false,
      generated: meta.generated || fullSeed,
      healedStuckPending: true
    }
  };
}

export {
  isMetaDerivedQuestion,
  stripStudyMetaContent,
  extractStudyConceptTitles
} from "./study-content.mjs";
