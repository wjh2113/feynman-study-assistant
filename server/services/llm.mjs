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

async function completeViaGateway(messages, temperature, timeoutMs, jsonObject, userId, capability) {
  return gatewayChat({
    capability,
    messages,
    temperature,
    response_format: jsonObject ? { type: "json_object" } : undefined,
    userId,
    timeoutMs
  });
}

/**
 * JSON chat. Gateway mode: pick capability (fast-chat for ingest, quality-chat for coach).
 * Direct mode: uses the user's configured text model.
 */
export async function chatJson(
  messages,
  {
    temperature = 0.35,
    userId,
    timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000),
    capability = "quality-chat"
  } = {}
) {
  const gateway = isGatewayEnabled();
  const config = gateway ? null : await getModelConfig(userId);
  if (!gateway && !config.apiKey) return null;

  const run = (jsonObject) =>
    gateway
      ? completeViaGateway(messages, temperature, timeoutMs, jsonObject, userId, capability)
      : completeChat(config, messages, temperature, timeoutMs, jsonObject);

  try {
    const data = await run(true);
    return cleanJson(data.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    if (!gateway && error.status === 400) {
      const data = await run(false);
      return cleanJson(data.choices?.[0]?.message?.content || "{}");
    }
    if (gateway && /json|format|400/i.test(error.message)) {
      const data = await run(false);
      return cleanJson(data.choices?.[0]?.message?.content || "{}");
    }
    throw error;
  }
}

/** Deep / coaching JSON — quality-chat on gateway. */
export async function deepseek(messages, temperature = 0.35, userId, timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000)) {
  return chatJson(messages, { temperature, userId, timeoutMs, capability: "quality-chat" });
}

/** Ingestion / map-building JSON — fast-chat on gateway. */
export async function fastJson(messages, temperature = 0.35, userId, timeoutMs = Number(process.env.INGESTION_GENERATION_TIMEOUT_MS || 180_000)) {
  try {
    return await chatJson(messages, { temperature, userId, timeoutMs, capability: "fast-chat" });
  } catch (error) {
    // If fast-chat upstream/fallback chain is unhealthy, fall back once to quality-chat.
    if (!isGatewayEnabled()) throw error;
    return chatJson(messages, {
      temperature,
      userId,
      timeoutMs,
      capability: "quality-chat"
    });
  }
}
