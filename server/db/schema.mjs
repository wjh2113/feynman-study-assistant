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
