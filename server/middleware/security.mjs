import IORedis from "ioredis";
import { getSessionUser } from "../auth.mjs";

export const cookieName = "zhifan_session";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000
};

const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
const developmentOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

const rateBuckets = new Map();
let redisClient;
const rateBucketCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 15 * 60_000);
rateBucketCleanupTimer.unref();

function redisEnabled() {
  return Boolean(process.env.REDIS_URL);
}

function getRedis() {
  if (!redisEnabled()) return null;
  if (!redisClient) {
    redisClient = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true
    });
    redisClient.on("error", () => {
      // Fall back to memory buckets when Redis is unavailable.
    });
  }
  return redisClient;
}

async function consumeMemoryBucket(key, windowMs, max) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

async function consumeRedisBucket(key, windowMs, max) {
  const redis = getRedis();
  if (!redis) return consumeMemoryBucket(key, windowMs, max);
  try {
    if (redis.status !== "ready") await redis.connect().catch(() => {});
    const redisKey = `zhifan:ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pexpire(redisKey, windowMs);
    if (count > max) {
      const ttlMs = await redis.pttl(redisKey);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)) };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    return consumeMemoryBucket(key, windowMs, max);
  }
}

export function rateLimit({ windowMs, max, keyPrefix }) {
  return async (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    const result = redisEnabled()
      ? await consumeRedisBucket(key, windowMs, max)
      : await consumeMemoryBucket(key, windowMs, max);
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfterSec || 1));
      return res.status(429).json({ error: "请求过于频繁，请稍后再试" });
    }
    next();
  };
}

export function verifyRequestOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") return res.status(403).json({ error: "缺少 Origin 请求头" });
    return next();
  }
  const normalized = origin.replace(/\/$/, "");
  const ownOrigin = `${req.protocol}://${req.get("host")}`;
  const isDevelopmentOrigin = process.env.NODE_ENV !== "production" && developmentOrigins.has(normalized);
  if (normalized === ownOrigin || allowedOrigins.has(normalized) || isDevelopmentOrigin) return next();
  return res.status(403).json({ error: "请求来源不被允许" });
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[cookieName];
  const user = token ? await getSessionUser(token) : null;
  if (!user) return res.status(401).json({ error: "请先登录" });
  req.userId = user.id;
  next();
}
