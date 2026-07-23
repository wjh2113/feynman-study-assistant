import { getVisionConfig } from "./model-config.mjs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 25_000);

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/\r/g, "")
    .trim();
}

export async function recognizeImage(buffer, mimeType = "image/png", label = "图片", userId) {
  const config = await getVisionConfig(userId);
  if (!config.apiKey) {
    return {
      text: "",
      status: "not_configured",
      warning: "未配置 OCR 视觉模型，图片内容尚未识别"
    };
  }
  if (!buffer?.length) {
    return { text: "", status: "empty", warning: "图片数据为空" };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      text: "",
      status: "skipped",
      warning: `图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024} MB，已跳过 OCR`
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `请对“${label}”进行忠实 OCR。提取图片中所有可读文字，保留标题、列表和表格关系。` +
                "不要总结、不要补写看不清的内容；没有文字则返回“[无可识别文字]”。只输出识别文字。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${buffer.toString("base64")}`
              }
            }
          ]
        }
      ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        text: "",
        status: "failed",
        warning: `OCR 调用失败（${response.status}）：${detail.slice(0, 160)}`
      };
    }

    const payload = await response.json();
    const text = normalizeOcrText(payload.choices?.[0]?.message?.content);
    return {
      text: text === "[无可识别文字]" ? "" : text,
      status: "ready",
      warning: ""
    };
  } catch (error) {
    return {
      text: "",
      status: "failed",
      warning: error.name === "AbortError"
        ? `OCR 处理“${label}”超过 ${Math.round(OCR_TIMEOUT_MS / 1000)} 秒，已跳过该图片`
        : `OCR 处理“${label}”失败：${error.message}`
    };
  } finally {
    clearTimeout(timer);
  }
}
