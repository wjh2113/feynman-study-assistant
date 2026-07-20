import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import pg from "pg";
import { embeddingDimensions } from "./embedding.mjs";
import { keywordTokens } from "./chunking.mjs";

const { Pool } = pg;
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, ".data"));
export const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, "uploads"));
const embeddedDbDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(dataDir, "postgres"));

let databasePromise;

function safeJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function adapterFor(client, mode) {
  return {
    mode,
    query: (text, params = []) => client.query(text, params),
    close: () => client.end?.() || client.close?.()
  };
}

async function createDatabase() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadDir, { recursive: true });

  let db;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
    });
    db = adapterFor(pool, "postgresql");
  } else {
    await mkdir(path.dirname(embeddedDbDir), { recursive: true });
    const embedded = process.env.PGLITE_MEMORY === "true"
      ? await PGlite.create({ extensions: { vector } })
      : await PGlite.create(
          `file://${path.relative(process.cwd(), embeddedDbDir).replace(/\\/g, "/")}`,
          { extensions: { vector } }
        );
    db = adapterFor(embedded, "pglite");
  }

  await db.query("CREATE EXTENSION IF NOT EXISTS vector");
  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'course',
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      file_type TEXT NOT NULL,
      byte_size BIGINT NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      parse_report JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb");
  await db.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS parse_report JSONB NOT NULL DEFAULT '{}'::jsonb");
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL DEFAULT 1,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      search_tokens TEXT NOT NULL DEFAULT '',
      embedding vector(${embeddingDimensions}),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(document_id, chunk_index)
    )
  `);
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page_end INTEGER NOT NULL DEFAULT 1");
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS parent_id TEXT");
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS parent_content TEXT NOT NULL DEFAULT ''");
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS heading_path TEXT NOT NULL DEFAULT ''");
  await db.query(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS coach_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      concept_id TEXT,
      concept TEXT,
      question_id TEXT,
      question TEXT,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      evaluations JSONB NOT NULL DEFAULT '[]'::jsonb,
      score INTEGER,
      status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS rag_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      answer TEXT,
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      debug JSONB,
      insufficient BOOLEAN NOT NULL DEFAULT false,
      demo BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_project ON document_chunks(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_events_project ON learning_events(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_project ON coach_sessions(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rag_history_project ON rag_history(project_id)");
  return db;
}

export function getDatabase() {
  if (!databasePromise) databasePromise = createDatabase();
  return databasePromise;
}

export async function listProjects() {
  const db = await getDatabase();
  const result = await db.query("SELECT state FROM projects ORDER BY updated_at DESC");
  return result.rows.map((row) => safeJson(row.state));
}

export async function getProject(projectId) {
  const db = await getDatabase();
  const result = await db.query("SELECT state FROM projects WHERE id = $1", [projectId]);
  return result.rows[0] ? safeJson(result.rows[0].state) : null;
}

export async function saveProject(project) {
  if (!project?.id) throw new Error("项目缺少 id");
  const db = await getDatabase();
  await db.query(
    `INSERT INTO projects(id, title, mode, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, TO_TIMESTAMP($5 / 1000.0), NOW())
     ON CONFLICT(id) DO UPDATE SET
       title = EXCLUDED.title,
       mode = EXCLUDED.mode,
       state = EXCLUDED.state,
       updated_at = NOW()`,
    [
      project.id,
      project.title || "新的学习项目",
      project.mode || "course",
      JSON.stringify(project),
      Number(project.createdAt || Date.now())
    ]
  );
  return project;
}

export async function deleteProject(projectId) {
  const db = await getDatabase();
  await db.query("DELETE FROM projects WHERE id = $1", [projectId]);
}

function sanitizeFilename(filename) {
  const cleaned = String(filename || "document")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 160) || "document";
}

export async function persistOriginalFile(projectId, file) {
  const projectFolder = path.join(uploadDir, sanitizeFilename(projectId));
  await mkdir(projectFolder, { recursive: true });
  const extension = path.extname(sanitizeFilename(file.originalname)).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const storedName = `${randomUUID()}${extension}`;
  const storagePath = path.join(projectFolder, storedName);
  await writeFile(storagePath, file.buffer);
  return { storedName, storagePath };
}

function vectorLiteral(vectorValue) {
  return `[${vectorValue.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function saveDocument({ projectId, source, file, chunks, embeddings }) {
  const db = await getDatabase();
  const documentId = source.documentKey || randomUUID();
  const stored = await persistOriginalFile(projectId, file);

  await db.query(
    `INSERT INTO documents(
       id, project_id, filename, stored_name, storage_path, mime_type,
       file_type, byte_size, page_count, chunk_count, summary, parse_report
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    [
      documentId,
      projectId,
      source.filename,
      stored.storedName,
      stored.storagePath,
      file.mimetype || "application/octet-stream",
      source.type,
      file.size || file.buffer.length,
      source.pages.length,
      chunks.length,
      JSON.stringify(source.summary || {}),
      JSON.stringify(source.parseReport || {})
    ]
  );

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await db.query(
      `INSERT INTO document_chunks(
         id, document_id, project_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13::jsonb)`,
      [
        randomUUID(),
        documentId,
        projectId,
        chunk.page,
        chunk.pageEnd || chunk.page,
        chunk.chunkIndex,
        chunk.parentId,
        chunk.parentContent,
        chunk.headingPath,
        chunk.content,
        chunk.searchTokens,
        vectorLiteral(embeddings[index]),
        JSON.stringify({ filename: source.filename, type: source.type, chunking: "semantic-parent-child-v1" })
      ]
    );
  }

  return {
    id: documentId,
    name: source.filename,
    type: source.type,
    pages: source.pages.length,
    chunks: chunks.length,
    size: Number(file.size || file.buffer.length),
    status: "ready",
    downloadUrl: `/api/documents/${documentId}/file`,
    summary: source.summary || {},
    parseReport: source.parseReport || {},
    parsedPreview: source.parsedPreview || ""
  };
}

export async function updateDocumentInsights(documentId, summary, parseReport) {
  const db = await getDatabase();
  await db.query(
    `UPDATE documents
        SET summary = $2::jsonb,
            parse_report = $3::jsonb
      WHERE id = $1`,
    [documentId, JSON.stringify(summary || {}), JSON.stringify(parseReport || {})]
  );
}

export async function getDocument(documentId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM documents WHERE id = $1", [documentId]);
  return result.rows[0] || null;
}

export async function listDocumentsForProject(projectId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM documents WHERE project_id = $1 ORDER BY created_at ASC",
    [projectId]
  );
  return result.rows;
}

export async function replaceDocumentIndex({ projectId, document, source, chunks, embeddings }) {
  const db = await getDatabase();
  await db.query("DELETE FROM document_chunks WHERE document_id = $1 AND project_id = $2", [document.id, projectId]);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await db.query(
      `INSERT INTO document_chunks(
         id, document_id, project_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13::jsonb)`,
      [
        randomUUID(), document.id, projectId, chunk.page, chunk.pageEnd || chunk.page,
        chunk.chunkIndex, chunk.parentId, chunk.parentContent, chunk.headingPath,
        chunk.content, chunk.searchTokens, vectorLiteral(embeddings[index]),
        JSON.stringify({ filename: document.filename, type: source.type, chunking: "semantic-parent-child-v1" })
      ]
    );
  }
  await db.query(
    `UPDATE documents SET page_count = $2, chunk_count = $3, parse_report = $4::jsonb WHERE id = $1 AND project_id = $5`,
    [document.id, source.pages.length, chunks.length, JSON.stringify(source.parseReport || {}), projectId]
  );
  return { documentId: document.id, chunks: chunks.length };
}

export async function deleteDocument(projectId, documentId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT storage_path FROM documents WHERE id = $1 AND project_id = $2",
    [documentId, projectId]
  );
  const document = result.rows[0];
  if (!document) return false;

  const resolvedUploadDir = path.resolve(uploadDir);
  const resolvedStoragePath = path.resolve(document.storage_path);
  const relativeStoragePath = path.relative(resolvedUploadDir, resolvedStoragePath);
  if (relativeStoragePath.startsWith("..") || path.isAbsolute(relativeStoragePath)) {
    throw new Error("资料文件路径不在允许的存储目录内");
  }

  try {
    await unlink(resolvedStoragePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await db.query(
    "DELETE FROM documents WHERE id = $1 AND project_id = $2",
    [documentId, projectId]
  );
  return true;
}

export async function recordEvent(projectId, eventType, payload) {
  const db = await getDatabase();
  await db.query(
    "INSERT INTO learning_events(id, project_id, event_type, payload) VALUES ($1,$2,$3,$4::jsonb)",
    [randomUUID(), projectId, eventType, JSON.stringify(payload || {})]
  );
}

export async function saveCoachSession(session) {
  const db = await getDatabase();
  if (!session?.id || !session.projectId) throw new Error("会话缺少 id 或 projectId");
  await db.query(
    `INSERT INTO coach_sessions(
       id, project_id, concept_id, concept, question_id, question,
       messages, evaluations, score, status, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,TO_TIMESTAMP($11 / 1000.0),NOW())
     ON CONFLICT(id) DO UPDATE SET
       concept_id = EXCLUDED.concept_id,
       concept = EXCLUDED.concept,
       question_id = EXCLUDED.question_id,
       question = EXCLUDED.question,
       messages = EXCLUDED.messages,
       evaluations = EXCLUDED.evaluations,
       score = EXCLUDED.score,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [
      session.id,
      session.projectId,
      session.conceptId || null,
      session.concept || null,
      session.questionId || null,
      session.question || null,
      JSON.stringify(session.messages || []),
      JSON.stringify(session.evaluations || []),
      session.score ?? null,
      session.status || null,
      Number(session.createdAt || Date.now())
    ]
  );
  return session;
}

export async function getCoachSession(sessionId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM coach_sessions WHERE id = $1", [sessionId]);
  if (!result.rows[0]) return null;
  return rowToCoachSession(result.rows[0]);
}

export async function listCoachSessions(projectId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM coach_sessions WHERE project_id = $1 ORDER BY updated_at DESC",
    [projectId]
  );
  return result.rows.map(rowToCoachSession);
}

function rowToCoachSession(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    conceptId: row.concept_id,
    concept: row.concept,
    questionId: row.question_id,
    question: row.question,
    messages: safeJson(row.messages, []),
    evaluations: safeJson(row.evaluations, []),
    score: row.score,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

export async function saveRagHistory(record) {
  const db = await getDatabase();
  if (!record?.id || !record.projectId) throw new Error("RAG 记录缺少 id 或 projectId");
  await db.query(
    `INSERT INTO rag_history(
       id, project_id, query, answer, sources, debug, insufficient, demo, created_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,TO_TIMESTAMP($9 / 1000.0))`,
    [
      record.id,
      record.projectId,
      record.query,
      record.answer || null,
      JSON.stringify(record.sources || []),
      JSON.stringify(record.debug || null),
      Boolean(record.insufficient),
      Boolean(record.demo),
      Number(record.createdAt || Date.now())
    ]
  );
  return record;
}

export async function listRagHistory(projectId, limit = 50) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM rag_history WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
    [projectId, Math.max(1, Number(limit) || 50)]
  );
  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    query: row.query,
    answer: row.answer,
    sources: safeJson(row.sources, []),
    debug: safeJson(row.debug, null),
    insufficient: row.insufficient,
    demo: row.demo,
    createdAt: new Date(row.created_at).getTime()
  }));
}

export async function getAppSetting(key) {
  const db = await getDatabase();
  const result = await db.query("SELECT value FROM app_settings WHERE key = $1", [key]);
  return result.rows[0] ? safeJson(result.rows[0].value) : null;
}

export async function saveAppSetting(key, value) {
  const db = await getDatabase();
  await db.query(
    `INSERT INTO app_settings(key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value || {})]
  );
  return value;
}

export async function hybridSearch(projectId, query, queryEmbedding, limit = 6) {
  const db = await getDatabase();
  // RAG answers intentionally request 20 fused candidates before reranking.
  // Keep a safety cap for callers, but do not silently truncate that pool to 12.
  const take = Math.max(1, Math.min(Number(limit) || 6, 50));
  const candidates = new Map();
  const vectorResult = await db.query(
    `SELECT id, document_id, page_number, page_end, content, search_tokens,
            parent_id, parent_content, heading_path, metadata,
            1 - (embedding <=> $2::vector) AS vector_score
       FROM document_chunks
      WHERE project_id = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [projectId, vectorLiteral(queryEmbedding), take * 3]
  );

  for (const [rank, row] of vectorResult.rows.entries()) {
    candidates.set(row.id, {
      ...row,
      metadata: safeJson(row.metadata),
      vectorScore: Number(row.vector_score || 0),
      keywordScore: 0,
      rrf: 1 / (60 + rank + 1)
    });
  }

  const tokens = keywordTokens(query).slice(0, 24);
  if (tokens.length) {
    const tsQuery = tokens.map((token) => token.replace(/[':&|!()]/g, "")).filter(Boolean).join(" | ");
    const keywordResult = await db.query(
      `SELECT id, document_id, page_number, page_end, content, search_tokens,
              parent_id, parent_content, heading_path, metadata,
              ts_rank_cd(to_tsvector('simple', search_tokens), to_tsquery('simple', $2)) AS keyword_score
         FROM document_chunks
        WHERE project_id = $1
          AND to_tsvector('simple', search_tokens) @@ to_tsquery('simple', $2)
        ORDER BY keyword_score DESC
        LIMIT $3`,
      [projectId, tsQuery, take * 3]
    );
    for (const [rank, row] of keywordResult.rows.entries()) {
      const existing = candidates.get(row.id) || {
        ...row,
        metadata: safeJson(row.metadata),
        vectorScore: 0,
        keywordScore: 0,
        rrf: 0
      };
      existing.keywordScore = Number(row.keyword_score || 0);
      existing.rrf += 1 / (60 + rank + 1);
      candidates.set(row.id, existing);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.rrf - a.rrf || b.vectorScore - a.vectorScore)
    .slice(0, take)
    .map((item) => ({
      id: item.id,
      documentId: item.document_id,
      filename: item.metadata?.filename || "学习资料",
      page: Number(item.page_number || 1),
      pageEnd: Number(item.page_end || item.page_number || 1),
      headingPath: item.heading_path || "",
      parentId: item.parent_id || "",
      parentContent: item.parent_content || "",
      content: item.content,
      vectorScore: Number(item.vectorScore || 0),
      keywordScore: Number(item.keywordScore || 0),
      fusionScore: Number(item.rrf.toFixed(6)),
      matchedKeywords: tokens.filter((token) => String(item.search_tokens || "").split(" ").includes(token)).slice(0, 12)
    }));
}

export async function databaseStatus() {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT COUNT(*)::int AS projects, (SELECT COUNT(*)::int FROM documents) AS documents, (SELECT COUNT(*)::int FROM document_chunks) AS chunks FROM projects"
  );
  return { mode: db.mode, ...(result.rows[0] || { projects: 0, documents: 0, chunks: 0 }) };
}
