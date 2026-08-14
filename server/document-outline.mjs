/**
 * Build a human-checkable outline after a document is parsed.
 */

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripPagePrefix(line) {
  return cleanLine(line).replace(/^第\s*\d+\s*页\s*[：:]\s*/, "");
}

function headingInfo(line) {
  const text = stripPagePrefix(line);
  if (!text) return null;
  const markdown = text.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) {
    return {
      level: markdown[1].length,
      title: cleanLine(markdown[2].replace(/#+\s*$/, ""))
    };
  }
  const numbered = text.match(
    /^(第[一二三四五六七八九十百千0-9]+[章节篇部课]|[一二三四五六七八九十]+[、.．]|[（(]?[0-9]+(?:\.[0-9]+){0,3}[)）]?[、.．\s]|[（(][一二三四五六七八九十0-9]+[）)])\s*(.+)$/
  );
  if (numbered && text.length <= 100) {
    const depth = /^\d+(?:\.\d+)/.test(text) ? Math.min(6, (text.match(/\./g) || []).length + 1) : 2;
    return { level: depth, title: text };
  }
  // Short title-like lines common in course notes
  if (
    text.length >= 2 &&
    text.length <= 40 &&
    !/[。！？；，,;:：]$/.test(text) &&
    !text.includes("|") &&
    !/^图片\s*\d+/.test(text) &&
    !/^\[OCR/.test(text)
  ) {
    return { level: 3, title: text };
  }
  return null;
}

function pushSection(sections, seen, heading) {
  if (!heading?.title) return;
  const key = `${heading.level}:${heading.title}`;
  if (seen.has(key)) return;
  seen.add(key);
  sections.push({
    level: heading.level,
    title: heading.title,
    source: heading.source || "text"
  });
}

export function extractOutlineSections(fullText, { limit = 48 } = {}) {
  const text = String(fullText || "").replace(/\r\n?/g, "\n");
  const sections = [];
  const seen = new Set();

  // Prefer explicit Markdown ATX headings even if surrounding whitespace was mangled.
  for (const match of text.matchAll(/(^|\n)\s*(#{1,6})\s+([^\n#][^\n]*)/g)) {
    pushSection(sections, seen, {
      level: match[2].length,
      title: cleanLine(match[3]),
      source: "markdown"
    });
    if (sections.length >= limit) return sections.slice(0, limit);
  }

  const lines = text
    .split(/\n+|(?<=[。！？])/)
    .map(cleanLine)
    .filter(Boolean);

  for (const line of lines) {
    if (line === "[OCR识别]" || line.startsWith("[OCR识别]")) {
      pushSection(sections, seen, { level: 2, title: "OCR 识别内容", source: "ocr" });
      continue;
    }
    const heading = headingInfo(line);
    if (!heading) continue;
    pushSection(sections, seen, heading);
    if (sections.length >= limit) break;
  }
  return sections.slice(0, limit);
}

export function buildDocumentOutline(source, extras = {}) {
  const report = source.parseReport || {};
  const pageText = (source.pages || []).map((page) => page.text || "").filter(Boolean).join("\n\n");
  const previewText = source.parsedPreview || "";
  const fullText = pageText || previewText;
  const sections = extractOutlineSections(fullText);
  const imagesFound = Number(report.imagesFound || 0);
  const imagesOcrd = Number(report.imagesOcrd || 0);
  const imagesSkipped = Number(
    report.imagesSkipped ?? Math.max(0, imagesFound - imagesOcrd)
  );
  const notes = [...(report.warnings || [])];
  if (!sections.length && fullText) {
    notes.push("未能自动识别章节标题，请结合原文预览核对。");
  }
  if (report.ocrStatus === "disabled" && imagesFound > 0) {
    notes.push("个人设置中已关闭图片 OCR，大纲仅基于正文文字。");
  } else if (imagesSkipped > 0) {
    notes.push(
      `图片 OCR 未全部完成：共 ${imagesFound} 张，已识别 ${imagesOcrd} 张，未处理 ${imagesSkipped} 张。大纲可能缺少图片中的知识点，可在个人设置中提高识别张数后重新解析。`
    );
  }

  let completeness = "complete";
  if (
    imagesSkipped > 0 ||
    report.ocrStatus === "partial" ||
    report.ocrStatus === "not_configured" ||
    report.ocrStatus === "disabled" ||
    notes.length
  ) {
    completeness = "partial";
  }
  if (!fullText.trim()) completeness = "empty";

  return {
    title: source.filename || source.name || "未命名资料",
    sections,
    stats: {
      nativeCharacters: Number(report.nativeCharacters || 0),
      ocrCharacters: Number(report.ocrCharacters || 0),
      mergedCharacters: fullText.length,
      indexedCharacters: Number(extras.indexedCharacters || 0),
      chunkCount: Number(extras.chunkCount || source.chunks || 0),
      imagesFound,
      imagesOcrd,
      imagesSkipped,
      pages: (source.pages || []).length || Number(source.pages) || 1
    },
    completeness,
    notes
  };
}
