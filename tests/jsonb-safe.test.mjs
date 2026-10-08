import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeForJsonb, sanitizeJsonbString, stringifyJsonb } from "../src/lib/jsonb-safe.mjs";
import { normalizePreparsedDocument } from "../src/lib/study-pack.mjs";

test("sanitizeJsonbString strips NUL and lone surrogates", () => {
  assert.equal(sanitizeJsonbString("a\u0000b"), "ab");
  assert.equal(sanitizeJsonbString("ok"), "ok");
  assert.equal(sanitizeJsonbString(`hi${String.fromCharCode(0xD800)}there`), "hithere");
});

test("stringifyJsonb removes NULs so Postgres jsonb can accept the payload", () => {
  const payload = {
    pages: [{ text: `hello\u0000world` }],
    nested: { a: "x\u0000y" }
  };
  const raw = stringifyJsonb(payload);
  assert.equal(raw.includes("\\u0000"), false);
  assert.deepEqual(JSON.parse(raw), {
    pages: [{ text: "helloworld" }],
    nested: { a: "xy" }
  });
});

test("normalizePreparsedDocument strips NULs from page text", () => {
  const preparsed = normalizePreparsedDocument({
    name: "Evernote.html",
    pages: [{ page: 1, text: `减脂\u0000笔记` }]
  });
  assert.equal(preparsed.pages[0].text, "减脂笔记");
  assert.equal(JSON.stringify(preparsed).includes("\\u0000"), false);
  assert.equal(sanitizeForJsonb(preparsed).pages[0].text, "减脂笔记");
});
