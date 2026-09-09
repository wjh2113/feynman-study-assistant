import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_BANK_MAX,
  DOCUMENT_BANK_MIN,
  PRACTICE_DRAW_MAX,
  PRACTICE_DRAW_MIN,
  buildHeuristicDocumentBank,
  questionBankHasMetaPollution,
  resolveDocumentBankSize,
  resolvePracticeDrawCount,
  sampleQuestionsFromSources
} from "../src/lib/document-question-bank.mjs";
import {
  extractStudyConceptTitles,
  isMetaDerivedQuestion,
  isStudyMetaText,
  stripStudyMetaContent
} from "../src/lib/study-content.mjs";

test("resolveDocumentBankSize stays between 30 and 100", () => {
  const short = resolveDocumentBankSize({
    name: "短.md",
    summary: { summary: "短" },
    parsedPreview: "很少字"
  });
  assert.equal(short, DOCUMENT_BANK_MIN);

  const long = resolveDocumentBankSize({
    name: "长.md",
    summary: { summary: "s".repeat(500), keyPoints: ["a", "b", "c"] },
    parsedPreview: "p".repeat(80_000)
  });
  assert.equal(long, DOCUMENT_BANK_MAX);
});

test("resolvePracticeDrawCount stays between 5 and 15", () => {
  const few = resolvePracticeDrawCount([
    { name: "a.md", parsedPreview: "短", summary: { summary: "x" } }
  ]);
  assert.equal(few, PRACTICE_DRAW_MIN);

  const many = resolvePracticeDrawCount(
    Array.from({ length: 8 }, (_, index) => ({
      name: `f-${index}.md`,
      summary: { summary: "s".repeat(400) },
      parsedPreview: "p".repeat(10_000)
    }))
  );
  assert.equal(many, PRACTICE_DRAW_MAX);
});

test("sampleQuestionsFromSources draws without duplicates from banks", () => {
  const sources = [
    {
      id: "d1",
      name: "一课.md",
      questionBank: buildHeuristicDocumentBank({ id: "d1", name: "一课.md", summary: { keyPoints: ["形容词"] } }, 32)
    },
    {
      id: "d2",
      name: "二课.md",
      questionBank: buildHeuristicDocumentBank({ id: "d2", name: "二课.md", summary: { keyPoints: ["动词"] } }, 32)
    }
  ];
  const drawn = sampleQuestionsFromSources(sources, 8, () => 0.42);
  assert.equal(drawn.length, 8);
  assert.equal(new Set(drawn.map((item) => item.id)).size, 8);
  assert.ok(drawn.every((item) => item.question));
});

test("stripStudyMetaContent removes PDF conversion notes and page separators", () => {
  const cleaned = stripStudyMetaContent(`# TRY！N5 第 2 课

> 整理自《TRY！N5知识点汇总资料.pdf》（52 页），按页序转写为 Markdown。「----」分隔线为原资料分页处。

## 一、「です」「ます」

ます形表示礼貌语。
----
继续学习助词。
`);
  assert.match(cleaned, /です/);
  assert.doesNotMatch(cleaned, /按页序转写/);
  assert.doesNotMatch(cleaned, /分隔线为原资料分页/);
  assert.equal(isStudyMetaText("「----」分隔线为原资料分页处。"), true);
});

test("heuristic bank prefers headings over conversion notes", () => {
  const source = {
    id: "n5",
    name: "TRY！N5知识点汇总资料.md",
    parsedPreview: `# TRY！N5 知识点汇总

> 整理自《TRY！N5知识点汇总资料.pdf》（52 页），按页序转写为 Markdown。「----」分隔线为原资料分页处。

## 动词ます形

### 助词に与で

一类动词变形规则。
`,
    summary: {
      keyPoints: [
        "pdf》（52 页），按页序转写为 Markdown。",
        "「----」分隔线为原资料分页处。",
        "动词分为一类、二类、三类"
      ]
    }
  };
  const titles = extractStudyConceptTitles(source);
  assert.ok(titles.some((title) => /ます|助词/.test(title)));
  assert.equal(titles.some((title) => /转写|分隔线/.test(title)), false);

  const bank = buildHeuristicDocumentBank(source, 30);
  assert.equal(bank.length, 30);
  assert.equal(bank.some((item) => isMetaDerivedQuestion(item)), false);
  assert.equal(questionBankHasMetaPollution(bank), false);
});
