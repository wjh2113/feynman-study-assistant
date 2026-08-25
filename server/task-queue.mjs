import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";

const memoryJobs = new Map();
let connection;
let queue;
let worker;
const handlers = new Map();

function redisEnabled() { return Boolean(process.env.REDIS_URL); }

function bullQueue() {
  if (!redisEnabled()) return null;
  if (!connection) connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  if (!queue) queue = new Queue("zhifan-tasks", { connection });
  return queue;
}

function ensureWorker() {
  if (!redisEnabled() || worker) return;
  bullQueue();
  if (!connection) return;
  worker = new Worker("zhifan-tasks", async (job) => {
    const handler = handlers.get(job.name);
    if (!handler) throw new Error(`任务处理器未注册：${job.name}`);
    return handler(job.data, (progress) => job.updateProgress(progress));
  }, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 2) });
}

export async function enqueueTask(name, payload, localHandler) {
  if (redisEnabled()) {
    handlers.set(name, localHandler);
    ensureWorker();
    try {
      const job = await Promise.race([
        bullQueue().add(name, payload, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 500,
          removeOnFail: 500
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Redis 任务队列响应超时")), Number(process.env.TASK_QUEUE_ENQUEUE_TIMEOUT_MS || 2500));
        })
      ]);
      return { id: String(job.id), name, status: "waiting", backend: "redis" };
    } catch {
      // Redis unavailable or slow — fall back to in-process queue so API stays fast.
    }
  }
  const id = randomUUID();
  const job = { id, name, userId: payload.userId, payload, status: "waiting", progress: 0, createdAt: Date.now(), backend: "memory" };
  memoryJobs.set(id, job);
  queueMicrotask(async () => {
    job.status = "active";
    try {
      job.result = await localHandler(payload, (progress) => { job.progress = progress; });
      job.progress = 100;
      job.status = "completed";
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
    }
  });
  return job;
}

/** Fire-and-forget enqueue; never blocks the HTTP response on queue connectivity. */
export function enqueueTaskLater(name, payload, localHandler) {
  void enqueueTask(name, payload, localHandler).catch(() => {});
}

export async function getTask(id) {
  if (redisEnabled()) {
    const job = await bullQueue().getJob(id);
    if (!job) return null;
    return { id: String(job.id), name: job.name, userId: job.data?.userId, status: await job.getState(), progress: job.progress, result: job.returnvalue, error: job.failedReason, backend: "redis" };
  }
  const job = memoryJobs.get(id);
  if (!job) return null;
  const { payload: _payload, ...publicJob } = job;
  return publicJob;
}

export async function getTaskPayload(id) {
  if (redisEnabled()) {
    const job = await bullQueue().getJob(id);
    return job?.data || null;
  }
  return memoryJobs.get(id)?.payload || null;
}

export function queueStatus() { return { backend: redisEnabled() ? "redis" : "memory", durable: redisEnabled() }; }
