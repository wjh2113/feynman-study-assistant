import { Router } from "express";
import { randomUUID } from "node:crypto";
import { listRagHistory, saveRagHistory } from "../storage.mjs";
import { rateLimit } from "../middleware/security.mjs";
import { answerRagQuery } from "../services/rag-answer.mjs";

const router = Router();

router.get("/api/projects/:projectId/rag-history", async (req, res) => {
  try {
    const records = await listRagHistory(req.params.projectId, req.userId, Number(req.query.limit) || 50);
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message || "读取 RAG 历史失败" });
  }
});

router.post("/api/projects/:projectId/rag-history", async (req, res) => {
  try {
    const { query, answer, sources, debug, insufficient, demo } = req.body || {};
    const record = await saveRagHistory({
      id: randomUUID(),
      userId: req.userId,
      projectId: req.params.projectId,
      query,
      answer,
      sources,
      debug,
      insufficient,
      demo,
      createdAt: Date.now()
    });
    res.json({ record });
  } catch (error) {
    res.status(400).json({ error: error.message || "保存 RAG 历史失败" });
  }
});

router.post("/api/rag", rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "rag" }), async (req, res) => {
  const { projectId, query } = req.body || {};
  const result = await answerRagQuery({ userId: req.userId, projectId, query });
  res.status(result.status || 200).json(result.body);
});

export default router;
