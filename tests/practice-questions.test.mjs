import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_QUESTION_MIN,
  PRACTICE_QUESTION_MAX,
  resolvePracticeQuestionCount
} from "../server/services/practice-questions.mjs";

test("practice-questions re-exports draw count helpers for 5–15 sampling", () => {
  assert.equal(PRACTICE_QUESTION_MIN, 5);
  assert.equal(PRACTICE_QUESTION_MAX, 15);
  const count = resolvePracticeQuestionCount([
    { name: "短.md", parsedPreview: "很少", summary: { summary: "短" } }
  ]);
  assert.equal(count, 5);
});
