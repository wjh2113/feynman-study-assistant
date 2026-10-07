import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import JSZip from "jszip";
import {
  STUDY_PACK_SCHEMA,
  normalizeManifest,
  normalizePackAnalysis,
  normalizePreparsedDocument,
  preparsedTextPath,
  shouldApplyImportedTitle,
  validateStudyPack
} from "../src/lib/study-pack.mjs";
import { buildStudyPackZip, parseStudyPackZip } from "../server/services/study-pack.mjs";

const exampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../examples/study-pack");

test("validates a complete study pack and rejects JSON-only archives", async () => {
  const name = "【知识点总结】日语-第0课.md";
  const manifest = JSON.parse(await readFile(path.join(exampleDir, "manifest.json"), "utf8"));
  const pack = JSON.parse(await readFile(path.join(exampleDir, "pack.json"), "utf8"));
  const errors = validateStudyPack({
    manifest: normalizeManifest(manifest),
    pack: normalizePackAnalysis(pack),
    fileNames: [name],
    preparsedNames: [name],
    requirePreparsed: true
  });
  assert.deepEqual(errors, []);

  const missingFiles = validateStudyPack({
    manifest: normalizeManifest(manifest),
    pack: normalizePackAnalysis(pack),
    fileNames: []
  });
  assert.ok(missingFiles.some((item) => item.includes("缺少原文") || item.includes("必须包含原文")));

  const missingText = validateStudyPack({
    manifest: normalizeManifest(manifest),
    pack: normalizePackAnalysis(pack),
    fileNames: [name],
    preparsedNames: [],
    requirePreparsed: true
  });
  assert.ok(missingText.some((item) => item.includes("预解析正文")));

  assert.equal(preparsedTextPath(name), `text/${name}.json`);
  assert.equal(shouldApplyImportedTitle("新的学习项目"), true);
  assert.equal(shouldApplyImportedTitle("日语"), false);
});

test("round-trips a ZIP pack with preparsed text and rejects legacy project.json exports", async () => {
  const name = "【知识点总结】日语-第0课.md";
  const buffer = await readFile(path.join(exampleDir, "files", name));
  const pack = JSON.parse(await readFile(path.join(exampleDir, "pack.json"), "utf8"));
  const preparsed = normalizePreparsedDocument(
    JSON.parse(await readFile(path.join(exampleDir, "text", `${name}.json`), "utf8")),
    name
  );
  const zipBuffer = await buildStudyPackZip(
    { title: "日语入门样例", analysis: pack },
    [{ name, buffer }],
    { preparsedByName: { [name]: preparsed } }
  );
  const parsed = await parseStudyPackZip(zipBuffer);
  assert.equal(parsed.manifest.schema, STUDY_PACK_SCHEMA);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].originalname, name);
  assert.equal(parsed.pack.modules.length, 1);
  assert.ok(parsed.pack.sources[0].questionBank.length >= 1);
  assert.ok(parsed.preparsedByName[name]?.pages?.length >= 1);
  assert.match(parsed.preparsedByName[name].pages[0].text, /选择疑问句/);

  const legacy = new JSZip();
  legacy.file("README.md", "# old");
  legacy.file("project.json", JSON.stringify({ title: "旧档案" }));
  const legacyBuffer = await legacy.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => parseStudyPackZip(legacyBuffer), /旧版导出档案/);
});
