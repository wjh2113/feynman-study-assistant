import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const prefix = "enc:v1:";

function encryptionKey() {
  const source = process.env.APP_ENCRYPTION_KEY || "";
  if (!source) return null;
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value) {
  const text = String(value || "");
  if (!text || text.startsWith(prefix)) return text;
  const key = encryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 APP_ENCRYPTION_KEY");
    return text;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value) {
  const text = String(value || "");
  if (!text.startsWith(prefix)) return text;
  const key = encryptionKey();
  if (!key) throw new Error("缺少 APP_ENCRYPTION_KEY，无法读取已加密配置");
  const [ivPart, tagPart, dataPart] = text.slice(prefix.length).split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function secretsEncryptionStatus() {
  return { configured: Boolean(encryptionKey()), algorithm: "AES-256-GCM" };
}
