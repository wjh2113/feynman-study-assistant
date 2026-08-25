/**
 * AIapiMgr LLM 网关客户端。
 * 环境变量 LLM_GATEWAY_URL + LLM_GATEWAY_API_KEY 均配置时启用；
 * 未配置时各服务继续走 OpenAI 兼容直连。
 */

export function isGatewayEnabled() {
  return Boolean(
    String(process.env.LLM_GATEWAY_URL || "").trim() &&
    String(process.env.LLM_GATEWAY_API_KEY || "").trim()
  );
}

export function gatewayConfig() {
  return {
    baseUrl: String(process.env.LLM_GATEWAY_URL || "").trim().replace(/\/+$/, ""),
    apiKey: String(process.env.LLM_GATEWAY_API_KEY || "").trim(),
    tenantId: String(process.env.LLM_GATEWAY_TENANT_ID || "").trim() || undefined,
    dataClass: String(process.env.LLM_GATEWAY_DATA_CLASS || "internal").trim() || "internal",
    fallback: process.env.LLM_GATEWAY_FALLBACK !== "false"
  };
}

/** 供 /api/health 与设置页展示，不含密钥 */
export function getGatewayPublicStatus() {
  if (!isGatewayEnabled()) return { enabled: false };
  const { baseUrl, tenantId, dataClass, fallback } = gatewayConfig();
  return {
    enabled: true,
    baseUrl,
    tenantId,
    dataClass,
    fallback
  };
}

function gatewayError(status, detail = "") {
  const snippet = String(detail || "").slice(0, 200);
  if (status === 401) return new Error(`LLM 网关鉴权失败（401），请检查 LLM_GATEWAY_API_KEY${snippet ? `：${snippet}` : ""}`);
  if (status === 402) return new Error("LLM 网关积分不足（402），请联系管理员充值");
  if (status === 403) return new Error(`LLM 网关数据级别受限（403）${snippet ? `：${snippet}` : ""}`);
  if (status === 404) return new Error(`LLM 网关能力不存在（404）${snippet ? `：${snippet}` : ""}`);
  if (status === 503) return new Error("LLM 网关暂无可用模型路由（503）");
  return new Error(`LLM 网关返回 ${status}${snippet ? `：${snippet}` : ""}`);
}

async function gatewayFetch(path, { method = "POST", body, headers = {}, timeoutMs = 60_000, signal } = {}) {
  const { baseUrl, apiKey } = gatewayConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortOnParent = () => controller.abort();
  signal?.addEventListener?.("abort", abortOnParent);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers
      },
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw gatewayError(response.status, detail);
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`LLM 网关请求超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abortOnParent);
  }
}

export async function gatewayChat({
  capability = "quality-chat",
  messages,
  temperature,
  max_tokens,
  response_format,
  stream = false,
  userId,
  idempotencyKey,
  timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000)
} = {}) {
  const { tenantId, dataClass, fallback } = gatewayConfig();
  const payload = {
    capability,
    messages,
    dataClass,
    fallback,
    stream
  };
  if (tenantId) payload.tenantId = tenantId;
  if (userId) payload.userId = String(userId);
  if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
  if (temperature !== undefined) payload.temperature = temperature;
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  if (response_format) payload.response_format = response_format;

  try {
    const response = await gatewayFetch("/api/ai/chat", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      timeoutMs
    });
    return response.json();
  } catch (error) {
    // 部分上游（如部分 GPT-5 系）不支持 temperature / max_tokens
    const msg = String(error.message || "");
    const stripTemp = /Unsupported parameter[^"]*'temperature'|temperature.*is not supported/i.test(msg);
    const stripMax = /Unsupported parameter[^"]*'max_tokens'|max_tokens.*is not supported/i.test(msg);
    if (!stripTemp && !stripMax) throw error;
    const retry = { ...payload };
    if (stripTemp) delete retry.temperature;
    if (stripMax) delete retry.max_tokens;
    const response = await gatewayFetch("/api/ai/chat", {
      body: JSON.stringify(retry),
      headers: { "Content-Type": "application/json" },
      timeoutMs
    });
    return response.json();
  }
}

export async function gatewayEmbeddings({
  input,
  dimensions,
  idempotencyKey,
  timeoutMs = Number(process.env.RETRIEVAL_TIMEOUT_MS || 30_000)
} = {}) {
  const { tenantId, dataClass, fallback } = gatewayConfig();
  // SiliconFlow BAAI/bge-m3 等上游对 dimensions 会直接 400；不传则默认返回 1024 维。
  // dimensions 参数仅用于调用方事后校验，不发给网关。
  void dimensions;
  const payload = {
    capability: "embedding",
    input,
    dataClass,
    fallback
  };
  if (tenantId) payload.tenantId = tenantId;
  if (idempotencyKey) payload.idempotencyKey = idempotencyKey;

  const response = await gatewayFetch("/api/ai/embeddings", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    timeoutMs
  });
  return response.json();
}

export async function gatewayVisionChat({
  messages,
  userId,
  idempotencyKey,
  timeoutMs = Number(process.env.OCR_TIMEOUT_MS || 25_000)
} = {}) {
  return gatewayChat({
    capability: "vision",
    messages,
    temperature: 0,
    userId,
    idempotencyKey,
    timeoutMs
  });
}

export async function gatewayTranscribe({
  buffer,
  filename = "audio.webm",
  mimeType = "audio/webm",
  language = "zh",
  idempotencyKey,
  timeoutMs = Number(process.env.VOICE_TIMEOUT_MS || 90_000)
} = {}) {
  const { tenantId, dataClass, fallback } = gatewayConfig();
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append("file", blob, filename);
  form.append("capability", "speech");
  form.append("language", language);
  form.append("dataClass", dataClass);
  form.append("fallback", String(fallback));
  if (tenantId) form.append("tenantId", tenantId);
  if (idempotencyKey) form.append("idempotencyKey", idempotencyKey);

  const response = await gatewayFetch("/api/ai/transcribe", {
    body: form,
    timeoutMs
  });
  return response.json();
}

/**
 * 尝试调用网关 rerank（若网关尚未暴露该接口则返回 null，由调用方降级）。
 */
export async function gatewayRerank({
  query,
  documents,
  topN = 5,
  idempotencyKey,
  timeoutMs = Number(process.env.RETRIEVAL_TIMEOUT_MS || 30_000)
} = {}) {
  const { tenantId, dataClass, fallback } = gatewayConfig();
  const payload = {
    capability: "rerank",
    query,
    documents,
    top_n: topN,
    dataClass,
    fallback
  };
  if (tenantId) payload.tenantId = tenantId;
  if (idempotencyKey) payload.idempotencyKey = idempotencyKey;

  try {
    const response = await gatewayFetch("/api/ai/rerank", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      timeoutMs
    });
    return response.json();
  } catch (error) {
    if (/404|能力不存在/.test(error.message)) return null;
    throw error;
  }
}

export async function gatewayHealth(timeoutMs = 5000) {
  if (!isGatewayEnabled()) return { ok: false, enabled: false };
  try {
    const response = await gatewayFetch("/api/ai/capabilities", {
      method: "GET",
      timeoutMs
    });
    const payload = await response.json();
    return { ok: true, enabled: true, capabilities: payload.data || [] };
  } catch (error) {
    return { ok: false, enabled: true, error: error.message };
  }
}

export async function isLlmConfigured(userId) {
  if (isGatewayEnabled()) return true;
  const { getModelConfig } = await import("./model-config.mjs");
  return Boolean((await getModelConfig(userId)).apiKey);
}
