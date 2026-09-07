import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_BANK_MAX,
  DOCUMENT_BANK_MIN,
  PRACTICE_DRAW_MAX,
  PRACTICE_DRAW_MIN,
  buildHeuristicDocumentBank,
  resolveDocumentBankSize,
  resolvePracticeDrawCount,
  sampleQuestionsFromSources
} from "../src/lib/document-question-bank.mjs";

test("resolveDocumentBankSize stays between 10 and 30", () => {
  const short = resolveDocumentBankSize({
    name: "短.md",
    summary: { summary: "短" },
    parsedPreview: "很少字"
  });
  assert.equal(short, DOCUMENT_BANK_MIN);

  const long = resolveDocumentBankSize({
    name: "长.md",
    summary: { summary: "s".repeat(500), keyPoints: ["a", "b", "c"] },
    parsedPreview: "p".repeat(40_000)
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
      questionBank: buildHeuristicDocumentBank({ id: "d1", name: "一课.md", summary: { keyPoints: ["形容词"] } }, 12)
    },
    {
      id: "d2",
      name: "二课.md",
      questionBank: buildHeuristicDocumentBank({ id: "d2", name: "二课.md", summary: { keyPoints: ["动词"] } }, 12)
    }
  ];
  const drawn = sampleQuestionsFromSources(sources, 8, () => 0.42);
  assert.equal(drawn.length, 8);
  assert.equal(new Set(drawn.map((item) => item.id)).size, 8);
  assert.ok(drawn.every((item) => item.question));
});
