import assert from "node:assert/strict";
import { test } from "node:test";
import { expandQuestionsToCount, TARGET_COACH_QUESTION_COUNT } from "../src/lib/coach-questions.mjs";
import { questionsForProject } from "../src/lib/questions.js";

test("expandQuestionsToCount fills up to ten coach questions", () => {
  const concepts = [
    { id: "c1", title: "五十音", sourceRefs: [{ file: "notes.md", page: 1 }] },
    { id: "c2", title: "音读训读", sourceRefs: [{ file: "notes.md", page: 2 }] }
  ];
  const expanded = expandQuestionsToCount(
    [{ id: "q1", question: "已有题", conceptId: "c1", concept: "五十音" }],
    concepts
  );
  assert.equal(expanded.length, TARGET_COACH_QUESTION_COUNT);
});

test("questionsForProject returns ten selectable questions", () => {
  const project = {
    analysis: {
      sources: [{ id: "doc-a", name: "notes.md" }],
      questions: [
        { id: "q1", question: "题1", conceptId: "c1", concept: "五十音", sourceRefs: [{ file: "notes.md", page: 1 }] }
      ],
      modules: [
        {
          id: "m1",
          concepts: [
            { id: "c1", title: "五十音", sourceRefs: [{ file: "notes.md", page: 1 }] },
            { id: "c2", title: "音读训读", sourceRefs: [{ file: "notes.md", page: 2 }] }
          ]
        }
      ]
    }
  };
  const questions = questionsForProject(project, { documentIds: ["doc-a"] });
  assert.equal(questions.length, 10);
});
