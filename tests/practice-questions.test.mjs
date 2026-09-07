import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeCorpus } from "../server/services/practice-questions.mjs";

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
