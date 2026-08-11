/**
 * Inspect PGlite data without touching DATABASE_URL.
 * Usage: node scripts/inspect-pglite.mjs
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const embeddedDbDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(root, ".data", "postgres"));

await rm(path.join(embeddedDbDir, "postmaster.pid"), { force: true });
const db = await PGlite.create(embeddedDbDir, { extensions: { vector } });

const tables = await db.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`);
console.log("tables:", tables.rows.map((r) => r.tablename).join(", "));

for (const { tablename } of tables.rows) {
  const count = await db.query(`SELECT COUNT(*)::int AS n FROM "${tablename}"`);
  console.log(`  ${tablename}: ${count.rows[0].n}`);
}

const users = await db.query("SELECT id, username, email, created_at FROM users ORDER BY created_at");
console.log("\nusers:");
for (const row of users.rows) {
  console.log(`  - ${row.username} (${row.id}) email=${row.email || "-"}`);
}

const projects = await db.query("SELECT id, user_id, title FROM projects ORDER BY updated_at DESC LIMIT 20");
console.log("\nprojects:");
for (const row of projects.rows) {
  console.log(`  - ${row.title} [${row.id}] user=${row.user_id}`);
}

const settings = await db.query(`
  SELECT user_id, key FROM user_app_settings ORDER BY user_id, key
`).catch(() => ({ rows: [] }));
if (settings.rows.length) {
  console.log("\nuser_app_settings keys:");
  for (const row of settings.rows) console.log(`  - ${row.user_id} / ${row.key}`);
}

await db.close();
