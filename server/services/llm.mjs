import { getModelConfig } from "../model-config.mjs";
import { gatewayChat, isGatewayEnabled } from "../gateway-client.mjs";

export const cleanJson = (value) => {
  const text = String(value || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("文本模型没有返回合法 JSON");
  }
};

function pushText(parts, value) {
  if (value == null) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushText(parts, item);
    return;
  }
  if (typeof value === "object") {
    pushText(parts, value.text || value.content || value.output_text || value.transcript);
  }
}

/** 兼容字符串、多段 content、以及思考模型把正文放在 reasoning 里的情况。 */
export function extractChatContent(data) {
  const message = data?.choices?.[0]?.message || {};
  const parts = [];
  pushText(parts, message.content);
  if (!parts.length) pushText(parts, message.reasoning_content);
  if (!parts.length) pushText(parts, data?.output_text);
  return parts.join("\n").trim();
}

export function pickModelAnswer(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  for (const key of ["answer", "text", "content"]) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function completeChat(config, messages, temperature, timeoutMs, jsonObject) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        ...(jsonObject ? { response_format: { type: "json_object" } } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(`文本模型返回 ${response.status}：${detail.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`文本模型生成超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function completeViaGateway(messages, temperature, timeoutMs, jsonObject, userId, capability, maxTokens) {
  return gatewayChat({
    capability,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: jsonObject ? { type: "json_object" } : undefined,
    userId,
    timeoutMs
  });
}

/**
 * JSON chat. Gateway mode: pick capability (fast-chat / quality-chat).
 * Direct mode: uses the user's configured text model.
 */
export async function chatJson(
  messages,
  {
    temperature = 0.35,
    userId,
    timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000),
    capability = "quality-chat",
    maxTokens
  } = {}
) {
  const gateway = isGatewayEnabled();
  const config = gateway ? null : await getModelConfig(userId);
  if (!gateway && !config.apiKey) return null;

  const run = (jsonObject) =>
    gateway
      ? completeViaGateway(messages, temperature, timeoutMs, jsonObject, userId, capability, maxTokens)
      : completeChat(config, messages, temperature, timeoutMs, jsonObject);

  try {
    const data = await run(true);
    const raw = extractChatContent(data);
    return raw ? cleanJson(raw) : {};
  } catch (error) {
    if (!gateway && error.status === 400) {
      const data = await run(false);
      const raw = extractChatContent(data);
      return raw ? cleanJson(raw) : {};
    }
    if (gateway && /json|format|400/i.test(error.message)) {
      const data = await run(false);
      const raw = extractChatContent(data);
      return raw ? cleanJson(raw) : {};
    }
    throw error;
  }
}

/** Deep / coaching JSON — quality-chat on gateway. */
export async function deepseek(
  messages,
  temperature = 0.35,
  userId,
  timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000),
  maxTokens
) {
  return chatJson(messages, { temperature, userId, timeoutMs, capability: "quality-chat", maxTokens });
}

/** Ingestion / map-building / mid-coach JSON — fast-chat on gateway. */
export async function fastJson(
  messages,
  temperature = 0.35,
  userId,
  timeoutMs = Number(process.env.INGESTION_GENERATION_TIMEOUT_MS || 180_000),
  maxTokens
) {
  try {
    return await chatJson(messages, { temperature, userId, timeoutMs, capability: "fast-chat", maxTokens });
  } catch (error) {
    // If fast-chat upstream/fallback chain is unhealthy, fall back once to quality-chat.
    if (!isGatewayEnabled()) throw error;
    return chatJson(messages, {
      temperature,
      userId,
      timeoutMs,
      capability: "quality-chat",
      maxTokens
    });
  }
}
