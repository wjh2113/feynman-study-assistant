import { apiFetch } from "./client.js";

export function listIngestions(status = "waiting,active") {
  return apiFetch(`/api/ingestions?status=${encodeURIComponent(status)}`);
}

export function getIngestion(ingestionId) {
  return apiFetch(`/api/ingestions/${encodeURIComponent(ingestionId)}`);
}

export function retryIngestion(ingestionId) {
  return apiFetch(`/api/ingestions/${encodeURIComponent(ingestionId)}/retry`, { method: "POST" });
}

function parseAnalyzeResponse(status, text) {
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      error: status === 413
        ? "上传被拒绝：单个文件不超过 100 MB，一次最多 12 个文件；若仍失败请联系管理员检查服务器上传限制"
        : `分析接口返回了异常响应（HTTP ${status}）`
    };
  }
  if (status < 200 || status >= 300) {
    throw new Error(data.error || "分析失败");
  }
  return data;
}

export function analyzeBackground(formData, { onUploadProgress } = {}) {
  if (typeof XMLHttpRequest === "undefined") {
    return fetch("/api/analyze?background=true", { method: "POST", body: formData, credentials: "same-origin" })
      .then(async (response) => parseAnalyzeResponse(response.status, await response.text()));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/analyze?background=true");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!onUploadProgress) return;
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      try {
        resolve(parseAnalyzeResponse(xhr.status, xhr.responseText || ""));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("资料上传失败，请检查网络后重试"));
    xhr.onabort = () => reject(new Error("资料上传已取消"));
    xhr.send(formData);
  });
}
