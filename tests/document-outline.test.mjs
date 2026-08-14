import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocumentOutline, extractOutlineSections } from "../server/document-outline.mjs";

test("extractOutlineSections picks numbered and short titles", () => {
  const sections = extractOutlineSections(`日语五十音图
日本概况
1. 平假名
这是一段很长的说明文字，不应该被当成标题因为太长而且以句号结束。
2. 片假名
[OCR识别]
图片内容说明`);
  assert.ok(sections.some((item) => item.title.includes("五十音")));
  assert.ok(sections.some((item) => /平假名/.test(item.title)));
  assert.ok(sections.some((item) => item.title === "OCR 识别内容"));
});

test("extractOutlineSections picks Markdown ATX headings", () => {
  const sections = extractOutlineSections(`# 能力边界
正文说明不确定性。
## 数据飞轮
反馈改善模型。
### 最小验证
先验证最危险的假设。`);
  assert.equal(sections[0]?.title, "能力边界");
  assert.equal(sections[0]?.level, 1);
  assert.ok(sections.some((item) => item.title === "数据飞轮" && item.level === 2));
  assert.ok(sections.some((item) => item.title === "最小验证" && item.level === 3));
});

test("extractOutlineSections still finds Markdown after page prefix", () => {
  const sections = extractOutlineSections(`第 1 页
# AI 产品方法论
## 能力边界
高风险回答必须设置人工确认。`);
  assert.ok(sections.some((item) => item.title === "AI 产品方法论"));
  assert.ok(sections.some((item) => item.title === "能力边界"));
});

test("buildDocumentOutline marks partial when OCR skipped", () => {
  const outline = buildDocumentOutline({
    filename: "demo.docx",
    pages: [{ page: 1, text: "日语五十音图\n日本概况\n正文内容较多。" }],
    parseReport: {
      nativeCharacters: 100,
      ocrCharacters: 50,
      imagesFound: 154,
      imagesOcrd: 20,
      imagesSkipped: 134,
      warnings: ["OCR 上限"]
    }
  }, { chunkCount: 19, indexedCharacters: 12000 });
  assert.equal(outline.completeness, "partial");
  assert.equal(outline.stats.imagesSkipped, 134);
  assert.ok(outline.notes.length >= 1);
  assert.ok(outline.sections.length >= 1);
});
