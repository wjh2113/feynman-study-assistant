import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMapAvailability } from "../src/lib/map-availability.js";
import { questionsForProject } from "../src/lib/questions.js";

test("resolveMapAvailability distinguishes indexed sources without modules", () => {
  const state = resolveMapAvailability({
    analysis: {
      sources: [{ id: "d1", name: "notes.md", chunks: 12, status: "ready" }],
      modules: [],
      contentAnalysisStatus: "ready",
      needsResummarize: false
    }
  });
  assert.equal(state.kind, "sources-without-map");
  assert.match(state.title, /待生成/);
});

test("resolveMapAvailability shows generating state while map rebuild runs", () => {
  const state = resolveMapAvailability({
    analysis: {
      sources: [{ id: "d1", name: "notes.md", chunks: 12, status: "ready" }],
      modules: [],
      contentAnalysisStatus: "running"
    }
  });
  assert.equal(state.kind, "generating");
});

test("questionsForProject falls back to concept questions for selected documents", () => {
  const project = {
    analysis: {
      sources: [
        { id: "doc-a", name: "日语学习笔记_v1.0_20260728.md" },
        { id: "doc-b", name: "other.jpg" }
      ],
      questions: [
        {
          id: "q-other",
          question: "只关联另一份资料的问题",
          conceptId: "c2",
          concept: "其他",
          sourceRefs: [{ file: "other.jpg", page: 1 }]
        }
      ],
      modules: [
        {
          id: "m1",
          concepts: [
            {
              id: "c1",
              title: "五十音",
              sourceRefs: [{ file: "日语学习笔记_v1.0_20260728.md", page: 1 }]
            }
          ]
        }
      ]
    }
  };

  const questions = questionsForProject(project, { documentIds: ["doc-a"] });
  assert.ok(questions.length > 0);
  assert.ok(questions.every((item) => item.conceptId === "c1" || item.sourceRefs?.some((ref) => ref.file.includes("日语"))));
});
