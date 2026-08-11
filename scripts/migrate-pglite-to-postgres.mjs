/**
 * Copy all rows from local PGlite (.data/postgres) into DATABASE_URL PostgreSQL.
 *
 * Usage:
 *   node scripts/migrate-pglite-to-postgres.mjs
 *
 * Requires DATABASE_URL (or defaults to the local zhifan DB).
 * Uploaded files under .data/uploads are left in place (paths stay valid).
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import pg from "pg";
import { migrateSchema } from "../server/db/schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const embeddedDbDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(root, ".data", "postgres"));
const databaseUrl = process.env.DATABASE_URL || "postgresql://zhifan:zhifan_local_2026@127.0.0.1:5432/zhifan";

const TABLE_ORDER = [
  "users",
  "user_sessions",
  "app_settings",
  "projects",
  "documents",
  "document_chunks",
  "coach_sessions",
  "learning_events",
  "ingestion_jobs",
  "rag_history",
  "password_reset_tokens",
  "review_reminders",
  "orders",
  "subscriptions",
  "usage_records"
];

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function vectorLiteral(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return `[${value.map(Number).join(",")}]`;
  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith("[") && text.endsWith("]")) return text;
  return `[${text}]`;
}

function normalizeValue(column, value) {
  if (value == null) return null;
  if (column === "embedding") return vectorLiteral(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return result.rows;
}

async function copyTable(source, target, table) {
  const columns = await tableColumns(target, table);
  if (!columns.length) {
    console.log(`skip ${table}: missing on target`);
    return { table, copied: 0, skipped: true };
  }

  const colNames = columns.map((c) => c.column_name);
  const sourceRows = await source.query(`SELECT * FROM ${quoteIdent(table)}`);
  if (!sourceRows.rows.length) {
    console.log(`skip ${table}: empty`);
    return { table, copied: 0 };
  }

  const placeholders = colNames.map((_, i) => {
    const col = columns[i];
    if (col.udt_name === "vector") return `$${i + 1}::vector`;
    if (col.data_type === "jsonb" || col.udt_name === "jsonb") return `$${i + 1}::jsonb`;
    if (col.data_type === "boolean") return `$${i + 1}::boolean`;
    if (col.data_type === "integer" || col.data_type === "bigint" || col.data_type === "numeric") {
      return `$${i + 1}`;
    }
    if (col.data_type.startsWith("timestamp")) return `$${i + 1}::timestamptz`;
    return `$${i + 1}`;
  });

  const updates = colNames
    .filter((name) => name !== "id" && name !== "token" && name !== "token_hash" && name !== "key" && name !== "version")
    .map((name) => `${quoteIdent(name)} = EXCLUDED.${quoteIdent(name)}`);

  // Pick a conflict target that exists.
  let conflictTarget = null;
  if (colNames.includes("id")) conflictTarget = "id";
  else if (colNames.includes("token")) conflictTarget = "token";
  else if (colNames.includes("token_hash")) conflictTarget = "token_hash";
  else if (colNames.includes("key")) conflictTarget = "key";
  else if (colNames.includes("version")) conflictTarget = "version";

  const insertSql = conflictTarget
    ? `INSERT INTO ${quoteIdent(table)} (${colNames.map(quoteIdent).join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (${quoteIdent(conflictTarget)}) DO UPDATE SET ${updates.length ? updates.join(", ") : `${quoteIdent(conflictTarget)} = EXCLUDED.${quoteIdent(conflictTarget)}`}`
    : `INSERT INTO ${quoteIdent(table)} (${colNames.map(quoteIdent).join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT DO NOTHING`;

  let copied = 0;
  for (const row of sourceRows.rows) {
    const values = colNames.map((name) => normalizeValue(name, row[name]));
    await target.query(insertSql, values);
    copied += 1;
  }
  console.log(`copied ${table}: ${copied}`);
  return { table, copied };
}

async function main() {
  console.log(`source: ${embeddedDbDir}`);
  console.log(`target: ${databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@")}`);

  await rm(path.join(embeddedDbDir, "postmaster.pid"), { force: true });
  const source = await PGlite.create(embeddedDbDir, { extensions: { vector } });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const target = {
    query: (text, params = []) => pool.query(text, params)
  };

  try {
    await migrateSchema(target);
    await target.query("CREATE EXTENSION IF NOT EXISTS vector");

    const summary = [];
    for (const table of TABLE_ORDER) {
      summary.push(await copyTable(source, target, table));
    }

    const users = await target.query("SELECT username FROM users ORDER BY username");
    const projects = await target.query("SELECT COUNT(*)::int AS n FROM projects");
    const chunks = await target.query("SELECT COUNT(*)::int AS n FROM document_chunks WHERE embedding IS NOT NULL");
    const settings = await target.query("SELECT COUNT(*)::int AS n FROM app_settings");

    console.log("\n--- done ---");
    console.log(`users: ${users.rows.map((r) => r.username).join(", ")}`);
    console.log(`projects: ${projects.rows[0].n}`);
    console.log(`chunks with embedding: ${chunks.rows[0].n}`);
    console.log(`app_settings: ${settings.rows[0].n}`);
    console.log(`total rows copied: ${summary.reduce((sum, item) => sum + (item.copied || 0), 0)}`);
    console.log("\n用原来的账号密码登录即可（例如 Jonny）。上传文件仍在 .data/uploads。");
  } finally {
    await source.close?.();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("migration failed:", error);
  process.exitCode = 1;
});
