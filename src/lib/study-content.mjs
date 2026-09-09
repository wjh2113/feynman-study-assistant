/**
 * Helpers to keep study Q&A focused on real learning content,
 * not PDF conversion notes / page separators / parse boilerplate.
 */

const META_LINE_PATTERNS = [
  /按页序转写/i,
  /转写为\s*Markdown/i,
  /分隔线为原资料分页/,
  /「-{2,}」.*分页/,
  /整理自《.*\.pdf/i,
  /\.pdf》/,
  /\(\s*\d+\s*页\s*\).*(Markdown|转写)/i,
  /未提取到可读文字/,
  /配置 OCR/,
  /解析状态/,
  /原始文件/,
  /^第\s*\d+\s*页\s*$/
];

const META_QUESTION_PATTERNS = [
  /按页序转写/i,
  /转写为\s*Markdown/i,
  /分隔线为原资料分页/,
  /「-{2,}」/,
  /\.pdf》/,
  /分页处/
];

export function isStudyMetaText(text = "") {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/^[-—–_*]{3,}$/.test(value)) return true;
  if (/^>\s*/.test(value) && META_LINE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return META_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

/** Remove conversion notes, separators, and empty lines from study corpus text. */
export function stripStudyMetaContent(text = "") {
  return String(text || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isStudyMetaText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function filterStudyKeyPoints(points = [], limit = 8) {
  return (Array.isArray(points) ? points : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && !isStudyMetaText(item) && item.length >= 4)
    .slice(0, limit);
}

export function isMetaDerivedQuestion(question = {}) {
  const concept = String(question?.concept || "").trim();
  const body = `${question?.question || ""} ${concept} ${question?.why || ""}`;
  if (isStudyMetaText(concept)) return true;
  return META_QUESTION_PATTERNS.some((pattern) => pattern.test(body));
}

/** Prefer markdown headings, then clean key points, for heuristic bank titles. */
export function extractStudyConceptTitles(source = {}, limit = 16) {
  const pagesText = Array.isArray(source.pages)
    ? source.pages.map((page) => String(page?.text || "")).join("\n")
    : "";
  const raw = stripStudyMetaContent(pagesText || source.parsedPreview || "");
  const headings = [...raw.matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((match) => String(match[1] || "").replace(/[*_`#]/g, "").trim())
    .filter((title) => title && !isStudyMetaText(title) && title.length >= 2 && title.length <= 48);

  const keyPoints = filterStudyKeyPoints(source.summary?.keyPoints || [], limit);
  const unique = [];
  const seen = new Set();
  for (const title of [...headings, ...keyPoints]) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(title);
    if (unique.length >= limit) break;
  }
  return unique;
}
