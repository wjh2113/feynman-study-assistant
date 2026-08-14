import { Router } from "express";
import { randomUUID } from "node:crypto";
import { nextReviewAt } from "../learning-schedule.mjs";
import {
  createReminder,
  getChapter,
  getCoachSession,
  getProject,
  listCoachSessions,
  listReminders,
  projectBelongsToUser,
  resolveChapterId,
  saveCoachSession
} from "../storage.mjs";
import { rateLimit } from "../middleware/security.mjs";
import { generateOnePager, generateVariantQuestion, diagnoseCoachSession, runCoachTurn } from "../services/coach.mjs";
import { generateLearningPlan } from "../services/learning-plan.mjs";

const router = Router();

function normalizeDocumentIds(value) {
  if (typeof value === "string") {
    return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

router.get("/api/reminders", async (req, res) => res.json({ reminders: await listReminders(req.userId, String(req.query.status || "pending")) }));
router.post("/api/projects/:projectId/reminders", async (req, res) => {
  if (!(await projectBelongsToUser(req.params.projectId, req.userId))) return res.status(404).json({ error: "学习项目不存在" });
  const reminder = await createReminder({ id: randomUUID(), userId: req.userId, projectId: req.params.projectId, conceptId: req.body?.conceptId, dueAt: req.body?.dueAt || nextReviewAt(req.body || {}), channel: req.body?.channel, payload: req.body?.payload });
  res.status(201).json({ reminder });
});

router.post("/api/coach", rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "coach" }), async (req, res) => {
  const {
    projectId,
    chapterId = null,
    documentIds,
    sessionId,
    question,
    concept,
    answer,
    role = "child",
    turn = 1
  } = req.body || {};
  const result = await runCoachTurn({
    userId: req.userId,
    projectId,
    chapterId,
    documentIds: normalizeDocumentIds(documentIds),
    sessionId,
    question,
    concept,
    answer,
    role,
    turn
  });
  res.status(result.status || 200).json(result.body);
});

router.post("/api/coach/diagnosis", rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "coach-diagnosis" }), async (req, res) => {
  const {
    projectId,
    sessionId,
    question,
    concept,
    documentIds
  } = req.body || {};
  const result = await diagnoseCoachSession({
    userId: req.userId,
    projectId,
    sessionId,
    question,
    concept,
    documentIds: normalizeDocumentIds(documentIds)
  });
  res.status(result.status || 200).json(result.body);
});

router.get("/api/projects/:projectId/sessions", async (req, res) => {
  try {
    const chapterId = req.query.chapterId || undefined;
    const documentIds = normalizeDocumentIds(req.query.documentIds);
    const sessions = await listCoachSessions(req.params.projectId, req.userId, {
      chapterId: chapterId ? String(chapterId) : undefined,
      documentIds: documentIds.length ? documentIds : undefined
    });
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: error.message || "读取教练会话失败" });
  }
});

router.post("/api/projects/:projectId/sessions", async (req, res) => {
  try {
    if (!(await projectBelongsToUser(req.params.projectId, req.userId))) {
      return res.status(404).json({ error: "学习项目不存在" });
    }
    const { conceptId, concept, questionId, question, meta, chapterId = null, documentIds } = req.body || {};
    const normalizedDocumentIds = normalizeDocumentIds(documentIds);
    const resolvedChapterId = chapterId
      ? await resolveChapterId(req.params.projectId, req.userId, chapterId)
      : null;
    const nextMeta = {
      ...(meta && typeof meta === "object" ? meta : {}),
      practiceDocumentIds: normalizedDocumentIds.length
        ? normalizedDocumentIds
        : normalizeDocumentIds(meta?.practiceDocumentIds)
    };
    const session = await saveCoachSession({
      id: randomUUID(),
      userId: req.userId,
      projectId: req.params.projectId,
      chapterId: resolvedChapterId,
      documentIds: normalizedDocumentIds,
      conceptId,
      concept,
      questionId,
      question,
      messages: [{ from: "ai", text: question || "请开始你的解释。" }],
      evaluations: [],
      meta: nextMeta,
      createdAt: Date.now()
    });
    res.json({ session });
  } catch (error) {
    res.status(400).json({ error: error.message || "创建会话失败" });
  }
});

router.put("/api/projects/:projectId/sessions/:sessionId", async (req, res) => {
  try {
    const session = await getCoachSession(req.params.sessionId);
    if (!session || session.projectId !== req.params.projectId || session.userId !== req.userId) {
      return res.status(404).json({ error: "会话不存在" });
    }
    const { messages, evaluations, score, status, meta, chapterId, documentIds } = req.body || {};
    // Prefer server-owned transcripts from /api/coach; allow client finish updates.
    if (messages) session.messages = messages;
    if (evaluations) session.evaluations = evaluations;
    if (score !== undefined) session.score = score;
    if (status) session.status = status;
    if (meta && typeof meta === "object") session.meta = { ...(session.meta || {}), ...meta };
    if (chapterId) session.chapterId = chapterId;
    if (Array.isArray(documentIds)) {
      session.documentIds = normalizeDocumentIds(documentIds);
      session.meta = {
        ...(session.meta || {}),
        practiceDocumentIds: session.documentIds
      };
    }
    await saveCoachSession(session);
    res.json({ session });
  } catch (error) {
    res.status(400).json({ error: error.message || "保存会话失败" });
  }
});

router.post("/api/projects/:projectId/blindspots/:blindspotId/variant-question", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId, req.userId);
    if (!project) return res.status(404).json({ error: "学习项目不存在" });
    const chapterId = req.body?.chapterId || req.query?.chapterId;
    let blindspot = (project.blindspots || []).find((item) => item.id === req.params.blindspotId) || null;
    if (!blindspot && chapterId) {
      const chapter = await getChapter(String(chapterId), req.userId);
      if (chapter && chapter.projectId === req.params.projectId) {
        blindspot = (chapter.blindspots || []).find((item) => item.id === req.params.blindspotId);
      }
    }
    if (!blindspot && chapterId) {
      const resolvedId = await resolveChapterId(req.params.projectId, req.userId, chapterId);
      const chapter = await getChapter(resolvedId, req.userId);
      blindspot = (chapter?.blindspots || []).find((item) => item.id === req.params.blindspotId);
    }
    if (!blindspot) return res.status(404).json({ error: "盲区不存在" });
    const concept = (project.analysis?.modules || [])
      .flatMap((module) => module.concepts || [])
      .find((item) => item.title === blindspot.concept || item.id === blindspot.conceptId);
    const question = await generateVariantQuestion(project, blindspot, concept, req.userId);
    res.json({ question });
  } catch (error) {
    res.status(500).json({ error: error.message || "生成变式题失败" });
  }
});

router.post("/api/one-pager", async (req, res) => {
  const {
    project,
    chapter = null,
    documentIds,
    practiceDocumentIds,
    practiceDocs
  } = req.body || {};
  const result = await generateOnePager({
    userId: req.userId,
    project,
    chapter,
    documentIds: normalizeDocumentIds(documentIds || practiceDocumentIds),
    practiceDocs
  });
  res.status(result.status || 200).json(result.body);
});

router.post("/api/learning-plan", rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "learning-plan" }), async (req, res) => {
  const { title, goal, level } = req.body || {};
  if (!String(title || "").trim()) {
    return res.status(400).json({ error: "请先填写学科名称" });
  }
  const result = await generateLearningPlan({
    userId: req.userId,
    title,
    goal,
    level
  });
  res.status(result.status || 200).json(result.body);
});

export default router;
