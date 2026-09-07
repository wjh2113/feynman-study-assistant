import test from "node:test";
import assert from "node:assert/strict";
import { normalizePreferences } from "../server/user-preferences.mjs";

test("normalizePreferences accepts practiceQuestionCapability quality/fast", () => {
  assert.equal(normalizePreferences({}).practiceQuestionCapability, "quality-chat");
  assert.equal(
    normalizePreferences({ practiceQuestionCapability: "fast-chat" }).practiceQuestionCapability,
    "fast-chat"
  );
  assert.equal(
    normalizePreferences({ practiceQuestionCapability: "nope" }).practiceQuestionCapability,
    "quality-chat"
  );
});
