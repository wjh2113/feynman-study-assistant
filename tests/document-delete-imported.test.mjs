import assert from "node:assert/strict";
import test from "node:test";
import { STUDY_PACK_SCHEMA } from "../src/lib/study-pack.mjs";

test("imported study packs skip auto LLM rebuild on delete path helpers", async () => {
  const { isImportedStudyPack } = await import("../src/lib/study-pack.mjs");
  const project = {
    analysis: {
      importedPack: { schema: STUDY_PACK_SCHEMA, importedAt: Date.now() },
      modules: [{ id: "m1", title: "保留", concepts: [] }],
      questions: [{ id: "q1", question: "保留题" }],
      sources: [{ id: "d1", name: "a.docx" }, { id: "d2", name: "b.docx" }]
    }
  };
  assert.equal(isImportedStudyPack(project), true);

  // Mirror route decision: cleanup vectors yes, resummarize no.
  const remainingSources = project.analysis.sources.filter((item) => item.id !== "d1");
  const preserveImportedMap = isImportedStudyPack(project);
  const willQueueCleanup = true;
  const willQueueRebuild = willQueueCleanup && !preserveImportedMap;
  assert.equal(willQueueRebuild, false);
  assert.equal(remainingSources.length, 1);
  assert.equal(project.analysis.modules.length, 1);
});
