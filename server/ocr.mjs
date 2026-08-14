import { recognizeWithBaidu } from "./baidu-ocr.mjs";
import { getVisionConfig } from "./model-config.mjs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 25_000);
const BAIDU_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/bmp"]);

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeMime(mimeType = "image/png") {
  const mime = String(mimeType || "image/png").toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

async function recognizeWithQwen(buffer, mimeType, label, config) {
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
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS)
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
}

export async function recognizeImage(buffer, mimeType = "image/png", label = "图片", userId) {
  const config = await getVisionConfig(userId);
  const configured = config.provider === "baidu"
    ? Boolean(config.apiKey && config.secretKey)
    : Boolean(config.apiKey);
  if (!configured) {
    return {
      text: "",
      status: "not_configured",
      warning: config.provider === "baidu"
        ? "未配置百度 OCR（需要 API Key 与 Secret Key），图片内容尚未识别"
        : "未配置 OCR 视觉模型，图片内容尚未识别"
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

  const mime = normalizeMime(mimeType);
  try {
    if (config.provider === "baidu") {
      if (!BAIDU_MIME.has(mime)) {
        return {
          text: "",
          status: "skipped",
          warning: `百度 OCR 暂不支持 ${mime || "该"} 格式（支持 png/jpg/bmp），已跳过“${label}”`
        };
      }
      const text = await recognizeWithBaidu({
        buffer,
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        languageType: config.languageType,
        timeoutMs: OCR_TIMEOUT_MS
      });
      return {
        text: normalizeOcrText(text),
        status: "ready",
        warning: ""
      };
    }

    return await recognizeWithQwen(buffer, mime, label, config);
  } catch (error) {
    return {
      text: "",
      status: "failed",
      warning: error.name === "TimeoutError" || error.name === "AbortError"
        ? `OCR 处理“${label}”超过 ${Math.round(OCR_TIMEOUT_MS / 1000)} 秒，已跳过该图片`
        : `OCR 处理“${label}”失败：${error.message}`
    };
  }
}
