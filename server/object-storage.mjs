import OSS from "ali-oss";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function ossEnabled() {
  return String(process.env.STORAGE_PROVIDER || "local").toLowerCase() === "oss";
}

function ossClient() {
  const required = ["OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`OSS 配置不完整：${missing.join(", ")}`);
  return new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT || undefined,
    secure: true
  });
}

export async function putObject({ key, buffer, localPath }) {
  if (ossEnabled()) {
    await ossClient().put(key, buffer);
    return { provider: "oss", key, storagePath: `oss://${process.env.OSS_BUCKET}/${key}` };
  }
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  return { provider: "local", key, storagePath: localPath };
}

export async function getObject({ key, storagePath }) {
  if (String(storagePath || "").startsWith("oss://") || ossEnabled()) {
    const result = await ossClient().get(key);
    return result.content;
  }
  return readFile(storagePath);
}

export async function deleteObject({ key, storagePath }) {
  if (String(storagePath || "").startsWith("oss://") || ossEnabled()) {
    await ossClient().delete(key);
    return;
  }
  try { await unlink(storagePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export function objectStorageStatus() {
  return { provider: ossEnabled() ? "oss" : "local", bucket: ossEnabled() ? process.env.OSS_BUCKET || "" : "" };
}
