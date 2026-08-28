import test from "node:test";
import assert from "node:assert/strict";
import { decodeUploadName } from "../server/document-parser.mjs";

test("decodeUploadName restores UTF-8 Chinese filenames from multer latin1", () => {
  const utf8 = "01 思考及表达的逻辑 v1.0.docx";
  const mojibake = Buffer.from(utf8, "utf8").toString("latin1");
  assert.notEqual(mojibake, utf8);
  assert.equal(decodeUploadName(mojibake), utf8);
});

test("decodeUploadName keeps already-correct UTF-8 and ASCII names", () => {
  assert.equal(decodeUploadName("notes.txt"), "notes.txt");
  assert.equal(decodeUploadName("课堂笔记.docx"), "课堂笔记.docx");
});
