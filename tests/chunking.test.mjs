import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chunkSources, headingInfo, summarizeChunks } from "../server/chunking.mjs";
import { fallbackRankCandidates } from "../server/embedding.mjs";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

test("语义切片保留章节父块、表格和适中长度子块", () => {
  const paragraph = "用户研究不是收集意见，而是围绕关键决策寻找证据。需要区分用户表达的偏好、真实行为和业务约束，并通过连续追问验证因果关系。";
  const source = {
    documentKey: "doc-semantic",
    filename: "产品研究.md",
    pages: [
      {
        page: 1,
        text: `# 用户研究方法\n\n## 一、问题定义\n\n${paragraph.repeat(12)}\n\n| 指标 | 含义 |\n| --- | --- |\n| 留存 | 持续价值 |\n| 转化 | 行动结果 |`
      },
      {
        page: 2,
        text: `## 二、验证与边界\n\n${paragraph.repeat(10)}`
      }
    ]
  };
  const result = chunkSources([source]);
  assert.ok(result.parents.length >= 2);
  assert.ok(result.chunks.length >= 2);
  assert.ok(result.chunks.every((chunk) => chunk.parentId && chunk.parentContent));
  assert.ok(result.chunks.every((chunk) => chunk.headingPath && chunk.content.length <= 1200));
  assert.ok(result.chunks.some((chunk) => /指标.*含义[\s\S]*留存.*持续价值/.test(chunk.parentContent) || /指标.*含义[\s\S]*留存.*持续价值/.test(chunk.content)));
  assert.ok(result.chunks.some((chunk) => /问题定义/.test(chunk.headingPath)));
  assert.ok(result.chunks.some((chunk) => /验证与边界/.test(chunk.headingPath)));
  assert.ok(result.chunks.filter((chunk) => /问题定义/.test(chunk.headingPath)).every((chunk) => chunk.page === 1 && chunk.pageEnd === 1));
  assert.ok(result.chunks.filter((chunk) => /验证与边界/.test(chunk.headingPath)).every((chunk) => chunk.page === 2 && chunk.pageEnd === 2));
});

test("标题识别不再把短句、目录行和句号列表当章节", () => {
  assert.equal(headingInfo("会前"), null);
  assert.equal(headingInfo("1.1.\t职场沟通\t3"), null);
  assert.equal(headingInfo("1、你要的是一个公司介绍。"), null);
  assert.deepEqual(headingInfo("## 向上管理"), { level: 2, title: "向上管理" });
  assert.equal(headingInfo("1.2 向上管理")?.level, 2);
});

test("职场生活类长文重切后块数显著下降且中位长度回到目标区间", () => {
  const samplePath = path.join(fixtureDir, "workplace-life-sample.txt");
  const fullPath = path.join(fixtureDir, "workplace-life.txt");
  let text = "";
  try {
    text = readFileSync(fullPath, "utf8");
  } catch {
    text = readFileSync(samplePath, "utf8");
  }
  const result = chunkSources([{
    documentKey: "workplace",
    filename: "05 日常生活的技巧 -C- 职场生活 v1.0.docx",
    pages: [{ page: 1, text }]
  }]);
  const stats = summarizeChunks(result.chunks);
  assert.ok(stats.chunks > 0);
  // Full fixture previously produced ~1345 shards; optimized path should stay well under half.
  if (text.length > 100_000) {
    assert.ok(stats.chunks < 400, `chunks=${stats.chunks}`);
    assert.ok(stats.p50 >= 400, `p50=${stats.p50}`);
    assert.ok(stats.tiny_lt80 / stats.chunks < 0.1, `tiny ratio=${stats.tiny_lt80}/${stats.chunks}`);
  } else {
    assert.ok(stats.avg >= 200, `avg=${stats.avg}`);
  }
});

test("Reranker 不可用时可按向量与融合分数降级排序", () => {
  const ranked = fallbackRankCandidates([
    { id: "low", vectorScore: 0.21, fusionScore: 0.01 },
    { id: "high", vectorScore: 0.78, fusionScore: 0.02 },
    { id: "mid", vectorScore: 0.46, fusionScore: 0.015 }
  ], 2);
  assert.deepEqual(ranked.map((item) => item.id), ["high", "mid"]);
  assert.equal(ranked[0].rerankScore, 0.78);
});
