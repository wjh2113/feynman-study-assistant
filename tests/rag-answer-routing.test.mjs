import assert from "node:assert/strict";
import test from "node:test";
import { isHardRagQuery } from "../server/services/rag-answer.mjs";

test("RAG routes simple questions to fast path and hard ones to quality", () => {
  assert.equal(isHardRagQuery("金字塔原理是什么？", [{ rerankScore: 0.7 }]), false);
  assert.equal(isHardRagQuery("请详细比较归纳与演绎的区别，并说明各自适用边界", [{ rerankScore: 0.6 }]), true);
  assert.equal(isHardRagQuery("A 是什么？B 又是什么？", [{ rerankScore: 0.5 }]), true);
  assert.equal(isHardRagQuery("这个概念指什么", [{ rerankScore: 0.2 }]), true);
});
