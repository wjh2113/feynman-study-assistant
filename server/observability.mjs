import { randomUUID } from "node:crypto";

const metrics = new Map();

export function requestContext(req, res, next) {
  const requestId = req.get("X-Request-Id") || randomUUID();
  const started = Date.now();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);
  res.on("finish", () => {
    const route = req.route?.path || req.path;
    const key = `${req.method} ${route} ${res.statusCode}`;
    const current = metrics.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
    const durationMs = Date.now() - started;
    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    metrics.set(key, current);
    if (durationMs > Number(process.env.SLOW_REQUEST_MS || 5000)) {
      console.warn(JSON.stringify({ level: "warn", event: "slow_request", requestId, method: req.method, path: req.path, status: res.statusCode, durationMs }));
    }
  });
  next();
}

export function metricsSnapshot() {
  return [...metrics.entries()].map(([route, value]) => ({ route, ...value, avgMs: Math.round(value.totalMs / value.count) }));
}

export function logError(error, context = {}) {
  console.error(JSON.stringify({ level: "error", event: "request_error", message: error?.message, ...context }));
}
