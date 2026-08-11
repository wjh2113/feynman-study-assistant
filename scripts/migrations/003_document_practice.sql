-- 003_document_practice
-- Document-scoped practice sessions (select materials for Feynman / blindspots / output).
-- Note: Node boot runs the equivalent JS migration in server/db/schema.mjs
-- (migrateDocumentPracticeIfNeeded). Apply this SQL manually only if needed.

ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS document_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Optional; skip if the engine rejects GIN on JSONB (e.g. some PGlite builds).
CREATE INDEX IF NOT EXISTS idx_coach_sessions_document_ids
  ON coach_sessions USING GIN (document_ids);

-- Practice-state merge (empty project blindspots/sessions/onePager ← chapters.state)
-- is performed only by the Node migration and is intentionally not duplicated here.
