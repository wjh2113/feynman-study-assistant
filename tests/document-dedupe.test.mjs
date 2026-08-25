import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeAnalysisSources } from "../src/lib/analysis-sources.mjs";

test("duplicate persisted documents collapse to one source per filename", () => {
  const documents = [
    { id: "d1", filename: "日语学习笔记_v1.0_20260728.md", chunk_count: 76 },
    { id: "d2", filename: "日语学习笔记_v1.0_20260728.md", chunk_count: 76 },
    { id: "d3", filename: "日语学习笔记_v1.0_20260728.md", chunk_count: 76 },
    { id: "d4", filename: "photo.jpg", chunk_count: 3 }
  ];
  const kept = dedupeAnalysisSources(
    documents.map((doc) => ({
      id: doc.id,
      name: doc.filename,
      chunks: doc.chunk_count,
      status: "ready"
    }))
  );
  assert.equal(kept.length, 2);
  assert.equal(
    kept.filter((item) => item.name === "日语学习笔记_v1.0_20260728.md").length,
    1
  );
});
