import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decryptSecret, encryptSecret } from "../server/secret-crypto.mjs";
import { calculateEvidenceMastery, nextReviewAt } from "../server/learning-schedule.mjs";
import { createPaymentAdapter, newOrder, plans } from "../server/payments.mjs";
import { deleteObject, getObject, putObject } from "../server/object-storage.mjs";
import { enqueueTask, getTask } from "../server/task-queue.mjs";
import { resolveEmbeddingConfig, resolveRerankerConfig } from "../server/model-config.mjs";

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
  try {
    const stored = await putObject({ key: "project/file.txt", buffer: Buffer.from("hello"), localPath });
    assert.equal(stored.provider, "local");
    assert.equal((await getObject({ key: stored.key, storagePath: stored.storagePath })).toString(), "hello");
    await deleteObject({ key: stored.key, storagePath: stored.storagePath });
    await assert.rejects(() => getObject({ key: stored.key, storagePath: stored.storagePath }));
  } finally { await rm(folder, { recursive: true, force: true }); }
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
