/**
 * Clear learning / test data while keeping accounts and model/preferences config.
 * Usage: node scripts/clear-learning-data.mjs
 */
import "dotenv/config";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { getDatabase, uploadDir, databaseStatus } from "../server/db/client.mjs";

async function count(db, sql) {
  const result = await db.query(sql);
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  const db = await getDatabase();
  const status = await databaseStatus();
  console.log(`database: ${status.mode}`);

  const before = {
    users: await count(db, "SELECT COUNT(*)::int AS count FROM users"),
    settings: await count(db, "SELECT COUNT(*)::int AS count FROM app_settings"),
    projects: await count(db, "SELECT COUNT(*)::int AS count FROM projects"),
    chapters: await count(db, "SELECT COUNT(*)::int AS count FROM chapters"),
    documents: await count(db, "SELECT COUNT(*)::int AS count FROM documents"),
    chunks: await count(db, "SELECT COUNT(*)::int AS count FROM document_chunks"),
    coach: await count(db, "SELECT COUNT(*)::int AS count FROM coach_sessions"),
    rag: await count(db, "SELECT COUNT(*)::int AS count FROM rag_history"),
    ingest: await count(db, "SELECT COUNT(*)::int AS count FROM ingestion_jobs"),
    events: await count(db, "SELECT COUNT(*)::int AS count FROM learning_events"),
    reminders: await count(db, "SELECT COUNT(*)::int AS count FROM review_reminders")
  };
  console.log("before:", before);

  // Learning content (cascades chunks/docs/sessions/rag/ingest/reminders/events via project FK)
  await db.query("DELETE FROM projects");
  await db.query("DELETE FROM usage_records");

  // Safety: clear any orphans if FK was missing in older DBs
  await db.query("DELETE FROM document_chunks");
  await db.query("DELETE FROM documents");
  await db.query("DELETE FROM chapters");
  await db.query("DELETE FROM coach_sessions");
  await db.query("DELETE FROM rag_history");
  await db.query("DELETE FROM ingestion_jobs");
  await db.query("DELETE FROM learning_events");
  await db.query("DELETE FROM review_reminders");

  // Clear uploaded files; keep users + app_settings (model keys, preferences)
  try {
    const entries = await readdir(uploadDir, { withFileTypes: true });
    for (const entry of entries) {
      await rm(path.join(uploadDir, entry.name), { recursive: true, force: true });
    }
    console.log(`uploads cleared: ${uploadDir}`);
  } catch (error) {
    console.log(`uploads skip: ${error.message}`);
  }

  const after = {
    users: await count(db, "SELECT COUNT(*)::int AS count FROM users"),
    settings: await count(db, "SELECT COUNT(*)::int AS count FROM app_settings"),
    projects: await count(db, "SELECT COUNT(*)::int AS count FROM projects"),
    chapters: await count(db, "SELECT COUNT(*)::int AS count FROM chapters"),
    documents: await count(db, "SELECT COUNT(*)::int AS count FROM documents"),
    chunks: await count(db, "SELECT COUNT(*)::int AS count FROM document_chunks"),
    coach: await count(db, "SELECT COUNT(*)::int AS count FROM coach_sessions"),
    rag: await count(db, "SELECT COUNT(*)::int AS count FROM rag_history"),
    ingest: await count(db, "SELECT COUNT(*)::int AS count FROM ingestion_jobs")
  };
  console.log("after:", after);
  console.log("kept: users, user_sessions, app_settings (model/vision/embedding/preferences), schema_migrations");
  process.exit(0);
}

main().catch((error) => {
  console.error("clear failed:", error);
  process.exit(1);
});
