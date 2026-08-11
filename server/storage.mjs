import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteObject, putObject } from "./object-storage.mjs";
import { dataDir, uploadDir, getDatabase, databaseStatus } from "./db/client.mjs";
import { hybridSearch } from "./repos/search.mjs";

export { dataDir, uploadDir, getDatabase, databaseStatus, hybridSearch };

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

export async function createUser({ id, username, email = null, passwordHash, salt }) {
  const db = await getDatabase();
  await db.query(
    "INSERT INTO users(id, username, email, password_hash, salt) VALUES ($1, $2, $3, $4, $5)",
    [id, username, email, passwordHash, salt]
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

export async function getUserByEmail(email) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  return result.rows[0] || null;
}

export async function updateUserPassword(userId, passwordHash, salt) {
  const db = await getDatabase();
  await db.query("UPDATE users SET password_hash=$2, salt=$3, updated_at=NOW() WHERE id=$1", [userId, passwordHash, salt]);
  await db.query("DELETE FROM user_sessions WHERE user_id=$1", [userId]);
}

export async function savePasswordResetToken(tokenHash, userId, expiresAt) {
  const db = await getDatabase();
  await db.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [tokenHash, userId, expiresAt]);
}

export async function consumePasswordResetToken(tokenHash) {
  const db = await getDatabase();
  const result = await db.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() RETURNING user_id", [tokenHash]);
  return result.rows[0]?.user_id || null;
}

export async function createReminder(reminder) {
  const db = await getDatabase();
  await db.query("INSERT INTO review_reminders(id,user_id,project_id,concept_id,due_at,channel,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)", [reminder.id, reminder.userId, reminder.projectId, reminder.conceptId || null, reminder.dueAt, reminder.channel || "in_app", JSON.stringify(reminder.payload || {})]);
  return reminder;
}

export async function listReminders(userId, status = "pending") {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM review_reminders WHERE user_id=$1 AND status=$2 ORDER BY due_at", [userId, status]);
  return result.rows.map((row) => ({ ...row, payload: safeJson(row.payload) }));
}

export async function saveOrder(order) {
  const db = await getDatabase();
  await db.query("INSERT INTO orders(id,user_id,plan_id,provider,external_id,amount_fen,currency,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)", [order.id, order.userId, order.planId, order.provider, order.externalId || null, order.amountFen, order.currency, order.status, JSON.stringify(order.metadata || {})]);
  return order;
}

export async function getOrder(id, userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2", [id, userId]);
  return result.rows[0] || null;
}

export async function markOrderPaid(id) {
  const db = await getDatabase();
  const result = await db.query("UPDATE orders SET status='paid',paid_at=NOW() WHERE id=$1 AND status='pending' RETURNING *", [id]);
  return result.rows[0] || null;
}

export async function createSubscription({ id, userId, orderId, planId, endsAt }) {
  const db = await getDatabase();
  await db.query("INSERT INTO subscriptions(id,user_id,order_id,plan_id,ends_at) VALUES($1,$2,$3,$4,$5)", [id, userId, orderId, planId, endsAt]);
}

export async function listSubscriptions(userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC", [userId]);
  return result.rows;
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

function rowToChapter(row) {
  const state = safeJson(row.state, {});
  return {
    ...state,
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    title: row.title || state.title || "未命名章节",
    sortOrder: Number(row.sort_order ?? state.sortOrder ?? 0),
    createdAt: state.createdAt || new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

export async function listChapters(projectId, userId) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM chapters WHERE project_id = $1 AND user_id = $2 ORDER BY sort_order ASC, created_at ASC",
    [projectId, userId]
  );
  return result.rows.map(rowToChapter);
}

export async function getChapter(chapterId, userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM chapters WHERE id = $1 AND user_id = $2", [chapterId, userId]);
  return result.rows[0] ? rowToChapter(result.rows[0]) : null;
}

export async function saveChapter(chapter) {
  if (!chapter?.id) throw new Error("章节缺少 id");
  if (!chapter?.projectId) throw new Error("章节缺少 projectId");
  if (!chapter?.userId) throw new Error("章节缺少 userId");
  const db = await getDatabase();
  const payload = {
    ...chapter,
    id: chapter.id,
    projectId: chapter.projectId,
    userId: chapter.userId,
    title: chapter.title || "未命名章节",
    sortOrder: Number(chapter.sortOrder || 0),
    updatedAt: Date.now()
  };
  const result = await db.query(
    `INSERT INTO chapters(id, project_id, user_id, title, sort_order, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, TO_TIMESTAMP($7 / 1000.0), NOW())
     ON CONFLICT(id) DO UPDATE SET
       title = EXCLUDED.title,
       sort_order = EXCLUDED.sort_order,
       state = EXCLUDED.state,
       updated_at = NOW()
     WHERE chapters.user_id = EXCLUDED.user_id AND chapters.project_id = EXCLUDED.project_id
     RETURNING id`,
    [
      payload.id,
      payload.projectId,
      payload.userId,
      payload.title,
      payload.sortOrder,
      JSON.stringify(payload),
      Number(payload.createdAt || Date.now())
    ]
  );
  if (!result.rows.length) throw new Error("章节不存在或不属于当前用户");
  return payload;
}

export async function deleteChapter(chapterId, userId) {
  const db = await getDatabase();
  await db.query("DELETE FROM chapters WHERE id = $1 AND user_id = $2", [chapterId, userId]);
}

export async function ensureDefaultChapter(projectId, userId) {
  const existing = await listChapters(projectId, userId);
  if (existing.length) {
    return existing.find((item) => item.title === "默认章节") || existing[0];
  }
  if (!(await projectBelongsToUser(projectId, userId))) {
    throw new Error("学习项目不存在或不属于当前用户");
  }
  const now = Date.now();
  return saveChapter({
    id: randomUUID(),
    projectId,
    userId,
    title: "默认章节",
    sortOrder: 0,
    blindspots: [],
    sessions: [],
    onePager: null,
    analysis: {},
    createdAt: now
  });
}

export async function resolveChapterId(projectId, userId, chapterId) {
  if (chapterId) {
    const chapter = await getChapter(chapterId, userId);
    if (chapter && chapter.projectId === projectId) return chapter.id;
  }
  const fallback = await ensureDefaultChapter(projectId, userId);
  return fallback.id;
}

function sanitizeFilename(filename) {
  const cleaned = Array.from(String(filename || "document"), (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || '<>:"/\\|?*'.includes(ch)) return "_";
    return ch;
  })
    .join("")
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
  const key = `${sanitizeFilename(projectId)}/${storedName}`;
  const stored = await putObject({ key, buffer: file.buffer, localPath: storagePath });
  return { storedName: key, storagePath: stored.storagePath };
}

function vectorLiteral(vectorValue) {
  return `[${vectorValue.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function saveDocument({ projectId, userId, chapterId = null, source, file, chunks, embeddings, stored: existingStored }) {
  const db = await getDatabase();
  const documentId = source.documentKey || randomUUID();
  const stored = existingStored || await persistOriginalFile(projectId, file);

  await db.query("DELETE FROM document_chunks WHERE document_id = $1 AND project_id = $2", [documentId, projectId]);
  await db.query(
    `INSERT INTO documents(
       id, user_id, project_id, chapter_id, filename, stored_name, storage_path, mime_type,
       file_type, byte_size, page_count, chunk_count, summary, parse_report
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
     ON CONFLICT(id) DO UPDATE SET
       chapter_id=EXCLUDED.chapter_id,
       filename=EXCLUDED.filename, stored_name=EXCLUDED.stored_name, storage_path=EXCLUDED.storage_path,
       mime_type=EXCLUDED.mime_type, file_type=EXCLUDED.file_type, byte_size=EXCLUDED.byte_size,
       page_count=EXCLUDED.page_count, chunk_count=EXCLUDED.chunk_count,
       summary=EXCLUDED.summary, parse_report=EXCLUDED.parse_report`,
    [
      documentId,
      userId,
      projectId,
      chapterId || null,
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
         id, user_id, document_id, project_id, chapter_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector,$15::jsonb)`,
      [
        randomUUID(),
        userId,
        documentId,
        projectId,
        chapterId || null,
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
    chapterId: chapterId || null,
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
  const chapterId = document.chapter_id || document.chapterId || null;
  await db.query("DELETE FROM document_chunks WHERE document_id = $1 AND project_id = $2", [document.id, projectId]);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await db.query(
      `INSERT INTO document_chunks(
         id, user_id, document_id, project_id, chapter_id, page_number, page_end, chunk_index,
         parent_id, parent_content, heading_path, content, search_tokens, embedding, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector,$15::jsonb)`,
      [
        randomUUID(), userId, document.id, projectId, chapterId, chunk.page, chunk.pageEnd || chunk.page,
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
    "SELECT stored_name, storage_path FROM documents WHERE id = $1 AND project_id = $2",
    [documentId, projectId]
  );
  const document = result.rows[0];
  if (!document) return false;

  if (!String(document.storage_path).startsWith("oss://")) {
    const resolvedUploadDir = path.resolve(uploadDir);
    const resolvedStoragePath = path.resolve(document.storage_path);
    const relativeStoragePath = path.relative(resolvedUploadDir, resolvedStoragePath);
    if (relativeStoragePath.startsWith("..") || path.isAbsolute(relativeStoragePath)) throw new Error("资料文件路径不在允许的存储目录内");
  }
  await deleteObject({ key: document.stored_name, storagePath: document.storage_path });

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

export async function createIngestionJob({ id, userId, projectId, payload }) {
  const db = await getDatabase();
  await db.query(
    `INSERT INTO ingestion_jobs(id, user_id, project_id, payload) VALUES ($1,$2,$3,$4::jsonb)`,
    [id, userId, projectId, JSON.stringify(payload || {})]
  );
  return getIngestionJob(id, userId);
}

export async function getIngestionJob(id, userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM ingestion_jobs WHERE id = $1 AND user_id = $2", [id, userId]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, payload: safeJson(row.payload) || {}, checkpoint: safeJson(row.checkpoint) || {} };
}

export async function findActiveIngestionJob(projectId, userId, filenames = []) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT * FROM ingestion_jobs WHERE project_id=$1 AND user_id=$2 AND status IN ('waiting','active') ORDER BY created_at DESC",
    [projectId, userId]
  );
  const wanted = [...filenames].map(String).sort().join("\n");
  for (const row of result.rows) {
    const payload = safeJson(row.payload) || {};
    const existing = (payload.files || []).map((file) => String(file.originalname)).sort().join("\n");
    if (existing === wanted) return { ...row, payload, checkpoint: safeJson(row.checkpoint) || {} };
  }
  return null;
}

export async function listIngestionJobs(userId, statuses = ["waiting", "active"]) {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT id, project_id, status, stage, progress, error, payload, created_at, updated_at FROM ingestion_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
    [userId]
  );
  return result.rows
    .filter((row) => !statuses.length || statuses.includes(row.status))
    .map((row) => {
      const payload = safeJson(row.payload) || {};
      return {
        id: row.id,
        projectId: row.project_id,
        status: row.status,
        stage: row.stage,
        progress: Number(row.progress || 0),
        error: row.error,
        filenames: (payload.files || []).map((file) => file.originalname),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
}

export async function updateIngestionJob(id, userId, patch = {}) {
  const db = await getDatabase();
  const current = await getIngestionJob(id, userId);
  if (!current) return null;
  const checkpoint = patch.checkpoint ? { ...current.checkpoint, ...patch.checkpoint } : current.checkpoint;
  await db.query(
    `UPDATE ingestion_jobs SET status=$3, stage=$4, progress=$5, error=$6,
       checkpoint=$7::jsonb, updated_at=NOW() WHERE id=$1 AND user_id=$2`,
    [id, userId, patch.status || current.status, patch.stage || current.stage,
      Number(patch.progress ?? current.progress), patch.error === undefined ? current.error : patch.error,
      JSON.stringify(checkpoint)]
  );
  return getIngestionJob(id, userId);
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

function normalizeDocumentIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

function documentIdsOverlap(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || !right.length) return false;
  const selected = new Set(right.map(String));
  return left.some((id) => selected.has(String(id)));
}

export async function saveCoachSession(session) {
  const db = await getDatabase();
  if (!session?.id || !session.projectId) throw new Error("会话缺少 id 或 projectId");
  const documentIds = normalizeDocumentIds(session.documentIds);
  const hasDocumentIds = Array.isArray(session.documentIds);
  const result = await db.query(
    `INSERT INTO coach_sessions(
       id, user_id, project_id, chapter_id, document_ids, concept_id, concept, question_id, question,
       messages, evaluations, score, status, meta, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,TO_TIMESTAMP($15 / 1000.0),NOW())
     ON CONFLICT(id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       chapter_id = COALESCE(EXCLUDED.chapter_id, coach_sessions.chapter_id),
       document_ids = CASE
         WHEN $16::boolean THEN EXCLUDED.document_ids
         ELSE coach_sessions.document_ids
       END,
       concept_id = EXCLUDED.concept_id,
       concept = EXCLUDED.concept,
       question_id = EXCLUDED.question_id,
       question = EXCLUDED.question,
       messages = EXCLUDED.messages,
       evaluations = EXCLUDED.evaluations,
       score = EXCLUDED.score,
       status = EXCLUDED.status,
       meta = EXCLUDED.meta,
       updated_at = NOW()
     WHERE coach_sessions.user_id = EXCLUDED.user_id
     RETURNING id`,
    [
      session.id,
      session.userId,
      session.projectId,
      session.chapterId || null,
      JSON.stringify(documentIds),
      session.conceptId || null,
      session.concept || null,
      session.questionId || null,
      session.question || null,
      JSON.stringify(session.messages || []),
      JSON.stringify(session.evaluations || []),
      session.score ?? null,
      session.status || null,
      JSON.stringify(session.meta || {}),
      Number(session.createdAt || Date.now()),
      hasDocumentIds
    ]
  );
  if (!result.rows.length) throw new Error("会话不存在或不属于当前用户");
  return { ...session, documentIds };
}

export async function getCoachSession(sessionId) {
  const db = await getDatabase();
  const result = await db.query("SELECT * FROM coach_sessions WHERE id = $1", [sessionId]);
  if (!result.rows[0]) return null;
  return rowToCoachSession(result.rows[0]);
}

export async function listCoachSessions(projectId, userId, { chapterId, documentIds } = {}) {
  const db = await getDatabase();
  const result = chapterId
    ? await db.query(
        "SELECT * FROM coach_sessions WHERE project_id = $1 AND user_id = $2 AND chapter_id = $3 ORDER BY updated_at DESC",
        [projectId, userId, chapterId]
      )
    : await db.query(
        "SELECT * FROM coach_sessions WHERE project_id = $1 AND user_id = $2 ORDER BY updated_at DESC",
        [projectId, userId]
      );
  const sessions = result.rows.map(rowToCoachSession);
  const filterIds = normalizeDocumentIds(documentIds);
  if (!filterIds.length) return sessions;
  return sessions.filter((session) => {
    const fromColumn = normalizeDocumentIds(session.documentIds);
    const fromMeta = normalizeDocumentIds(session.meta?.practiceDocumentIds);
    return documentIdsOverlap(fromColumn, filterIds) || documentIdsOverlap(fromMeta, filterIds);
  });
}

function rowToCoachSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    chapterId: row.chapter_id || null,
    documentIds: normalizeDocumentIds(safeJson(row.document_ids, [])),
    conceptId: row.concept_id,
    concept: row.concept,
    questionId: row.question_id,
    question: row.question,
    messages: safeJson(row.messages, []),
    evaluations: safeJson(row.evaluations, []),
    score: row.score,
    status: row.status,
    meta: safeJson(row.meta, {}),
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
