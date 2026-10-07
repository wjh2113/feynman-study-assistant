import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRerankDocument,
  RERANK_DOC_CHARS,
  selectRerankPool,
  shouldSkipGatewayRerank
} from "../server/embedding.mjs";

test("selectRerankPool keeps the strongest fusion candidates", () => {
  const pool = selectRerankPool([
    { id: "weak", fusionScore: 0.01, vectorScore: 0.1, keywordScore: 0, content: "a" },
    { id: "strong", fusionScore: 0.02, vectorScore: 0.5, keywordScore: 0.05, content: "b" },
    { id: "mid", fusionScore: 0.015, vectorScore: 0.3, keywordScore: 0.02, content: "c" }
  ], 2);
  assert.deepEqual(pool.map((item) => item.id), ["strong", "mid"]);
});

test("formatRerankDocument clips long chunks", () => {
  const long = "字".repeat(RERANK_DOC_CHARS + 80);
  const text = formatRerankDocument({ headingPath: "第三节", content: long }, 200);
  assert.match(text, /^章节：第三节\n/);
  assert.ok(text.length < long.length);
  assert.ok(text.endsWith("…"));
});

test("shouldSkipGatewayRerank when top fusion lead is clear", () => {
  assert.equal(
    shouldSkipGatewayRerank([
      { id: "1", fusionScore: 0.024, vectorScore: 0.62, keywordScore: 0.05, matchedKeywords: ["沟通"], content: "技巧" },
      { id: "2", fusionScore: 0.012, vectorScore: 0.22, keywordScore: 0.01, matchedKeywords: [], content: "其它" }
    ]),
    true
  );
});

test("shouldSkipGatewayRerank when top two are close", () => {
  assert.equal(
    shouldSkipGatewayRerank([
      { id: "1", fusionScore: 0.018, vectorScore: 0.4, keywordScore: 0.04, matchedKeywords: ["嗯"], content: "a" },
      { id: "2", fusionScore: 0.017, vectorScore: 0.38, keywordScore: 0.03, matchedKeywords: ["嗯"], content: "b" }
    ]),
    false
  );
});
