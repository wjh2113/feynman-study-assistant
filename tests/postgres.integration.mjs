import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import IORedis from "ioredis";

test("标准 PostgreSQL/pgvector 迁移和 Redis 可用", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || "";
  const { getDatabase, databaseStatus } = await import(`../server/storage.mjs?integration=${Date.now()}`);
  const db = await getDatabase();
  assert.equal((await databaseStatus()).mode, "postgresql");
  const migrations = await db.query("SELECT version FROM schema_migrations ORDER BY version");
  assert.ok(migrations.rows.some((row) => row.version === "001_commercial_foundation"));
  const vectorExtension = await db.query("SELECT extname FROM pg_extension WHERE extname='vector'");
  assert.equal(vectorExtension.rows.length, 1);
  if (process.env.TEST_REDIS_URL) {
    const redis = new IORedis(process.env.TEST_REDIS_URL);
    assert.equal(await redis.ping(), "PONG");
    await redis.quit();
  }
  await db.close();
});
