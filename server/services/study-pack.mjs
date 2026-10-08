import JSZip from "jszip";
import { sanitizeForJsonb } from "../../src/lib/jsonb-safe.mjs";
import {
  MAX_INNER_FILE_BYTES,
  MAX_PACK_FILES,
  STUDY_PACK_SCHEMA,
  basenamePath,
  buildManifestFromProject,
  buildPackFromProject,
  normalizeManifest,
  normalizePackAnalysis,
  normalizePreparsedDocument,
  preparsedTextPath,
  validateStudyPack
} from "../../src/lib/study-pack.mjs";

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export function guessMimeFromName(name = "") {
  const lower = String(name || "").toLowerCase();
  const ext = lower.includes(".") ? `.${lower.split(".").pop()}` : "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function zipFileMap(zip) {
  const map = new Map();
  for (const [fullPath, entry] of Object.entries(zip.files || {})) {
    if (!entry || entry.dir) continue;
    const normalized = String(fullPath).replace(/\\/g, "/").replace(/^\/+/, "");
    map.set(normalized, entry);
    map.set(basenamePath(normalized), entry);
  }
  return map;
}

function readJsonEntry(map, names) {
  for (const name of names) {
    const entry = map.get(name) || [...map.entries()].find(([key]) => key.endsWith(`/${name}`) || key === name)?.[1];
    if (entry) return entry;
  }
  return null;
}

export async function parseStudyPackZip(buffer) {
  if (!buffer?.length) throw new Error("学科包是空的");
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("无法解压 ZIP，请确认文件未损坏");
  }
  const map = zipFileMap(zip);
  const manifestEntry = readJsonEntry(map, ["manifest.json"]);
  const packEntry = readJsonEntry(map, ["pack.json"]);
  const legacyProject = readJsonEntry(map, ["project.json"]);

  if (!manifestEntry && legacyProject) {
    throw new Error("这是旧版导出档案，不含原文，无法作为完整学科包导入。请用「导出学科包」重新导出后再导入。");
  }
  if (!manifestEntry || !packEntry) {
    throw new Error("学科包缺少 manifest.json 或 pack.json");
  }

  let manifestRaw;
  let packRaw;
  try {
    manifestRaw = JSON.parse(await manifestEntry.async("string"));
    packRaw = JSON.parse(await packEntry.async("string"));
  } catch {
    throw new Error("manifest.json 或 pack.json 不是合法 JSON");
  }

  const manifest = normalizeManifest(manifestRaw);
  const pack = sanitizeForJsonb(normalizePackAnalysis(packRaw));
  const files = [];
  const preparsedByName = {};

  for (const listed of manifest.files) {
    const entry = map.get(listed.path) || map.get(listed.name) || map.get(`files/${listed.name}`);
    if (!entry) continue;
    const fileBuffer = await entry.async("nodebuffer");
    if (fileBuffer.length > MAX_INNER_FILE_BYTES) {
      throw new Error(`单个文件不能超过 100 MB：${listed.name}`);
    }
    files.push({
      originalname: listed.name,
      mimetype: guessMimeFromName(listed.name),
      size: fileBuffer.length,
      buffer: fileBuffer
    });

    const textPath = preparsedTextPath(listed.name);
    const textEntry = map.get(textPath) || map.get(basenamePath(textPath));
    if (!textEntry) continue;
    try {
      const preparsed = normalizePreparsedDocument(
        JSON.parse(await textEntry.async("string")),
        listed.name
      );
      if (preparsed) preparsedByName[listed.name] = preparsed;
    } catch {
      throw new Error(`预解析正文不是合法 JSON：${textPath}`);
    }
  }

  if (!files.length) {
    throw new Error("完整包必须包含原文");
  }
  if (files.length > MAX_PACK_FILES) {
    throw new Error(`一次最多导入 ${MAX_PACK_FILES} 份原文`);
  }

  const errors = validateStudyPack({
    manifest,
    pack,
    fileNames: files.map((file) => file.originalname),
    preparsedNames: Object.keys(preparsedByName),
    // Prefer external preparse; still accept older packs without text/ and fall back to OCR.
    requirePreparsed: false
  });
  if (errors.length) throw new Error(errors[0]);

  return { manifest, pack, files, preparsedByName };
}

export async function buildStudyPackZip(project, originalFiles = [], { allowEmptyFiles = false, preparsedByName = {} } = {}) {
  const files = originalFiles
    .map((item) => ({
      name: String(item.name || "").trim(),
      buffer: item.buffer
    }))
    .filter((item) => item.name && item.buffer?.length);
  if (!files.length && !allowEmptyFiles) {
    throw new Error("当前学科没有可导出的原文，无法生成完整学科包");
  }
  const manifest = buildManifestFromProject(project, files.map((item) => ({ name: item.name, path: `files/${item.name}` })));
  const pack = buildPackFromProject(project);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("pack.json", JSON.stringify(pack, null, 2));
  for (const file of files) {
    zip.file(`files/${file.name}`, file.buffer);
    const preparsed = preparsedByName[file.name] || normalizePreparsedDocument(
      {
        name: file.name,
        pages: [{ page: 1, text: String(
          (project.analysis?.sources || []).find((source) => (source.name || source.filename) === file.name)?.parsedPreview || ""
        ) }]
      },
      file.name
    );
    if (preparsed) {
      zip.file(preparsedTextPath(file.name), JSON.stringify({
        name: preparsed.name,
        pages: preparsed.pages.map((page) => ({ page: page.page, text: page.text }))
      }, null, 2));
    }
  }
  zip.file("README.md", `# ${manifest.title || project.title || "学科包"}\n\nschema: ${STUDY_PACK_SCHEMA}\n`);
  return zip.generateAsync({ type: "nodebuffer" });
}
