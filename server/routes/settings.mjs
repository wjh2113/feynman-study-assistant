import { Router } from "express";
import {
  getPublicEmbeddingConfig,
  getPublicModelConfig,
  getPublicVisionConfig,
  testEmbeddingConfig,
  testModelConfig,
  testRerankerConfig,
  testVisionConfig,
  updateEmbeddingConfig,
  updateModelConfig,
  updateVisionConfig
} from "../model-config.mjs";

const router = Router();

router.get("/api/settings/model", async (req, res) => {
  try {
    res.json(await getPublicModelConfig(req.userId));
  } catch (error) {
    res.status(500).json({ error: error.message || "读取模型配置失败" });
  }
});

router.put("/api/settings/model", async (req, res) => {
  try {
    res.json(await updateModelConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "保存模型配置失败" });
  }
});

router.post("/api/settings/model/test", async (req, res) => {
  try {
    res.json(await testModelConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "模型连接测试失败" });
  }
});

router.get("/api/settings/vision", async (req, res) => {
  try {
    res.json(await getPublicVisionConfig(req.userId));
  } catch (error) {
    res.status(500).json({ error: error.message || "读取 OCR 视觉模型配置失败" });
  }
});

router.put("/api/settings/vision", async (req, res) => {
  try {
    res.json(await updateVisionConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "保存 OCR 视觉模型配置失败" });
  }
});

router.post("/api/settings/vision/test", async (req, res) => {
  try {
    res.json(await testVisionConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "OCR 视觉模型连接测试失败" });
  }
});

router.get("/api/settings/embedding", async (req, res) => {
  try {
    res.json(await getPublicEmbeddingConfig(req.userId));
  } catch (error) {
    res.status(500).json({ error: error.message || "读取 Embedding 配置失败" });
  }
});

router.put("/api/settings/embedding", async (req, res) => {
  try {
    res.json(await updateEmbeddingConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "保存 Embedding 配置失败" });
  }
});

router.post("/api/settings/embedding/test", async (req, res) => {
  try {
    res.json(await testEmbeddingConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "Embedding 连接测试失败" });
  }
});

router.post("/api/settings/reranker/test", async (req, res) => {
  try {
    res.json(await testRerankerConfig(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "Reranker 连接测试失败" });
  }
});

export default router;
