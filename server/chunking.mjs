import { randomUUID } from "node:crypto";

const DEFAULT_CHILD_MIN = 420;
const DEFAULT_CHILD_TARGET = 700;
const DEFAULT_CHILD_MAX = 900;
const DEFAULT_PARENT_MAX = 3200;
const COALESCE_MIN = 260;

/** Normalize common query aliases before tokenization / embedding. */
export function normalizeRetrievalQuery(value) {
  return String(value || "")
    .replace(/50音/gi, "五十音")
    .replace(/46音/gi, "四十六音");
}

export function keywordTokens(value) {
  const text = normalizeRetrievalQuery(String(value || "").toLowerCase());
  const latin = text.match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  const chineseRuns = text.match(/[\u3400-\u9fff]+/g) || [];
  const chinese = [];
  for (const run of chineseRuns) {
    if (run.length === 1) chinese.push(run);
    for (let index = 0; index < run.length - 1; index += 1) chinese.push(run.slice(index, index + 2));
    if (run.length >= 3) chinese.push(run.slice(0, 3));
  }
  return [...new Set([...latin, ...chinese])].slice(0, 320);
}

function isTableLine(line) {
  return (String(line).match(/\|/g) || []).length >= 2 || /\S\s{2,}\S/.test(String(line)) || String(line).includes("\t");
}

function looksLikeTocLine(text) {
  // "1.1 职场沟通 …… 3" / tab + page number
  return /\t\d+\s*$/.test(text) || /\s{2,}\d{1,4}\s*$/.test(text) || /错误!\s*未定义书签/.test(text);
}

/** Exported for unit tests. */
export function headingInfo(line) {
  const text = String(line || "").trim();
  if (!text || looksLikeTocLine(text) || isTableLine(text)) return null;

  const markdown = text.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) return { level: markdown[1].length, title: markdown[2].trim() };

  // Explicit chapter/section markers only — do not treat every short line as a heading.
  const chapter = text.match(/^(第[一二三四五六七八九十百千0-9]+[章节篇部节])\s*(.*)$/);
  if (chapter && text.length <= 40 && !/[。！？!?；;]/.test(text)) {
    return { level: 1, title: text };
  }

  const numbered = text.match(
    /^((?:[一二三四五六七八九十]+[、.])|(?:\d+(?:\.\d+){0,3}[、.\s])|(?:[（(][一二三四五六七八九十0-9]+[）)]))\s*(.+)$/
  );
  if (numbered) {
    const titleBody = String(numbered[2] || "").trim();
    // Skip sentence-like list items and ultra-short markers ("嗯", "会前").
    if (
      titleBody.length >= 2
      && titleBody.length <= 40
      && text.length <= 48
      && !/[。！？!?；;]/.test(text)
      && !/^(好嘞|收到|常见错误|基本原理|问出来|目录)$/.test(titleBody)
    ) {
      const depth = /^\d+(?:\.\d+)+/.test(text) ? Math.min(6, (text.match(/\./g) || []).length + 1) : 2;
      return { level: depth, title: text };
    }
  }

  return null;
}

function splitLongText(text, max = DEFAULT_CHILD_MAX) {
  const value = String(text || "").trim();
  if (value.length <= max) return [value];
  const sentences = value.split(/(?<=[。！？!?；;])|\n/).map((item) => item.trim()).filter(Boolean);
  const output = [];
  let current = "";
  for (const sentence of sentences.length ? sentences : [value]) {
    if (sentence.length > max) {
      if (current) output.push(current);
      for (let start = 0; start < sentence.length; start += max) output.push(sentence.slice(start, start + max));
      current = "";
    } else if (!current || current.length + sentence.length + 1 <= max) {
      current = [current, sentence].filter(Boolean).join("\n");
    } else {
      output.push(current);
      current = sentence;
    }
  }
  if (current) output.push(current);
  return output;
}

function pageBlocks(source) {
  const blocks = [];
  const headingStack = [];
  for (const page of source.pages || []) {
    const text = String(page.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const groups = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
    for (const group of groups) {
      const lines = group.split("\n").map((item) => item.trim()).filter(Boolean);
      let tableLines = [];
      const flushTable = () => {
        if (!tableLines.length) return;
        blocks.push({ type: "table", text: tableLines.join("\n"), page: Number(page.page || 1), headingPath: [...headingStack] });
        tableLines = [];
      };
      for (const line of lines) {
        if (isTableLine(line)) {
          tableLines.push(line);
          continue;
        }
        flushTable();
        const heading = headingInfo(line);
        if (heading) {
          headingStack.splice(Math.max(0, heading.level - 1));
          headingStack[heading.level - 1] = heading.title;
          // Boundary only — do not emit heading-only body chunks.
          blocks.push({
            type: "heading",
            text: "",
            page: Number(page.page || 1),
            headingPath: headingStack.filter(Boolean)
          });
        } else {
          for (const part of splitLongText(line)) {
            blocks.push({ type: "paragraph", text: part, page: Number(page.page || 1), headingPath: headingStack.filter(Boolean) });
          }
        }
      }
      flushTable();
    }
  }
  return blocks;
}

function buildParentSections(source) {
  const parents = [];
  let current = null;
  const flush = () => {
    if (!current?.blocks.length) return;
    // Drop parents that only contain empty heading markers.
    const bodyBlocks = current.blocks.filter((block) => block.type !== "heading" || block.text);
    if (!bodyBlocks.length) {
      current = null;
      return;
    }
    current.blocks = bodyBlocks;
    current.content = current.blocks.map((block) => block.text).filter(Boolean).join("\n\n");
    current.pageEnd = current.blocks.at(-1).page;
    parents.push(current);
    current = null;
  };

  for (const block of pageBlocks(source)) {
    const pathLabel = block.headingPath.join(" > ") || source.filename;
    const currentLength = current?.blocks.reduce((sum, item) => sum + String(item.text || "").length + 2, 0) || 0;
    const headingChanged = current && block.type === "heading" && pathLabel !== current.headingPath;
    if (!current || headingChanged || currentLength + String(block.text || "").length > DEFAULT_PARENT_MAX) {
      flush();
      current = {
        id: randomUUID(),
        documentKey: source.documentKey,
        filename: source.filename,
        headingPath: pathLabel,
        pageStart: block.page,
        pageEnd: block.page,
        blocks: []
      };
    }
    if (block.type === "heading" && !block.text) {
      // Keep section boundary via headingPath on subsequent blocks; skip empty marker body.
      continue;
    }
    current.blocks.push(block);
  }
  flush();
  return parents;
}

function stripChapterPrefix(content = "") {
  return String(content || "").replace(/^章节：[^\n]*\n/, "");
}

function coalesceTinyChunks(chunks) {
  if (chunks.length <= 1) return chunks;
  const merged = [];
  for (const chunk of chunks) {
    const prev = merged.at(-1);
    if (prev && prev.content.length < COALESCE_MIN) {
      const body = stripChapterPrefix(chunk.content);
      if (prev.content.length + body.length + 2 <= DEFAULT_CHILD_MAX + 220) {
        prev.content = `${prev.content}\n\n${body}`.trim();
        prev.searchTokens = keywordTokens(prev.content).join(" ");
        prev.pageEnd = chunk.pageEnd;
        continue;
      }
    }
    merged.push({ ...chunk });
  }

  // Merge remaining tiny tails into previous when possible.
  if (merged.length > 1 && merged.at(-1).content.length < DEFAULT_CHILD_MIN) {
    const tail = merged.pop();
    const previous = merged.at(-1);
    const body = stripChapterPrefix(tail.content);
    if (previous.content.length + body.length + 2 <= DEFAULT_CHILD_MAX + 220) {
      previous.content = `${previous.content}\n\n${body}`.trim();
      previous.searchTokens = keywordTokens(previous.content).join(" ");
      previous.pageEnd = tail.pageEnd;
    } else {
      merged.push(tail);
    }
  }
  return merged;
}

function childrenForParent(parent, startIndex) {
  const chunks = [];
  const atoms = parent.blocks
    .filter((block) => block.type !== "heading" && String(block.text || "").trim())
    .flatMap((block) => (
      splitLongText(block.text).map((text) => ({ text, page: block.page }))
    ));
  if (!atoms.length) return [];

  let current = [];
  let currentLength = 0;
  const flush = () => {
    if (!current.length) return;
    const raw = current.map((item) => item.text).join("\n\n").trim();
    if (!raw) {
      current = [];
      currentLength = 0;
      return;
    }
    const prefix = parent.headingPath ? `章节：${parent.headingPath}\n` : "";
    chunks.push({
      documentKey: parent.documentKey,
      filename: parent.filename,
      page: current[0].page,
      pageEnd: current.at(-1).page,
      chunkIndex: startIndex + chunks.length,
      parentId: parent.id,
      parentContent: parent.content,
      headingPath: parent.headingPath,
      content: `${prefix}${raw}`.trim(),
      searchTokens: keywordTokens(`${parent.headingPath} ${raw}`).join(" ")
    });
    current = [];
    currentLength = 0;
  };

  for (const atom of atoms) {
    const nextLength = currentLength + atom.text.length + (current.length ? 2 : 0);
    if (current.length && nextLength > DEFAULT_CHILD_MAX && currentLength >= DEFAULT_CHILD_MIN) flush();
    if (current.length && currentLength + atom.text.length + 2 > DEFAULT_CHILD_MAX) flush();
    current.push(atom);
    currentLength += atom.text.length + (current.length > 1 ? 2 : 0);
    if (currentLength >= DEFAULT_CHILD_TARGET) flush();
  }
  flush();

  const coalesced = coalesceTinyChunks(chunks);
  return coalesced.map((chunk, index) => ({
    ...chunk,
    chunkIndex: startIndex + index
  }));
}

export function chunkSources(sources) {
  const parents = [];
  const chunks = [];
  for (const source of sources) {
    let chunkIndex = 0;
    const sourceParents = buildParentSections(source);
    parents.push(...sourceParents);
    for (const parent of sourceParents) {
      const children = childrenForParent(parent, chunkIndex);
      chunks.push(...children);
      chunkIndex += children.length;
    }
  }
  return { parents, chunks };
}

/** Stats helper for rechunk comparisons / ops scripts. */
export function summarizeChunks(chunks = []) {
  const lens = chunks.map((chunk) => String(chunk.content || "").length).sort((a, b) => a - b);
  if (!lens.length) {
    return {
      chunks: 0, p50: 0, p90: 0, avg: 0, min: 0, max: 0,
      tiny_lt80: 0, small_80_300: 0, mid_301_800: 0, large_gt800: 0
    };
  }
  const pct = (p) => lens[Math.floor((lens.length - 1) * p)];
  return {
    chunks: lens.length,
    p50: pct(0.5),
    p90: pct(0.9),
    avg: Math.round(lens.reduce((sum, n) => sum + n, 0) / lens.length),
    min: lens[0],
    max: lens.at(-1),
    tiny_lt80: lens.filter((n) => n < 80).length,
    small_80_300: lens.filter((n) => n >= 80 && n <= 300).length,
    mid_301_800: lens.filter((n) => n > 300 && n <= 800).length,
    large_gt800: lens.filter((n) => n > 800).length
  };
}
