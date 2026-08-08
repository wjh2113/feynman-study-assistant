import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import pg from "pg";
import { isStandaloneDeploy } from "../deploy-mode.mjs";
import { databaseSslOption } from "../runtime-config.mjs";
import { migrateSchema } from "./schema.mjs";

const { Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, ".data"));
export const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, "uploads"));
const embeddedDbDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(dataDir, "postgres"));

let databasePromise;

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
      ssl: databaseSslOption(),
      max: Number(process.env.DATABASE_POOL_MAX || 10)
    });
    db = adapterFor(pool, "postgresql");
  } else {
    if (process.env.NODE_ENV === "production" && !isStandaloneDeploy()) {
      throw new Error("云模式生产环境禁止使用嵌入式 PGlite，请配置 DATABASE_URL；单机部署请设置 DEPLOY_MODE=standalone");
    }
    await mkdir(path.dirname(embeddedDbDir), { recursive: true });
    const embedded = process.env.PGLITE_MEMORY === "true"
      ? await PGlite.create({ extensions: { vector } })
      : await PGlite.create(
          `file://${path.relative(process.cwd(), embeddedDbDir).replace(/\\/g, "/")}`,
          { extensions: { vector } }
        );
    db = adapterFor(embedded, "pglite");
  }

  await migrateSchema(db);
  return db;
}

export function getDatabase() {
  if (!databasePromise) databasePromise = createDatabase();
  return databasePromise;
}

export async function databaseStatus() {
  const db = await getDatabase();
  const result = await db.query(
    "SELECT COUNT(*)::int AS projects, (SELECT COUNT(*)::int FROM documents) AS documents, (SELECT COUNT(*)::int FROM document_chunks) AS chunks FROM projects"
  );
  return { mode: db.mode, ...(result.rows[0] || { projects: 0, documents: 0, chunks: 0 }) };
}
