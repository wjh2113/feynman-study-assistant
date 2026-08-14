import { getModelConfig } from "../model-config.mjs";

export const cleanJson = (value) => {
  const text = value.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return JSON.parse(text);
};

export async function deepseek(messages, temperature = 0.35, userId, timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 90_000)) {
  const config = await getModelConfig(userId);
  if (!config.apiKey) return null;
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
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`文本模型返回 ${response.status}：${detail.slice(0, 300)}`);
    }
    const data = await response.json();
    return cleanJson(data.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`文本模型生成超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
