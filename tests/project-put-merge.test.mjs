import test from "node:test";
import assert from "node:assert/strict";
import { mergeProjectPut } from "../src/lib/project-put-merge.mjs";

test("mergeProjectPut keeps ready map when client sends stale running empty snapshot", () => {
  const existing = {
    id: "p1",
    description: "imported summary",
    analysis: {
      summary: "imported summary",
      modules: [{ id: "m1", title: "A", concepts: [{ id: "c1", title: "X" }] }],
      contentAnalysisStatus: "ready",
      importedPack: { schema: "zhifan-study-pack/v1" },
      sources: [{
        id: "d1",
        name: "a.docx",
        questionBank: [{ question: "q1" }, { question: "q2" }],
        questionBankMeta: { generated: true, pendingLlm: false, capability: "external-import" }
      }]
    }
  };
  const incoming = {
    id: "p1",
    description: "已入库 1 份资料，知识地图生成中…",
    analysis: {
      summary: "已入库 1 份资料，知识地图生成中…",
      modules: [],
      contentAnalysisStatus: "running",
      sources: [{
        id: "d1",
        name: "a.docx",
        questionBank: [{ question: "seed" }],
        questionBankMeta: { generated: false, pendingLlm: true, targetCount: 100 }
      }]
    }
  };

  const merged = mergeProjectPut(existing, incoming);
  assert.equal(merged.analysis.contentAnalysisStatus, "ready");
  assert.equal(merged.analysis.modules.length, 1);
  assert.equal(merged.analysis.summary, "imported summary");
  assert.equal(merged.analysis.sources[0].questionBank.length, 2);
  assert.equal(merged.analysis.sources[0].questionBankMeta.generated, true);
  assert.equal(merged.analysis.sources[0].questionBankMeta.pendingLlm, false);
});

test("mergeProjectPut leaves intentional empty/running updates alone when server has no ready map", () => {
  const existing = {
    id: "p1",
    analysis: { modules: [], contentAnalysisStatus: "pending" }
  };
  const incoming = {
    id: "p1",
    analysis: { modules: [], contentAnalysisStatus: "running", summary: "生成中…" }
  };
  const merged = mergeProjectPut(existing, incoming);
  assert.equal(merged.analysis.contentAnalysisStatus, "running");
  assert.equal(merged.analysis.summary, "生成中…");
});
