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
import {
  buildUserConfigBundle,
  importUserConfigBundle,
  wrapConfigPayload
} from "../model-config-backup.mjs";
import { getUserPreferences, saveUserPreferences } from "../user-preferences.mjs";

const router = Router();

router.get("/api/settings/preferences", async (req, res) => {
  try {
    res.json(await getUserPreferences(req.userId));
  } catch (error) {
    res.status(500).json({ error: error.message || "读取个人偏好失败" });
  }
});

router.put("/api/settings/preferences", async (req, res) => {
  try {
    res.json(await saveUserPreferences(req.userId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "保存个人偏好失败" });
  }
});

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

router.get("/api/settings/config/export", async (req, res) => {
  try {
    const bundle = await buildUserConfigBundle(req.userId);
    const payload = wrapConfigPayload([bundle]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `zhifan-model-config-${bundle.username || "user"}-${stamp}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    res.status(500).json({ error: error.message || "导出配置失败" });
  }
});

router.post("/api/settings/config/import", async (req, res) => {
  try {
    const result = await importUserConfigBundle(req.userId, req.body || {});
    res.json({
      ok: true,
      ...result,
      model: await getPublicModelConfig(req.userId),
      vision: await getPublicVisionConfig(req.userId),
      embedding: await getPublicEmbeddingConfig(req.userId)
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "导入配置失败" });
  }
});

export default router;
