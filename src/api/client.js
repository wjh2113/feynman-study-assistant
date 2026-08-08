export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 60_000, label = "请求") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `${label}返回了无法识别的内容` }; }
    if (!response.ok) throw new Error(data.error || `${label}失败（HTTP ${response.status}）`);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${label}超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待。请检查模型服务后重试。`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || "响应无法解析" }; }
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}
