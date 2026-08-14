/**
 * Backfill outline + accurate image counts for already-parsed docs (no re-OCR).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { buildDocumentOutline } from "../server/document-outline.mjs";
import { getDatabase } from "../server/db/client.mjs";

const db = await getDatabase();
const docs = await db.query(
  "SELECT id, project_id, user_id, filename, storage_path, parse_report, page_count, chunk_count FROM documents WHERE filename LIKE $1",
  ["%日语学习笔记%"]
);
if (!docs.rows.length) {
  console.log("no matching documents");
  process.exit(0);
}

for (const doc of docs.rows) {
  const buf = await readFile(doc.storage_path);
  const zip = await JSZip.loadAsync(buf);
  const mediaCount = Object.values(zip.files).filter((e) => !e.dir && /^word\/media\//i.test(e.name)).length;
  const prev = typeof doc.parse_report === "string" ? JSON.parse(doc.parse_report) : (doc.parse_report || {});
  const imagesOcrd = Number(prev.imagesOcrd || 0);
  const imagesSkipped = Math.max(0, mediaCount - imagesOcrd);
  const parseReport = {
    ...prev,
    format: "DOCX",
    imagesFound: mediaCount,
    imagesOcrd,
    imagesSkipped,
    ocrStatus: imagesSkipped > 0 ? "partial" : prev.ocrStatus || "ready",
    warnings: [
      ...(prev.warnings || []).filter((w) => !/OCR|图片/.test(w)),
      `文档含 ${mediaCount} 张图片，当时仅 OCR ${imagesOcrd} 张，未处理 ${imagesSkipped} 张。可设置 OCR_MAX_IMAGES 后重新解析以补全。`
    ]
  };

  const chunks = await db.query(
    "SELECT content FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index",
    [doc.id]
  );
  const fullText = chunks.rows.map((row) => row.content).join("\n");
  const outline = buildDocumentOutline(
    {
      filename: doc.filename,
      pages: [{ page: 1, text: fullText }],
      parseReport,
      chunks: chunks.rows.length
    },
    {
      chunkCount: chunks.rows.length,
      indexedCharacters: fullText.length
    }
  );

  await db.query("UPDATE documents SET parse_report = $2::jsonb WHERE id = $1", [
    doc.id,
    JSON.stringify(parseReport)
  ]);

  const project = await db.query("SELECT id, state FROM projects WHERE id = $1", [doc.project_id]);
  if (project.rows[0]) {
    const state = typeof project.rows[0].state === "string"
      ? JSON.parse(project.rows[0].state)
      : (project.rows[0].state || {});
    const analysis = state.analysis || {};
    const sources = (analysis.sources || []).map((source) => {
      if (source.id !== doc.id && source.name !== doc.filename) return source;
      return {
        ...source,
        parseReport,
        outline,
        parsedPreview: `第 1 页：${fullText}`.slice(0, 12000)
      };
    });
    const next = { ...state, analysis: { ...analysis, sources } };
    await db.query("UPDATE projects SET state = $2::jsonb, updated_at = NOW() WHERE id = $1", [
      doc.project_id,
      JSON.stringify(next)
    ]);
  }

  console.log({
    filename: doc.filename,
    imagesFound: mediaCount,
    imagesOcrd,
    imagesSkipped,
    sections: outline.sections.length,
    completeness: outline.completeness
  });
}

process.exit(0);
