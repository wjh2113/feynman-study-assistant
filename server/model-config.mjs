import { getAppSetting, saveAppSetting } from "./storage.mjs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_VISION_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_VISION_MODEL = "qwen3.5-ocr";

function normalizeBaseUrl(value, fallback = DEFAULT_BASE_URL) {
  const baseUrl = String(value || fallback).trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("API 地址格式不正确");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("API 地址必须使用 HTTP 或 HTTPS");
  }
  return baseUrl;
}

function maskKey(apiKey) {
  if (!apiKey) return "";
  return `${apiKey.slice(0, Math.min(4, apiKey.length))}••••${apiKey.slice(-4)}`;
}

export async function getModelConfig() {
  const stored = (await getAppSetting("deepseek")) || {};
  return {
    baseUrl: normalizeBaseUrl(stored.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL),
    model: String(stored.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL).trim(),
    apiKey: String(stored.apiKey || process.env.DEEPSEEK_API_KEY || "").trim()
  };
}

function providerFromBaseUrl(baseUrl) {
  const host = String(baseUrl || "").toLowerCase();
  if (host.includes("deepseek")) return "DeepSeek";
  if (host.includes("moonshot") || host.includes("kimi")) return "Kimi";
  if (host.includes("openai")) return "OpenAI";
  return "自定义";
}

export async function getPublicModelConfig() {
  const config = await getModelConfig();
  return {
    provider: providerFromBaseUrl(config.baseUrl),
    baseUrl: config.baseUrl,
    model: config.model,
    configured: Boolean(config.apiKey),
    apiKeyMasked: maskKey(config.apiKey)
  };
}

export async function updateModelConfig(input = {}) {
  const current = await getModelConfig();
  const next = {
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: String(input.model || current.model || DEFAULT_MODEL).trim(),
    apiKey: input.clearApiKey ? "" : String(input.apiKey || current.apiKey || "").trim()
  };
  if (!next.model) throw new Error("模型名称不能为空");
  await saveAppSetting("deepseek", next);
  return getPublicModelConfig();
}

async function testOpenAiCompatibleConfig(config) {
  if (!config.apiKey) throw new Error("请先填写 API Key");
  const response = await fetch(`${config.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`连接失败（${response.status}）：${detail.slice(0, 180)}`);
  }
  const payload = await response.json();
  const models = (payload.data || []).map((item) => item.id).filter(Boolean);
  return {
    ok: true,
    modelAvailable: models.length ? models.includes(config.model) : null,
    models
  };
}

export async function testModelConfig(input = {}) {
  const current = await getModelConfig();
  return testOpenAiCompatibleConfig({
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: String(input.model || current.model).trim(),
    apiKey: String(input.apiKey || current.apiKey || "").trim()
  });
}

export async function getVisionConfig() {
  const stored = (await getAppSetting("vision")) || {};
  return {
    baseUrl: normalizeBaseUrl(
      stored.baseUrl || process.env.VISION_BASE_URL || DEFAULT_VISION_BASE_URL,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(stored.model || process.env.VISION_MODEL || DEFAULT_VISION_MODEL).trim(),
    apiKey: String(stored.apiKey || process.env.VISION_API_KEY || "").trim()
  };
}

export async function getPublicVisionConfig() {
  const config = await getVisionConfig();
  return {
    provider: "阿里云百炼 Qwen OCR",
    baseUrl: config.baseUrl,
    model: config.model,
    configured: Boolean(config.apiKey),
    apiKeyMasked: maskKey(config.apiKey)
  };
}

export async function updateVisionConfig(input = {}) {
  const current = await getVisionConfig();
  const next = {
    baseUrl: normalizeBaseUrl(
      input.baseUrl || current.baseUrl,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(input.model || current.model || DEFAULT_VISION_MODEL).trim(),
    apiKey: input.clearApiKey ? "" : String(input.apiKey || current.apiKey || "").trim()
  };
  if (!next.model) throw new Error("视觉模型名称不能为空");
  await saveAppSetting("vision", next);
  return getPublicVisionConfig();
}

export async function testVisionConfig(input = {}) {
  const current = await getVisionConfig();
  return testOpenAiCompatibleConfig({
    baseUrl: normalizeBaseUrl(
      input.baseUrl || current.baseUrl,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(input.model || current.model).trim(),
    apiKey: String(input.apiKey || current.apiKey || "").trim()
  });
}
