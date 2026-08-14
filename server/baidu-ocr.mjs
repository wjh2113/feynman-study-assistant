const TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const OCR_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic";
const TOKEN_SKEW_MS = 60_000;

/** @type {Map<string, { token: string, expiresAt: number }>} */
const tokenCache = new Map();

function cacheKey(apiKey, secretKey) {
  return `${apiKey}::${secretKey}`;
}

export async function getBaiduAccessToken(apiKey, secretKey, { forceRefresh = false } = {}) {
  const key = cacheKey(apiKey, secretKey);
  const cached = tokenCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + TOKEN_SKEW_MS) {
    return cached.token;
  }
  const url = new URL(TOKEN_URL);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("client_secret", secretKey);
  const response = await fetch(url, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || JSON.stringify(payload).slice(0, 160);
    throw new Error(`百度 access_token 获取失败：${detail}`);
  }
  const expiresIn = Number(payload.expires_in || 2592000) * 1000;
  tokenCache.set(key, { token: payload.access_token, expiresAt: Date.now() + expiresIn });
  return payload.access_token;
}

export async function recognizeWithBaidu({
  buffer,
  apiKey,
  secretKey,
  languageType = "CHN_ENG",
  timeoutMs = 25_000
}) {
  const token = await getBaiduAccessToken(apiKey, secretKey);
  const image = buffer.toString("base64");
  const body = new URLSearchParams();
  body.set("image", image);
  body.set("language_type", languageType || "CHN_ENG");
  body.set("detect_direction", "true");
  body.set("paragraph", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OCR_URL}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.error_code) {
      // token 失效时清缓存再抛错，便于下次重试
      if (Number(payload.error_code) === 110 || Number(payload.error_code) === 111) {
        tokenCache.delete(cacheKey(apiKey, secretKey));
      }
      throw new Error(`百度 OCR 错误 ${payload.error_code}：${payload.error_msg || "识别失败"}`);
    }
    if (!response.ok) {
      throw new Error(`百度 OCR HTTP ${response.status}`);
    }
    const lines = Array.isArray(payload.words_result)
      ? payload.words_result.map((item) => String(item.words || "").trim()).filter(Boolean)
      : [];
    return lines.join("\n");
  } finally {
    clearTimeout(timer);
  }
}

export async function testBaiduOcrCredentials(apiKey, secretKey) {
  const token = await getBaiduAccessToken(apiKey, secretKey, { forceRefresh: true });
  return { ok: true, tokenPreview: `${token.slice(0, 8)}…` };
}
