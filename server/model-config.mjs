import { getUserAppSetting, saveUserAppSetting } from "./storage.mjs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
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

export async function getModelConfig(userId) {
  const stored = (await getUserAppSetting(userId, "deepseek")) || {};
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

export async function getPublicModelConfig(userId) {
  const config = await getModelConfig(userId);
  return {
    provider: providerFromBaseUrl(config.baseUrl),
    baseUrl: config.baseUrl,
    model: config.model,
    configured: Boolean(config.apiKey),
    apiKeyMasked: maskKey(config.apiKey)
  };
}

export async function updateModelConfig(userId, input = {}) {
  const current = await getModelConfig(userId);
  const next = {
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: String(input.model || current.model || DEFAULT_MODEL).trim(),
    apiKey: input.clearApiKey ? "" : String(input.apiKey || current.apiKey || "").trim()
  };
  if (!next.model) throw new Error("模型名称不能为空");
  await saveUserAppSetting(userId, "deepseek", next);
  return getPublicModelConfig(userId);
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

export async function testModelConfig(userId, input = {}) {
  const current = await getModelConfig(userId);
  return testOpenAiCompatibleConfig({
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: String(input.model || current.model).trim(),
    apiKey: String(input.apiKey || current.apiKey || "").trim()
  });
}

export async function getVisionConfig(userId) {
  const stored = (await getUserAppSetting(userId, "vision")) || {};
  return {
    baseUrl: normalizeBaseUrl(
      stored.baseUrl || process.env.VISION_BASE_URL || DEFAULT_VISION_BASE_URL,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(stored.model || process.env.VISION_MODEL || DEFAULT_VISION_MODEL).trim(),
    apiKey: String(stored.apiKey || process.env.VISION_API_KEY || "").trim()
  };
}

export async function getPublicVisionConfig(userId) {
  const config = await getVisionConfig(userId);
  return {
    provider: "阿里云百炼 Qwen OCR",
    baseUrl: config.baseUrl,
    model: config.model,
    configured: Boolean(config.apiKey),
    apiKeyMasked: maskKey(config.apiKey)
  };
}

export async function updateVisionConfig(userId, input = {}) {
  const current = await getVisionConfig(userId);
  const next = {
    baseUrl: normalizeBaseUrl(
      input.baseUrl || current.baseUrl,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(input.model || current.model || DEFAULT_VISION_MODEL).trim(),
    apiKey: input.clearApiKey ? "" : String(input.apiKey || current.apiKey || "").trim()
  };
  if (!next.model) throw new Error("视觉模型名称不能为空");
  await saveUserAppSetting(userId, "vision", next);
  return getPublicVisionConfig(userId);
}

export async function testVisionConfig(userId, input = {}) {
  const current = await getVisionConfig(userId);
  return testOpenAiCompatibleConfig({
    baseUrl: normalizeBaseUrl(
      input.baseUrl || current.baseUrl,
      DEFAULT_VISION_BASE_URL
    ),
    model: String(input.model || current.model).trim(),
    apiKey: String(input.apiKey || current.apiKey || "").trim()
  });
}

const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL || DASHSCOPE_BASE_URL;
const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-v3";
const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_RERANKER_BASE_URL = process.env.RERANKER_BASE_URL || DASHSCOPE_BASE_URL;
const DEFAULT_RERANKER_MODEL = process.env.RERANKER_MODEL || "gte-rerank";

export function resolveEmbeddingConfig(stored = {}) {
  const envProvider = String(process.env.EMBEDDING_PROVIDER || "").trim();
  const useLocal =
    String(stored.provider || "").trim() === "local" ||
    (envProvider === "local") ||
    (!stored.baseUrl && !envProvider && !process.env.EMBEDDING_BASE_URL);
  const baseUrl = normalizeBaseUrl(
    stored.baseUrl || process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
    DEFAULT_EMBEDDING_BASE_URL
  );
  const apiKey = String(stored.apiKey || process.env.EMBEDDING_API_KEY || "").trim();
  return {
    provider: useLocal ? "local" : "remote",
    baseUrl,
    apiKey,
    model: String(stored.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim(),
    dimensions: Math.max(
      1,
      Number(stored.dimensions || process.env.EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS)
    )
  };
}

export function resolveRerankerConfig(stored = {}, embeddingConfig) {
  const envProvider = String(process.env.RERANKER_PROVIDER || "").trim();
  const useLocal =
    String(stored.provider || "").trim() === "local" ||
    (envProvider === "local") ||
    (!stored.baseUrl && !envProvider && !process.env.RERANKER_BASE_URL);
  const baseUrl = normalizeBaseUrl(
    stored.baseUrl || process.env.RERANKER_BASE_URL || embeddingConfig?.baseUrl || DEFAULT_RERANKER_BASE_URL,
    DEFAULT_RERANKER_BASE_URL
  );
  const apiKey = String(stored.apiKey || process.env.RERANKER_API_KEY || embeddingConfig?.apiKey || "").trim();
  return {
    provider: useLocal ? "local" : "remote",
    baseUrl,
    apiKey,
    model: String(stored.model || process.env.RERANKER_MODEL || DEFAULT_RERANKER_MODEL).trim()
  };
}

function providerNameFromUrl(baseUrl) {
  const host = String(baseUrl || "").toLowerCase();
  if (host.includes("siliconflow") || host.includes("silicon")) return "SiliconFlow";
  if (host.includes("openai")) return "OpenAI";
  if (host.includes("deepseek")) return "DeepSeek";
  if (host.includes("moonshot") || host.includes("kimi")) return "Kimi";
  if (host.includes("dashscope") || host.includes("alibabacloud")) return "阿里云百炼";
  return "自定义";
}

export async function getEmbeddingConfig(userId) {
  const stored = (await getUserAppSetting(userId, "embedding")) || {};
  const embedding = resolveEmbeddingConfig(stored.embedding || {});
  const reranker = resolveRerankerConfig(stored.reranker || {}, embedding);
  return { embedding, reranker };
}

export async function getPublicEmbeddingConfig(userId) {
  const { embedding, reranker } = await getEmbeddingConfig(userId);
  return {
    embedding: {
      provider: embedding.provider,
      providerName: embedding.provider === "local" ? "本地 BGE-M3" : providerNameFromUrl(embedding.baseUrl),
      baseUrl: embedding.baseUrl,
      model: embedding.model,
      dimensions: embedding.dimensions,
      configured: embedding.provider === "local" ? true : Boolean(embedding.apiKey)
    },
    reranker: {
      provider: reranker.provider,
      providerName: reranker.provider === "local" ? "本地 bge-reranker" : providerNameFromUrl(reranker.baseUrl),
      baseUrl: reranker.baseUrl,
      model: reranker.model,
      configured: reranker.provider === "local" ? true : Boolean(reranker.apiKey)
    }
  };
}

export async function updateEmbeddingConfig(userId, input = {}) {
  const current = await getEmbeddingConfig(userId);
  const nextEmbedding = {
    provider: input.embedding?.provider === "remote" ? "remote" : "local",
    baseUrl: input.embedding?.baseUrl ? normalizeBaseUrl(input.embedding.baseUrl, DEFAULT_EMBEDDING_BASE_URL) : current.embedding.baseUrl,
    model: String(input.embedding?.model || current.embedding.model).trim(),
    dimensions: Math.max(1, Number(input.embedding?.dimensions || current.embedding.dimensions))
  };
  const clearEmbeddingKey = input.embedding?.clearApiKey;
  if (input.embedding?.apiKey || clearEmbeddingKey) {
    nextEmbedding.apiKey = clearEmbeddingKey ? "" : String(input.embedding.apiKey).trim();
  }

  const nextReranker = {
    provider: input.reranker?.provider === "remote" ? "remote" : "local",
    baseUrl: input.reranker?.baseUrl
      ? normalizeBaseUrl(input.reranker.baseUrl, DEFAULT_RERANKER_BASE_URL)
      : current.reranker.baseUrl,
    model: String(input.reranker?.model || current.reranker.model).trim()
  };
  const clearRerankerKey = input.reranker?.clearApiKey;
  if (input.reranker?.apiKey || clearRerankerKey) {
    nextReranker.apiKey = clearRerankerKey ? "" : String(input.reranker.apiKey).trim();
  }

  await saveUserAppSetting(userId, "embedding", {
    embedding: nextEmbedding,
    reranker: nextReranker
  });
  return getPublicEmbeddingConfig(userId);
}

export async function testEmbeddingConfig(userId, input = {}) {
  const current = await getEmbeddingConfig(userId);
  const config = resolveEmbeddingConfig({
    provider: input.embedding?.provider,
    baseUrl: input.embedding?.baseUrl || current.embedding.baseUrl,
    model: String(input.embedding?.model || current.embedding.model).trim(),
    apiKey: String(input.embedding?.apiKey || current.embedding.apiKey || "").trim()
  });
  if (config.provider === "local") {
    return { ok: true, message: "本地 BGE-M3 服务将随应用自动启动", local: true };
  }
  const result = await testOpenAiCompatibleConfig({
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey
  });
  return { ...result, provider: config.providerName || providerNameFromUrl(config.baseUrl) };
}

export async function testRerankerConfig(userId, input = {}) {
  const current = await getEmbeddingConfig(userId);
  const embedding = resolveEmbeddingConfig({
    provider: input.embedding?.provider,
    baseUrl: input.embedding?.baseUrl || current.embedding.baseUrl,
    apiKey: String(input.embedding?.apiKey || current.embedding.apiKey || "").trim()
  });
  const config = resolveRerankerConfig({
    provider: input.reranker?.provider,
    baseUrl: input.reranker?.baseUrl || current.reranker.baseUrl,
    model: String(input.reranker?.model || current.reranker.model).trim(),
    apiKey: String(input.reranker?.apiKey || current.reranker.apiKey || "").trim()
  }, embedding);
  if (config.provider === "local") {
    return { ok: true, message: "本地 bge-reranker 服务将随应用自动启动", local: true };
  }
  const response = await fetch(`${config.baseUrl}/rerank`, {
    method: "POST",
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      query: "test",
      documents: ["this is a test document"]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Reranker 连接失败（${response.status}）：${detail.slice(0, 180)}`);
  }
  const payload = await response.json();
  return {
    ok: true,
    provider: providerNameFromUrl(config.baseUrl),
    resultsCount: Array.isArray(payload.results) ? payload.results.length : null
  };
}
