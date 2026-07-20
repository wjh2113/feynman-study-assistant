import { randomUUID } from "node:crypto";

const DEFAULT_CHILD_MIN = 500;
const DEFAULT_CHILD_TARGET = 650;
const DEFAULT_CHILD_MAX = 800;
const DEFAULT_PARENT_MAX = 3200;

export function keywordTokens(value) {
  const text = String(value || "").toLowerCase();
  const latin = text.match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  const chineseRuns = text.match(/[\u3400-\u9fff]+/g) || [];
  const chinese = [];
  for (const run of chineseRuns) {
    if (run.length === 1) chinese.push(run);
    for (let index = 0; index < run.length - 1; index += 1) chinese.push(run.slice(index, index + 2));
  }
  return [...new Set([...latin, ...chinese])].slice(0, 320);
}

function headingInfo(line) {
  const text = String(line || "").trim();
  const markdown = text.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) return { level: markdown[1].length, title: markdown[2].trim() };
  const numbered = text.match(/^(第[一二三四五六七八九十百0-9]+[章节篇部]|[一二三四五六七八九十]+[、.]|\d+(?:\.\d+){0,3}[、.\s]|[（(][一二三四五六七八九十0-9]+[）)])\s*(.+)$/);
  if (numbered && text.length <= 90) {
    const depth = /^\d+(?:\.\d+)+/.test(text) ? Math.min(6, (text.match(/\./g) || []).length + 1) : 2;
    return { level: depth, title: text };
  }
  if (text.length >= 2 && text.length <= 36 && !/[。！？；，,;:：]$/.test(text) && !isTableLine(text)) {
    return { level: 3, title: text };
  }
  return null;
}

function isTableLine(line) {
  return (String(line).match(/\|/g) || []).length >= 2 || /\S\s{2,}\S/.test(String(line)) || String(line).includes("\t");
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
          blocks.push({ type: "heading", text: heading.title, page: Number(page.page || 1), headingPath: headingStack.filter(Boolean) });
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
    current.content = current.blocks.map((block) => block.text).join("\n\n");
    current.pageEnd = current.blocks.at(-1).page;
    parents.push(current);
    current = null;
  };

  for (const block of pageBlocks(source)) {
    const pathLabel = block.headingPath.join(" > ") || source.filename;
    const currentLength = current?.blocks.reduce((sum, item) => sum + item.text.length + 2, 0) || 0;
    const headingChanged = current && block.type === "heading" && pathLabel !== current.headingPath;
    if (!current || headingChanged || currentLength + block.text.length > DEFAULT_PARENT_MAX) {
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
    current.blocks.push(block);
  }
  flush();
  return parents;
}

function childrenForParent(parent, startIndex) {
  const chunks = [];
  const atoms = parent.blocks.flatMap((block) => (
    splitLongText(block.text).map((text) => ({ text, page: block.page }))
  ));
  let current = [];
  let currentLength = 0;
  const flush = () => {
    if (!current.length) return;
    const raw = current.map((item) => item.text).join("\n\n").trim();
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

  if (chunks.length > 1 && chunks.at(-1).content.length < DEFAULT_CHILD_MIN) {
    const tail = chunks.pop();
    const previous = chunks.at(-1);
    if (previous.content.length + tail.content.length <= DEFAULT_CHILD_MAX + 160) {
      previous.content = `${previous.content}\n\n${tail.content.replace(/^章节：.*\n/, "")}`;
      previous.searchTokens = keywordTokens(previous.content).join(" ");
      previous.pageEnd = tail.pageEnd;
    } else {
      chunks.push(tail);
    }
  }
  return chunks;
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
