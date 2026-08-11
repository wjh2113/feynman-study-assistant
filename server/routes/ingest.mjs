import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { logError } from "../observability.mjs";
import { enqueueTask, getTask } from "../task-queue.mjs";
import {
  createIngestionJob,
  findActiveIngestionJob,
  getIngestionJob,
  getProject,
  listIngestionJobs,
  persistOriginalFile,
  projectBelongsToUser,
  updateIngestionJob
} from "../storage.mjs";
import { rateLimit } from "../middleware/security.mjs";
import { analyzeFiles, enqueueAnalysis } from "../services/analyze.mjs";
import { reindexProject } from "../services/reindex.mjs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 12 }
});

function uploadAnalyzeFiles(req, res, next) {
  upload.array("files", 12)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "单个文件不能超过 100 MB，请压缩或拆分后再上传" });
      }
      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ error: "一次最多上传 12 个文件" });
      }
      return res.status(400).json({ error: `上传失败：${error.message}` });
    }
    return res.status(400).json({ error: error.message || "上传失败" });
  });
}

const router = Router();

router.post("/api/projects/:projectId/reindex", async (req, res) => {
  try {
    if (req.query.background === "true") {
      if (!(await projectBelongsToUser(req.params.projectId, req.userId))) return res.status(404).json({ error: "学习项目不存在" });
      const job = await enqueueTask("reindex", { projectId: req.params.projectId, userId: req.userId }, ({ projectId, userId }, progress) => reindexProject(projectId, userId, progress));
      return res.status(202).json({ job });
    }
    res.json(await reindexProject(req.params.projectId, req.userId));
  } catch (error) {
    logError(error, { requestId: req.requestId, route: "project_reindex", projectId: req.params.projectId, userId: req.userId });
    res.status(400).json({ error: error.message || "重建资料索引失败" });
  }
});

router.get("/api/tasks/:taskId", async (req, res) => {
  const task = await getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "任务不存在" });
  if (task.userId && task.userId !== req.userId) return res.status(404).json({ error: "任务不存在" });
  res.json({ task });
});

router.post("/api/analyze", rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "analyze" }), uploadAnalyzeFiles, async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "请至少上传一份学习资料" });
    const input = {
      files,
      userId: req.userId,
      title: req.body.title || "新的学习项目",
      mode: req.body.mode || "course",
      projectId: req.body.projectId || `project-${Date.now()}`,
      chapterId: req.body.chapterId || null
    };
    if (req.query.background === "true") {
      const existingProject = await getProject(input.projectId, input.userId);
      if (!existingProject) throw new Error("学习项目不存在");
      const duplicate = await findActiveIngestionJob(input.projectId, input.userId, files.map((file) => file.originalname));
      if (duplicate) return res.status(409).json({ error: "相同资料已经在后台解析，请勿重复上传", ingestionId: duplicate.id });
      const persisted = [];
      for (const file of files) persisted.push(await persistOriginalFile(input.projectId, file));
      const ingestionId = randomUUID();
      const jobFiles = files.map((file, index) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        stored: persisted[index],
        documentKey: randomUUID()
      }));
      const payload = {
        ingestionId,
        projectId: input.projectId,
        userId: input.userId,
        title: input.title,
        mode: input.mode,
        chapterId: input.chapterId,
        files: jobFiles
      };
      await createIngestionJob({ id: ingestionId, userId: input.userId, projectId: input.projectId, payload });
      const job = await enqueueAnalysis(payload);
      return res.status(202).json({ task: job, ingestionId });
    }
    res.json(await analyzeFiles(input));
  } catch (error) {
    logError(error, { requestId: req.requestId, route: "analyze", userId: req.userId });
    res.status(400).json({ error: error.message || "分析失败" });
  }
});

router.post("/api/ingestions/:ingestionId/retry", async (req, res) => {
  try {
    const ingestion = await getIngestionJob(req.params.ingestionId, req.userId);
    if (!ingestion) return res.status(404).json({ error: "后台解析任务不存在" });
    if (ingestion.status !== "failed") return res.status(409).json({ error: "只有失败的解析任务可以重试" });
    await updateIngestionJob(ingestion.id, req.userId, { status: "waiting", error: null });
    const task = await enqueueAnalysis(ingestion.payload);
    res.status(202).json({ task, ingestionId: ingestion.id, resumedFrom: ingestion.stage });
  } catch (error) {
    res.status(400).json({ error: error.message || "重试后台解析失败" });
  }
});

router.get("/api/ingestions", async (req, res) => {
  const statuses = String(req.query.status || "waiting,active").split(",").map((item) => item.trim()).filter(Boolean);
  res.json({ ingestions: await listIngestionJobs(req.userId, statuses) });
});

router.get("/api/ingestions/:ingestionId", async (req, res) => {
  const ingestion = await getIngestionJob(req.params.ingestionId, req.userId);
  if (!ingestion) return res.status(404).json({ error: "后台解析任务不存在" });
  res.json({ ingestion: {
    id: ingestion.id,
    projectId: ingestion.project_id,
    status: ingestion.status,
    stage: ingestion.stage,
    progress: Number(ingestion.progress || 0),
    error: ingestion.error,
    filenames: (ingestion.payload.files || []).map((file) => file.originalname)
  } });
});

export default router;
