import test from "node:test";
import assert from "node:assert/strict";
import { normalizePreferences } from "../server/user-preferences.mjs";

test("normalizePreferences accepts practiceQuestionCapability quality/fast", () => {
  assert.equal(normalizePreferences({}).practiceQuestionCapability, "fast-chat");
  assert.equal(
    normalizePreferences({ practiceQuestionCapability: "quality-chat" }).practiceQuestionCapability,
    "quality-chat"
  );
  assert.equal(
    normalizePreferences({ practiceQuestionCapability: "nope" }).practiceQuestionCapability,
    "fast-chat"
  );
});
