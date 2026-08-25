import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeAnalysisSources,
  mapDocumentIdsToDeduped,
  preferAnalysisSource
} from "../src/lib/analysis-sources.mjs";
import { pickAnswerSources } from "../server/embedding.mjs";

test("dedupeAnalysisSources keeps the best entry per filename", () => {
  const sources = dedupeAnalysisSources([
    { id: "a", name: "笔记.md", status: "ready", chunks: 10 },
    { id: "b", name: "笔记.md", status: "ready", chunks: 30 },
    { id: "c", name: "其他.txt", status: "ready", chunks: 5 }
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources.find((item) => item.name === "笔记.md")?.id, "b");
});

test("mapDocumentIdsToDeduped collapses duplicate selections", () => {
  const sources = [
    { id: "a", name: "笔记.md" },
    { id: "b", name: "笔记.md", chunks: 20 }
  ];
  assert.deepEqual(mapDocumentIdsToDeduped(["a", "b"], sources), ["b"]);
});

test("preferAnalysisSource favors ready sources with more chunks", () => {
  assert.equal(
    preferAnalysisSource({ id: "b", status: "ready", chunks: 12 }, { id: "a", status: "processing", chunks: 40 }),
    true
  );
});

test("pickAnswerSources accepts strong hybrid retrieval when rerank is low", () => {
  const candidates = [
    { id: "1", fusionScore: 0.08, keywordScore: 0.05, vectorScore: 0.3, content: "五十音图" }
  ];
  const reranked = [{ ...candidates[0], rerankScore: 0.12 }];
  const picked = pickAnswerSources(candidates, reranked, 0.35);
  assert.equal(picked.insufficient, false);
  assert.ok(picked.sources.length);
});

test("pickAnswerSources rejects unrelated queries", () => {
  const candidates = [
    { id: "1", fusionScore: 0.01, keywordScore: 0.02, vectorScore: 0.12, content: "无关内容" }
  ];
  const reranked = [{ ...candidates[0], rerankScore: 0.08 }];
  const picked = pickAnswerSources(candidates, reranked, 0.35);
  assert.equal(picked.insufficient, true);
  assert.equal(picked.sources.length, 0);
});
