import assert from "node:assert/strict";
import test from "node:test";
import { extractChatContent, pickModelAnswer } from "../server/services/llm.mjs";

test("extractChatContent reads string, array, and reasoning-only payloads", () => {
  assert.equal(
    extractChatContent({ choices: [{ message: { content: '{"answer":"ok"}' } }] }),
    '{"answer":"ok"}'
  );
  assert.equal(
    extractChatContent({
      choices: [{ message: { content: [{ type: "text", text: '{"answer":"分段"}' }] } }]
    }),
    '{"answer":"分段"}'
  );
  assert.equal(
    extractChatContent({
      choices: [{ message: { content: "", reasoning_content: '{"answer":"思考后"}' } }]
    }),
    '{"answer":"思考后"}'
  );
  assert.equal(extractChatContent({ choices: [{ message: { content: "" } }] }), "");
});

test("pickModelAnswer accepts answer/text aliases", () => {
  assert.equal(pickModelAnswer({ answer: "结论先行[1]" }), "结论先行[1]");
  assert.equal(pickModelAnswer({ text: "备用字段" }), "备用字段");
  assert.equal(pickModelAnswer({}), "");
});
