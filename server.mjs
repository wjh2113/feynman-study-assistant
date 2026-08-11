import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embeddingStatus, retrievalServiceHealth } from "./server/embedding.mjs";
import { ensureLocalRetrievalService } from "./server/model-service.mjs";
import { getPublicModelConfig } from "./server/model-config.mjs";
import { mailStatus } from "./server/mailer.mjs";
import { requestContext, metricsSnapshot } from "./server/observability.mjs";
import { objectStorageStatus } from "./server/object-storage.mjs";
import { assertProductionRuntimeConfig, runtimeConfigHints } from "./server/runtime-config.mjs";
import { queueStatus } from "./server/task-queue.mjs";
import { secretsEncryptionStatus } from "./server/secret-crypto.mjs";
import {
  databaseStatus,
  deleteExpiredUserSessions,
  getDatabase
} from "./server/storage.mjs";
import { requireAuth, verifyRequestOrigin } from "./server/middleware/security.mjs";
import authRouter from "./server/routes/auth.mjs";
import accountRouter from "./server/routes/account.mjs";
import billingRouter from "./server/routes/billing.mjs";
import settingsRouter from "./server/routes/settings.mjs";
import projectsRouter from "./server/routes/projects.mjs";
import ingestRouter from "./server/routes/ingest.mjs";
import learningRouter from "./server/routes/learning.mjs";
import ragRouter from "./server/routes/rag.mjs";
import voiceRouter from "./server/routes/voice.mjs";

const app = express();
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(requestContext);
app.use("/api", verifyRequestOrigin);

// Public routes (before requireAuth)
app.use(authRouter);
app.get("/api/health", async (_req, res) => {
  try {
    const modelConfig = await getPublicModelConfig();
    res.json({
      ok: true,
      model: modelConfig.model,
      configured: modelConfig.configured,
      runtime: runtimeConfigHints(),
      database: await databaseStatus(),
      embedding: embeddingStatus(),
      retrievalService: await retrievalServiceHealth(),
      storage: objectStorageStatus(),
      queue: queueStatus(),
      mail: mailStatus(),
      secrets: secretsEncryptionStatus()
    });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.use("/api", requireAuth);

app.get("/api/diagnostics/metrics", (_req, res) => res.json({ metrics: metricsSnapshot() }));

// Authenticated routes — order matches prior monolithic registration
app.use(accountRouter);
app.use(learningRouter); // reminders first among these; coach/sessions/etc. share unique paths
app.use(billingRouter);
app.use(projectsRouter); // export before settings in original; paths do not collide
app.use(settingsRouter);
app.use(ingestRouter);
app.use(ragRouter);
app.use(voiceRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(dist, "index.html"));
});

assertProductionRuntimeConfig();
await ensureLocalRetrievalService();
await getDatabase();
await deleteExpiredUserSessions();
const sessionCleanupTimer = setInterval(() => {
  deleteExpiredUserSessions().catch((error) => console.error("[auth] 清理过期会话失败", error));
}, 6 * 60 * 60 * 1000);
sessionCleanupTimer.unref();
app.listen(port, "0.0.0.0", () => {
  console.log(`Feynman Study API listening on http://127.0.0.1:${port}`);
  getPublicModelConfig().then((config) =>
    console.log(config.configured ? `DeepSeek ready: ${config.model}` : "Demo mode: DeepSeek API Key is not configured")
  );
  const hints = runtimeConfigHints();
  console.log(`Deploy mode: ${hints.deployMode}`);
  databaseStatus().then((status) => console.log(`Persistence ready: ${status.mode} + pgvector`));
  console.log(`Object storage: ${JSON.stringify(objectStorageStatus())}`);
});
