import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decryptSecret, encryptSecret } from "../server/secret-crypto.mjs";
import { calculateEvidenceMastery, nextReviewAt } from "../server/learning-schedule.mjs";
import { createPaymentAdapter, newOrder, plans } from "../server/payments.mjs";
import { assertProductionObjectStorage, deleteObject, getObject, objectStorageStatus, putObject } from "../server/object-storage.mjs";
import { isStandaloneDeploy } from "../server/deploy-mode.mjs";
import { assertProductionRuntimeConfig, databaseSslOption } from "../server/runtime-config.mjs";
import { enqueueTask, getTask } from "../server/task-queue.mjs";
import { resolveEmbeddingConfig, resolveRerankerConfig } from "../server/model-config.mjs";
import { buildRerankerRequest } from "../server/reranker-client.mjs";

test("模型密钥使用 AES-256-GCM 加密并可解密", () => {
  const previous = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = "test-only-key-with-at-least-32-bytes-long";
  const encrypted = encryptSecret("sk-commercial-secret");
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(encrypted.includes("sk-commercial-secret"), false);
  assert.equal(decryptSecret(encrypted), "sk-commercial-secret");
  if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous;
});

test("学习证据掌握度与间隔复习计划可计算", () => {
  assert.equal(calculateEvidenceMastery({ coachScores: [80, 90], retestScores: [75], explanationCount: 3 }), 78);
  assert.equal(nextReviewAt({ mastery: 2, lastReviewedAt: Date.UTC(2026, 0, 1) }), "2026-01-08T00:00:00.000Z");
});

test("沙箱支付生成订单和支付地址", async () => {
  const order = newOrder("user-1", "pro_monthly", "sandbox");
  const payment = await createPaymentAdapter("sandbox").create(order);
  assert.equal(order.amountFen, plans.pro_monthly.amountFen);
  assert.match(payment.payUrl, new RegExp(order.id));
});

test("本地对象存储可写入、读取和删除", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "zhifan-storage-"));
  const localPath = path.join(folder, "file.txt");
  const previousProvider = process.env.STORAGE_PROVIDER;
  process.env.STORAGE_PROVIDER = "local";
  try {
    const stored = await putObject({ key: "project/file.txt", buffer: Buffer.from("hello"), localPath });
    assert.equal(stored.provider, "local");
    assert.equal((await getObject({ key: stored.key, storagePath: stored.storagePath })).toString(), "hello");
    await deleteObject({ key: stored.key, storagePath: stored.storagePath });
    await assert.rejects(() => getObject({ key: stored.key, storagePath: stored.storagePath }));
  } finally {
    if (previousProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = previousProvider;
    await rm(folder, { recursive: true, force: true });
  }
});

test("京东云对象存储状态与生产校验", () => {
  const keys = [
    "NODE_ENV", "DEPLOY_MODE", "STANDALONE", "STORAGE_PROVIDER", "S3_REGION", "S3_ENDPOINT", "S3_BUCKET",
    "S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_SECRET", "DATABASE_URL", "REDIS_URL",
    "APP_ENCRYPTION_KEY", "ALLOWED_ORIGINS"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.DEPLOY_MODE;
    delete process.env.STANDALONE;
    process.env.STORAGE_PROVIDER = "jdcloud";
    process.env.S3_REGION = "cn-north-1";
    process.env.S3_BUCKET = "zhifan-uploads";
    process.env.S3_ACCESS_KEY_ID = "ak";
    process.env.S3_ACCESS_KEY_SECRET = "sk";
    delete process.env.S3_ENDPOINT;
    const status = objectStorageStatus();
    assert.equal(status.provider, "jdcloud");
    assert.equal(status.bucket, "zhifan-uploads");
    assert.equal(status.endpoint, "https://s3.cn-north-1.jdcloud-oss.com");

    process.env.NODE_ENV = "production";
    assert.doesNotThrow(() => assertProductionObjectStorage());

    process.env.STORAGE_PROVIDER = "local";
    assert.throws(() => assertProductionObjectStorage(), /单机部署请设置 DEPLOY_MODE=standalone/);

    process.env.STORAGE_PROVIDER = "jdcloud";
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/zhifan";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.APP_ENCRYPTION_KEY = "test-only-key-with-at-least-32-bytes-long";
    process.env.ALLOWED_ORIGINS = "https://study.example.com";
    assert.doesNotThrow(() => assertProductionRuntimeConfig());

    delete process.env.DATABASE_URL;
    assert.throws(() => assertProductionRuntimeConfig(), /DATABASE_URL/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("单机模式生产允许 PGlite 与本地磁盘", () => {
  const keys = [
    "NODE_ENV", "DEPLOY_MODE", "STANDALONE", "STORAGE_PROVIDER",
    "DATABASE_URL", "REDIS_URL", "APP_ENCRYPTION_KEY", "ALLOWED_ORIGINS"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NODE_ENV = "production";
    process.env.DEPLOY_MODE = "standalone";
    process.env.STORAGE_PROVIDER = "local";
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.APP_ENCRYPTION_KEY = "test-only-key-with-at-least-32-bytes-long";
    process.env.ALLOWED_ORIGINS = "https://study.example.com";

    assert.equal(isStandaloneDeploy(), true);
    assert.doesNotThrow(() => assertProductionObjectStorage());
    assert.doesNotThrow(() => assertProductionRuntimeConfig());

    delete process.env.APP_ENCRYPTION_KEY;
    assert.throws(() => assertProductionRuntimeConfig(), /APP_ENCRYPTION_KEY/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("DATABASE_SSL 解析支持 require 与 verify", () => {
  const previous = process.env.DATABASE_SSL;
  const previousCa = process.env.DATABASE_SSL_CA;
  try {
    process.env.DATABASE_SSL = "false";
    assert.equal(databaseSslOption(), undefined);
    process.env.DATABASE_SSL = "true";
    assert.deepEqual(databaseSslOption(), { rejectUnauthorized: false });
    process.env.DATABASE_SSL = "verify";
    process.env.DATABASE_SSL_CA = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----";
    assert.equal(databaseSslOption().rejectUnauthorized, true);
    assert.match(databaseSslOption().ca, /BEGIN CERTIFICATE/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_SSL; else process.env.DATABASE_SSL = previous;
    if (previousCa === undefined) delete process.env.DATABASE_SSL_CA; else process.env.DATABASE_SSL_CA = previousCa;
  }
});

test("无 Redis 时后台任务以内存队列执行并保留状态", async () => {
  const job = await enqueueTask("test", { value: 2 }, async ({ value }, progress) => { progress(50); return value * 3; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const completed = await getTask(job.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.result, 6);
});

test("检索模型默认使用云端且本地模式不会混用云端地址", () => {
  const previousEmbeddingProvider = process.env.EMBEDDING_PROVIDER;
  const previousEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
  const previousRerankerProvider = process.env.RERANKER_PROVIDER;
  const previousRerankerBaseUrl = process.env.RERANKER_BASE_URL;
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.RERANKER_PROVIDER;
  delete process.env.RERANKER_BASE_URL;
  try {
    const remoteEmbedding = resolveEmbeddingConfig({});
    assert.equal(remoteEmbedding.provider, "remote");
    assert.match(remoteEmbedding.baseUrl, /dashscope/);

    const localEmbedding = resolveEmbeddingConfig({ provider: "local", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" });
    assert.equal(localEmbedding.provider, "local");
    assert.equal(localEmbedding.baseUrl, "http://127.0.0.1:8001/v1");
    assert.equal(localEmbedding.model, "BAAI/bge-m3");

    const localReranker = resolveRerankerConfig({ provider: "local", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }, localEmbedding);
    assert.equal(localReranker.baseUrl, "http://127.0.0.1:8001/v1");
    assert.equal(localReranker.model, "BAAI/bge-reranker-v2-m3");
  } finally {
    if (previousEmbeddingProvider === undefined) delete process.env.EMBEDDING_PROVIDER; else process.env.EMBEDDING_PROVIDER = previousEmbeddingProvider;
    if (previousEmbeddingBaseUrl === undefined) delete process.env.EMBEDDING_BASE_URL; else process.env.EMBEDDING_BASE_URL = previousEmbeddingBaseUrl;
    if (previousRerankerProvider === undefined) delete process.env.RERANKER_PROVIDER; else process.env.RERANKER_PROVIDER = previousRerankerProvider;
    if (previousRerankerBaseUrl === undefined) delete process.env.RERANKER_BASE_URL; else process.env.RERANKER_BASE_URL = previousRerankerBaseUrl;
  }
});

test("百炼 Reranker 同时兼容完整接口和两种请求协议", () => {
  const compatible = buildRerankerRequest(
    { baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-api/v1/reranks", model: "qwen3-rerank" },
    "问题",
    ["资料"],
    1
  );
  assert.equal(compatible.endpoint.endsWith("/reranks"), true);
  assert.equal(compatible.endpoint.includes("/reranks/rerank"), false);
  assert.equal(compatible.body.top_n, 1);
  assert.deepEqual(compatible.parseResults({ results: [{ index: 0 }] }), [{ index: 0 }]);

  const native = buildRerankerRequest(
    { baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank", model: "qwen3-vl-rerank" },
    "问题",
    ["资料"],
    1
  );
  assert.equal(native.body.input.query, "问题");
  assert.equal(native.body.parameters.top_n, 1);
  assert.deepEqual(native.parseResults({ output: { results: [{ index: 0 }] } }), [{ index: 0 }]);
});
