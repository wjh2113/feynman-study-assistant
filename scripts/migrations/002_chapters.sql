-- 002_chapters.sql
-- Mirror of runtime migration in server/db/schema.mjs (migrateChaptersIfNeeded).
-- App boot applies this automatically via schema_migrations version '002_chapters'.
-- Run manually only if you need to bootstrap a fresh database without starting the Node server.

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL;
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_chapter ON documents(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON document_chunks(chapter_id);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_chapter ON coach_sessions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user ON chapters(user_id);

-- Data backfill (default chapter + attach documents/sessions) is performed by Node migration.
INSERT INTO schema_migrations(version) VALUES ('002_chapters') ON CONFLICT(version) DO NOTHING;
