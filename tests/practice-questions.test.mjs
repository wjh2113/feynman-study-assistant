import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPracticeCorpus,
  resolvePracticeQuestionCount,
  PRACTICE_QUESTION_MIN,
  PRACTICE_QUESTION_MAX
} from "../server/services/practice-questions.mjs";

test("buildPracticeCorpus includes selected filenames and summaries", () => {
  const corpus = buildPracticeCorpus([
    {
      name: "【知识点总结】日语-第3课.md",
      summary: { summary: "一类形容词与二类形容词", keyPoints: ["修饰名词", "做谓语"] },
      parsedPreview: "一类形容词在修饰名词时使用连体形。"
    },
    {
      name: "【知识点总结】日语-第4课.md",
      summary: { summary: "动词变形", keyPoints: ["ます形"] },
      parsedPreview: "ます形用于礼貌表达。"
    }
  ], { maxChars: 4000 });

  assert.match(corpus, /日语-第3课/);
  assert.match(corpus, /一类形容词/);
  assert.match(corpus, /日语-第4课/);
});

test("resolvePracticeQuestionCount scales between 5 and 15 by material length", () => {
  const short = resolvePracticeQuestionCount([
    { name: "短.md", summary: { summary: "短" }, parsedPreview: "很短" }
  ]);
  assert.equal(short, PRACTICE_QUESTION_MIN);

  const medium = resolvePracticeQuestionCount([
    {
      name: "中.md",
      summary: { summary: "x".repeat(200), keyPoints: ["a", "b"] },
      parsedPreview: "y".repeat(4500)
    }
  ]);
  assert.ok(medium > PRACTICE_QUESTION_MIN);
  assert.ok(medium < PRACTICE_QUESTION_MAX);

  const longMany = resolvePracticeQuestionCount(
    Array.from({ length: 6 }, (_, index) => ({
      name: `长-${index}.md`,
      summary: { summary: "s".repeat(300), keyPoints: ["k1", "k2", "k3"] },
      parsedPreview: "p".repeat(8000)
    })),
    Array.from({ length: 12 }, (_, index) => ({ title: `概念${index}` }))
  );
  assert.equal(longMany, PRACTICE_QUESTION_MAX);
});
