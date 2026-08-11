import { Router } from "express";
import multer from "multer";
import { rateLimit } from "../middleware/security.mjs";
import { transcribeAndRefineAudio } from "../services/voice.mjs";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 }
});

function uploadAudio(req, res, next) {
  upload.single("audio")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "录音过长，请控制在约 2 分钟内" });
      }
      return res.status(400).json({ error: `上传失败：${error.message}` });
    }
    return res.status(400).json({ error: error.message || "上传失败" });
  });
}

const router = Router();

router.post(
  "/api/voice/transcribe",
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "voice" }),
  uploadAudio,
  async (req, res) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: "请先录制一段语音" });
      }
      const result = await transcribeAndRefineAudio({
        userId: req.userId,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype || "audio/webm",
        purpose: String(req.body?.purpose || "")
      });
      res.json(result);
    } catch (error) {
      const message = error.message || "语音识别失败";
      const status = /未配置|密钥/.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }
);

export default router;
