/**
 * Runtime helpers for web vs Capacitor Android / offline mode.
 */

export const PRODUCTION_ORIGIN = "https://study.aidigitcloud.cn";

export function isNativeApp() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Absolute API origin for native builds; empty string keeps relative URLs on web. */
export function apiOrigin() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (isNativeApp()) return PRODUCTION_ORIGIN;
  return "";
}

export function resolveApiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = apiOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}

export function isLikelyOfflineError(error) {
  const message = String(error?.message || error || "");
  return (
    typeof navigator !== "undefined" && navigator.onLine === false
  ) || /Failed to fetch|NetworkError|Load failed|网络|offline|ERR_INTERNET/i.test(message);
}
