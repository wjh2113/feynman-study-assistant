import assert from "node:assert/strict";
import test from "node:test";
import { chunkSources } from "../server/chunking.mjs";

test("语义切片保留章节父块、表格和500至800字左右的子块", () => {
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
  assert.ok(result.chunks.length >= 3);
  assert.ok(result.chunks.every((chunk) => chunk.parentId && chunk.parentContent));
  assert.ok(result.chunks.every((chunk) => chunk.headingPath && chunk.content.length <= 960));
  assert.ok(result.chunks.some((chunk) => /指标.*含义[\s\S]*留存.*持续价值/.test(chunk.parentContent)));
  assert.ok(result.chunks.some((chunk) => /问题定义/.test(chunk.headingPath)));
  assert.ok(result.chunks.some((chunk) => /验证与边界/.test(chunk.headingPath)));
  assert.ok(result.chunks.filter((chunk) => /问题定义/.test(chunk.headingPath)).every((chunk) => chunk.page === 1 && chunk.pageEnd === 1));
  assert.ok(result.chunks.filter((chunk) => /验证与边界/.test(chunk.headingPath)).every((chunk) => chunk.page === 2 && chunk.pageEnd === 2));
});
