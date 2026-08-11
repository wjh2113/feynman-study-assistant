import { getEmbeddingConfig, getModelConfig, getVisionConfig } from "../model-config.mjs";
import { deepseek } from "./llm.mjs";

const DEFAULT_ASR_MODEL = process.env.QWEN_ASR_MODEL || "qwen3-asr-flash";

function messageText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.transcript || "").join("");
  }
  return "";
}

async function resolveAsrConfig(userId) {
  const vision = await getVisionConfig(userId);
  if (vision.apiKey) {
    return {
      baseUrl: vision.baseUrl.replace(/\/$/, ""),
      apiKey: vision.apiKey,
      model: DEFAULT_ASR_MODEL,
      source: "vision"
    };
  }
  const embedding = await getEmbeddingConfig(userId);
  if (embedding?.embedding?.apiKey && embedding.embedding.provider !== "local") {
    return {
      baseUrl: String(embedding.embedding.baseUrl || "").replace(/\/$/, ""),
      apiKey: embedding.embedding.apiKey,
      model: DEFAULT_ASR_MODEL,
      source: "embedding"
    };
  }
  const envKey = process.env.VISION_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "";
  if (envKey) {
    return {
      baseUrl: (process.env.VISION_BASE_URL || process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, ""),
      apiKey: envKey,
      model: DEFAULT_ASR_MODEL,
      source: "env"
    };
  }
  throw new Error("未配置语音识别密钥。请先在「个人设置 → 模型服务」中配置 OCR（百炼）API Key");
}

async function callAsr({ baseUrl, apiKey, model }, audioDataUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.VOICE_TIMEOUT_MS || 90_000));
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: audioDataUrl } }]
          }
        ],
        stream: false,
        asr_options: { language: "zh", enable_itn: true }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `语音识别失败（HTTP ${response.status}）`);
    }
    return messageText(data).trim();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("语音识别超时，请缩短录音后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function refineTranscript(userId, rawText, purpose = "") {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
  if (!modelConfigured) return text;

  try {
    const result = await deepseek([
      {
        role: "system",
        content:
          "你是语音转写校对助手。根据口语识别结果，修正错别字、同音词、标点和明显不通顺处，保留原意与口语风格，不要扩写、不要总结、不要添加原文没有的信息。只输出合法JSON。"
      },
      {
        role: "user",
        content: `使用场景：${purpose || "通用输入"}
原始识别：${text}

返回：{"text":"修正后的完整文本"}`
      }
    ], 0.2, userId, 30_000);
    const refined = String(result?.text || "").trim();
    return refined || text;
  } catch {
    return text;
  }
}

export async function transcribeAndRefineAudio({
  userId,
  buffer,
  mimeType = "audio/webm",
  purpose = ""
}) {
  if (!buffer?.length) throw new Error("没有收到有效录音");
  const asr = await resolveAsrConfig(userId);
  const mime = String(mimeType || "audio/webm").split(";")[0] || "audio/webm";
  const audioDataUrl = `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
  const raw = await callAsr(asr, audioDataUrl);
  if (!raw) throw new Error("语音模型没有返回转写内容，请重新录制");
  const text = await refineTranscript(userId, raw, purpose);
  return {
    raw,
    text,
    model: asr.model,
    refined: text !== raw
  };
}
