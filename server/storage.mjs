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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
    )
  `);
  await db.query("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'");
  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'course',
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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
  await db.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
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
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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
  await db.query("ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query(`
    CREATE TABLE IF NOT EXISTS rag_history (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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
  await db.query("ALTER TABLE rag_history ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_project ON document_chunks(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_user ON document_chunks(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_events_project ON learning_events(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_events_user ON learning_events(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_project ON coach_sessions(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_user ON coach_sessions(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rag_history_project ON rag_history(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rag_history_user ON rag_history(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)");

  await migrateLegacyDataIfNeeded(db);
  return db;
}

async function migrateLegacyDataIfNeeded(db) {
  const legacyProjects = await db.query("SELECT id FROM projects WHERE user_id IS NULL LIMIT 1");
  if (!legacyProjects.rows.length) return;
  const existingUser = await db.query("SELECT id FROM users LIMIT 1");
  let userId;
  if (existingUser.rows.length) {
    userId = existingUser.rows[0].id;
  } else {
    userId = randomUUID();
    await db.query(
      "INSERT INTO users(id, username, password_hash, salt) VALUES ($1, $2, $3, $4)",
      [userId, "默认用户", "", ""]
    );
  }
  await db.query("UPDATE projects SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await db.query("UPDATE documents SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await db.query("UPDATE document_chunks SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await db.query("UPDATE learning_events SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await db.query("UPDATE coach_sessions SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await db.query("UPDATE rag_history SET user_id = $1 WHERE user_id IS NULL", [userId]);
}

export async function createUser({ id, username, passwordHash, salt }) {
  const db = await getDatabase();
  await db.query(
    "INSERT INTO users(id, username, password_hash, salt) VALUES ($1, $2, $3, $4)",
    [id, username, passwordHash, salt]
  );
  return { id, username };
}

export async function getUserByUsername(username) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  return result.rows[0] || null;
}

export async function getUserById(userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT id, username, created_at FROM users WHERE id = $1", [userId]);
  return result.rows[0] || null;
}

export async function listUsers() {
  const db = await getDatabase();
  const result = await db.query("SELECT id, username, created_at FROM users ORDER BY created_at DESC");
  return result.rows;
}

export async function deleteUser(userId) {
  const db = await getDatabase();
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
}

export async function createUserSession(token, userId, maxAgeDays = 30) {
  const db = await getDatabase();
  await db.query(
    "INSERT INTO user_sessions(token, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))",
    [token, userId, maxAgeDays]
  );
  return token;
}

export async function getUserIdBySession(token) {
  const db = await getDatabase();
  const result = await db.query("SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()", [token]);
  if (!result.rows.length) await db.query("DELETE FROM user_sessions WHERE token = $1", [token]);
  return result.rows[0]?.user_id || null;
}

export async function deleteExpiredUserSessions() {
  const db = await getDatabase();
  const result = await db.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
  return result.rowCount || 0;
}

export async function deleteUserSession(token) {
  const db = await getDatabase();
  await db.query("DELETE FROM user_sessions WHERE token = $1", [token]);
}

export function getDatabase() {
  if (!databasePromise) databasePromise = createDatabase();
  return databasePromise;
}

export async function listProjects(userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT state FROM projects WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
  return result.rows.map((row) => safeJson(row.state));
}

export async function getProject(projectId, userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT state FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);
  return result.rows[0] ? safeJson(result.rows[0].state) : null;
}

export async function saveProject(project) {
  if (!project?.id) throw new Error("项目缺少 id");
  if (!project?.userId) throw new Error("项目缺少 userId");
  const db = await getDatabase();
  const result = await db.query(
    `INSERT INTO projects(id, user_id, title, mode, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, TO_TIMESTAMP($6 / 1000.0), NOW())
     ON CONFLICT(id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       title = EXCLUDED.title,
       mode = EXCLUDED.mode,
       state = EXCLUDED.state,
       updated_at = NOW()
     WHERE projects.user_id = EXCLUDED.user_id
     RETURNING id`,
    [
      project.id,
      project.userId,
      project.title || "新的学习项目",
      project.mode || "course",
      JSON.stringify(project),
      Number(project.createdAt || Date.now())
    ]
  );
  if (!result.rows.length) throw new Error("学习项目不存在或不属于当前用户");
  return project;
}

export async function deleteProject(projectId, userId) {
  const db = await getDatabase();
  await db.query("DELETE FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);
}

export async function projectBelongsToUser(projectId, userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT 1 FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);
  return result.rows.length > 0;
}

function sanitizeFilename(filename) {
  const cleaned = String(filename || "document")
    .replace(/[<>:"/\\|?* -]/g, "_")
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

export async function saveDocument({ projectId, userId, source, file, chunks, embeddings }) {
  const db = await getDatabase();
  const documentId = source.documentKey || randomUUID();
  const stored = await persistOriginalFile(projectId, file);

  const result = await db.query(
    `INSERT INTO documents(
       id, user_id, project_id, filename, stored_name, storage_path, mime_type,
       file_type, byte_size, page_count, chunk_count, summary, parse_report
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
    [
      documentId,
      userId,
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
         id, user_id, document_id, project_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector,$14::jsonb)`,
      [
        randomUUID(),
        userId,
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

export async function getDocument(documentId, userId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM documents WHERE id = $1 AND user_id = $2",
    [documentId, userId]
  );
  return result.rows[0] || null;
}

export async function listDocumentsForProject(projectId, userId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM documents WHERE project_id = $1 AND user_id = $2 ORDER BY created_at ASC",
    [projectId, userId]
  );
  return result.rows;
}

export async function replaceDocumentIndex({ projectId, userId, document, source, chunks, embeddings }) {
  const db = await getDatabase();
  await db.query("DELETE FROM document_chunks WHERE document_id = $1 AND project_id = $2", [document.id, projectId]);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await db.query(
      `INSERT INTO document_chunks(
         id, user_id, document_id, project_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector,$14::jsonb)`,
      [
        randomUUID(), userId, document.id, projectId, chunk.page, chunk.pageEnd || chunk.page,
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

export async function recordEvent(userId, projectId, eventType, payload) {
  const db = await getDatabase();
  await db.query(
    "INSERT INTO learning_events(id, user_id, project_id, event_type, payload) VALUES ($1,$2,$3,$4,$5::jsonb)",
    [randomUUID(), userId, projectId, eventType, JSON.stringify(payload || {})]
  );
}

export async function getUserAppSetting(userId, key) {
  const db = await getDatabase();
  const result = await db.query("SELECT value FROM app_settings WHERE key = $1", [`${key}:${userId}`]);
  return result.rows[0] ? safeJson(result.rows[0].value) : null;
}

export async function saveUserAppSetting(userId, key, value) {
  const db = await getDatabase();
  await db.query(
    `INSERT INTO app_settings(key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [`${key}:${userId}`, JSON.stringify(value || {})]
  );
  return value;
}

export async function hybridSearch(projectId, userId, query, queryEmbedding, limit = 6) {
  const db = await getDatabase();
  const take = Math.max(1, Math.min(Number(limit) || 6, 50));
  const candidates = new Map();
  const vectorResult = await db.query(
    `SELECT id, document_id, page_number, page_end, content, search_tokens,
            parent_id, parent_content, heading_path, metadata,
            1 - (embedding <=> $3::vector) AS vector_score
       FROM document_chunks
      WHERE project_id = $1 AND user_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $3::vector
      LIMIT $4`,
    [projectId, userId, vectorLiteral(queryEmbedding), take * 3]
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
              ts_rank_cd(to_tsvector('simple', search_tokens), to_tsquery('simple', $3)) AS keyword_score
         FROM document_chunks
        WHERE project_id = $1
          AND user_id = $2
          AND to_tsvector('simple', search_tokens) @@ to_tsquery('simple', $3)
        ORDER BY keyword_score DESC
        LIMIT $4`,
      [projectId, userId, tsQuery, take * 3]
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

export async function saveCoachSession(session) {
  const db = await getDatabase();
  if (!session?.id || !session.projectId) throw new Error("会话缺少 id 或 projectId");
  const result = await db.query(
    `INSERT INTO coach_sessions(
       id, user_id, project_id, concept_id, concept, question_id, question,
       messages, evaluations, score, status, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,TO_TIMESTAMP($12 / 1000.0),NOW())
     ON CONFLICT(id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       concept_id = EXCLUDED.concept_id,
       concept = EXCLUDED.concept,
       question_id = EXCLUDED.question_id,
       question = EXCLUDED.question,
       messages = EXCLUDED.messages,
       evaluations = EXCLUDED.evaluations,
       score = EXCLUDED.score,
       status = EXCLUDED.status,
       updated_at = NOW()
     WHERE coach_sessions.user_id = EXCLUDED.user_id
     RETURNING id`,
    [
      session.id,
      session.userId,
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
  if (!result.rows.length) throw new Error("会话不存在或不属于当前用户");
  return session;
}

export async function getCoachSession(sessionId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM coach_sessions WHERE id = $1", [sessionId]);
  if (!result.rows[0]) return null;
  return rowToCoachSession(result.rows[0]);
}

export async function listCoachSessions(projectId, userId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM coach_sessions WHERE project_id = $1 AND user_id = $2 ORDER BY updated_at DESC",
    [projectId, userId]
  );
  return result.rows.map(rowToCoachSession);
}

function rowToCoachSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
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
       id, user_id, project_id, query, answer, sources, debug, insufficient, demo, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,TO_TIMESTAMP($10 / 1000.0))`,
    [
      record.id,
      record.userId,
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

export async function listRagHistory(projectId, userId, limit = 50) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM rag_history WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3",
    [projectId, userId, Math.max(1, Number(limit) || 50)]
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
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
