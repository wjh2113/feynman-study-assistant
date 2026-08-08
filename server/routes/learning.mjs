import { Router } from "express";
import { randomUUID } from "node:crypto";
import { nextReviewAt } from "../learning-schedule.mjs";
import {
  createReminder,
  getCoachSession,
  getProject,
  listCoachSessions,
  listReminders,
  projectBelongsToUser,
  saveCoachSession
} from "../storage.mjs";
import { rateLimit } from "../middleware/security.mjs";
import { generateOnePager, generateVariantQuestion, runCoachTurn } from "../services/coach.mjs";

const router = Router();

router.get("/api/reminders", async (req, res) => res.json({ reminders: await listReminders(req.userId, String(req.query.status || "pending")) }));
router.post("/api/projects/:projectId/reminders", async (req, res) => {
  if (!(await projectBelongsToUser(req.params.projectId, req.userId))) return res.status(404).json({ error: "学习项目不存在" });
  const reminder = await createReminder({ id: randomUUID(), userId: req.userId, projectId: req.params.projectId, conceptId: req.body?.conceptId, dueAt: req.body?.dueAt || nextReviewAt(req.body || {}), channel: req.body?.channel, payload: req.body?.payload });
  res.status(201).json({ reminder });
});

router.post("/api/coach", rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "coach" }), async (req, res) => {
  const { projectId, sessionId, question, concept, answer, role = "child", turn = 1 } = req.body || {};
  const result = await runCoachTurn({
    userId: req.userId,
    projectId,
    sessionId,
    question,
    concept,
    answer,
    role,
    turn
  });
  res.status(result.status || 200).json(result.body);
});

router.get("/api/projects/:projectId/sessions", async (req, res) => {
  try {
    const sessions = await listCoachSessions(req.params.projectId, req.userId);
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
    const { conceptId, concept, questionId, question } = req.body || {};
    const session = await saveCoachSession({
      id: randomUUID(),
      userId: req.userId,
      projectId: req.params.projectId,
      conceptId,
      concept,
      questionId,
      question,
      messages: [{ from: "ai", text: question || "请开始你的解释。" }],
      evaluations: [],
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
    const { messages, evaluations, score, status } = req.body || {};
    if (messages) session.messages = messages;
    if (evaluations) session.evaluations = evaluations;
    if (score !== undefined) session.score = score;
    if (status) session.status = status;
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
    const blindspot = (project.blindspots || []).find((item) => item.id === req.params.blindspotId);
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
  const { project } = req.body || {};
  const result = await generateOnePager({ userId: req.userId, project });
  res.status(result.status || 200).json(result.body);
});

export default router;
