import { randomUUID } from "node:crypto";
import { embeddingDimensions } from "../constants.mjs";

export async function migrateSchema(db) {
  await db.query("CREATE EXTENSION IF NOT EXISTS vector");
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE");
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
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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
  await db.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL");
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
  await db.query("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL");
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
  await db.query("ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb");
  await db.query("ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL");
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
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb, checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'waiting', stage TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
    error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS review_reminders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, concept_id TEXT,
    due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'pending', channel TEXT NOT NULL DEFAULT 'in_app',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL, provider TEXT NOT NULL, external_id TEXT, amount_fen INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY', status TEXT NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id), plan_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL, quantity NUMERIC NOT NULL DEFAULT 0, cost_fen INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query("INSERT INTO schema_migrations(version) VALUES ('001_commercial_foundation') ON CONFLICT(version) DO NOTHING");
  await db.query("ALTER TABLE rag_history ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_documents_chapter ON documents(chapter_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_project ON document_chunks(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_user ON document_chunks(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON document_chunks(chapter_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_events_project ON learning_events(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_events_user ON learning_events(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_project ON coach_sessions(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_user ON coach_sessions(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_coach_sessions_chapter ON coach_sessions(chapter_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rag_history_project ON rag_history(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rag_history_user ON rag_history(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_chapters_user ON chapters(user_id)");

  await migrateLegacyDataIfNeeded(db);
  await migrateChaptersIfNeeded(db);
  await migrateDocumentPracticeIfNeeded(db);
}

async function migrateDocumentPracticeIfNeeded(db) {
  const applied = await db.query("SELECT 1 FROM schema_migrations WHERE version = $1", ["003_document_practice"]);
  if (applied.rows.length) return;

  await db.query(
    "ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS document_ids JSONB NOT NULL DEFAULT '[]'::jsonb"
  );
  try {
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_coach_sessions_document_ids ON coach_sessions USING GIN (document_ids)"
    );
  } catch {
    // PGlite / limited engines may not support GIN on JSONB; column alone is enough.
  }

  const projects = await db.query("SELECT id, state FROM projects");
  for (const row of projects.rows) {
    const projectState = typeof row.state === "string"
      ? (() => { try { return JSON.parse(row.state); } catch { return {}; } })()
      : (row.state || {});
    const projectBlindspots = Array.isArray(projectState.blindspots) ? projectState.blindspots : [];
    const projectSessions = Array.isArray(projectState.sessions) ? projectState.sessions : [];
    const projectOnePager = projectState.onePager ?? null;
    const practiceEmpty =
      !projectBlindspots.length && !projectSessions.length && projectOnePager == null;
    if (!practiceEmpty) continue;

    const chapters = await db.query("SELECT state FROM chapters WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC", [row.id]);
    const mergedBlindspots = [];
    const mergedSessions = [];
    let mergedOnePager = null;
    for (const chapterRow of chapters.rows) {
      const chapterState = typeof chapterRow.state === "string"
        ? (() => { try { return JSON.parse(chapterRow.state); } catch { return {}; } })()
        : (chapterRow.state || {});
      if (Array.isArray(chapterState.blindspots)) mergedBlindspots.push(...chapterState.blindspots);
      if (Array.isArray(chapterState.sessions)) mergedSessions.push(...chapterState.sessions);
      if (mergedOnePager == null && chapterState.onePager != null) mergedOnePager = chapterState.onePager;
    }

    if (!mergedBlindspots.length && !mergedSessions.length && mergedOnePager == null) continue;

    const nextProjectState = {
      ...projectState,
      blindspots: mergedBlindspots,
      sessions: mergedSessions,
      onePager: mergedOnePager
    };
    await db.query(
      "UPDATE projects SET state = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [row.id, JSON.stringify(nextProjectState)]
    );
  }

  await db.query(
    "INSERT INTO schema_migrations(version) VALUES ('003_document_practice') ON CONFLICT(version) DO NOTHING"
  );
}

async function migrateChaptersIfNeeded(db) {
  const applied = await db.query("SELECT 1 FROM schema_migrations WHERE version = $1", ["002_chapters"]);
  if (applied.rows.length) return;

  const projects = await db.query("SELECT id, user_id, state FROM projects WHERE user_id IS NOT NULL");
  for (const row of projects.rows) {
    const existing = await db.query("SELECT id FROM chapters WHERE project_id = $1 LIMIT 1", [row.id]);
    if (existing.rows.length) continue;

    const projectState = typeof row.state === "string"
      ? (() => { try { return JSON.parse(row.state); } catch { return {}; } })()
      : (row.state || {});
    const chapterId = randomUUID();
    const now = Date.now();
    const chapterState = {
      id: chapterId,
      projectId: row.id,
      userId: row.user_id,
      title: "默认章节",
      sortOrder: 0,
      blindspots: Array.isArray(projectState.blindspots) ? projectState.blindspots : [],
      sessions: Array.isArray(projectState.sessions) ? projectState.sessions : [],
      onePager: projectState.onePager ?? null,
      analysis: {},
      createdAt: now,
      updatedAt: now
    };
    await db.query(
      `INSERT INTO chapters(id, project_id, user_id, title, sort_order, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, TO_TIMESTAMP($7 / 1000.0), NOW())`,
      [chapterId, row.id, row.user_id, "默认章节", 0, JSON.stringify(chapterState), now]
    );

    const nextProjectState = {
      ...projectState,
      blindspots: [],
      sessions: [],
      onePager: null
    };
    await db.query(
      "UPDATE projects SET state = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [row.id, JSON.stringify(nextProjectState)]
    );
    await db.query(
      "UPDATE documents SET chapter_id = $1 WHERE project_id = $2 AND chapter_id IS NULL",
      [chapterId, row.id]
    );
    await db.query(
      "UPDATE document_chunks SET chapter_id = $1 WHERE project_id = $2 AND chapter_id IS NULL",
      [chapterId, row.id]
    );
    await db.query(
      "UPDATE coach_sessions SET chapter_id = $1 WHERE project_id = $2 AND chapter_id IS NULL",
      [chapterId, row.id]
    );
  }

  await db.query(
    "INSERT INTO schema_migrations(version) VALUES ('002_chapters') ON CONFLICT(version) DO NOTHING"
  );
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
