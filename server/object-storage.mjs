import OSS from "ali-oss";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isStandaloneDeploy } from "./deploy-mode.mjs";

const REMOTE_PROVIDERS = new Set(["oss", "s3", "jdcloud"]);

function providerName() {
  return String(process.env.STORAGE_PROVIDER || "local").toLowerCase();
}

export function isRemoteObjectStorage(provider = providerName()) {
  return REMOTE_PROVIDERS.has(String(provider || "").toLowerCase());
}

function isS3Compatible(provider = providerName()) {
  return provider === "s3" || provider === "jdcloud";
}

function isAliyunOss(provider = providerName()) {
  return provider === "oss";
}

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`对象存储配置不完整：${missing.join(", ")}`);
}

function s3Bucket() {
  return process.env.S3_BUCKET || process.env.OSS_BUCKET || "";
}

function s3Endpoint() {
  if (process.env.S3_ENDPOINT) return process.env.S3_ENDPOINT;
  if (process.env.OSS_ENDPOINT) return process.env.OSS_ENDPOINT;
  const region = process.env.S3_REGION || process.env.OSS_REGION;
  if (providerName() === "jdcloud" && region) {
    return `https://s3.${region}.jdcloud-oss.com`;
  }
  return undefined;
}

function s3Credentials() {
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET
  };
}

let cachedS3Client;

function s3Client() {
  const region = process.env.S3_REGION || process.env.OSS_REGION;
  const bucket = s3Bucket();
  const { accessKeyId, secretAccessKey } = s3Credentials();
  const missing = [];
  if (!region) missing.push("S3_REGION 或 OSS_REGION");
  if (!bucket) missing.push("S3_BUCKET 或 OSS_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID 或 OSS_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_ACCESS_KEY_SECRET 或 OSS_ACCESS_KEY_SECRET");
  if (missing.length) throw new Error(`S3/京东云对象存储配置不完整：${missing.join(", ")}`);

  if (!cachedS3Client) {
    const endpoint = s3Endpoint();
    cachedS3Client = new S3Client({
      region,
      endpoint,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false",
      credentials: { accessKeyId, secretAccessKey }
    });
  }
  return cachedS3Client;
}

function aliyunOssClient() {
  requireEnv(["OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET"]);
  return new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT || undefined,
    secure: true
  });
}

function parseRemoteStoragePath(storagePath = "") {
  const value = String(storagePath || "");
  const match = value.match(/^(oss|s3):\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { scheme: match[1], bucket: match[2], key: match[3] };
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function remoteStoragePath(provider, key) {
  if (isAliyunOss(provider)) return `oss://${process.env.OSS_BUCKET}/${key}`;
  return `s3://${s3Bucket()}/${key}`;
}

export async function putObject({ key, buffer, localPath }) {
  const provider = providerName();
  if (isAliyunOss(provider)) {
    await aliyunOssClient().put(key, buffer);
    return { provider, key, storagePath: remoteStoragePath(provider, key) };
  }
  if (isS3Compatible(provider)) {
    await s3Client().send(new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: buffer
    }));
    return { provider: "s3", key, storagePath: remoteStoragePath(provider, key) };
  }
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  return { provider: "local", key, storagePath: localPath };
}

export async function getObject({ key, storagePath }) {
  const remote = parseRemoteStoragePath(storagePath);
  if (remote?.scheme === "oss" || (!remote && isAliyunOss())) {
    const objectKey = remote?.key || key;
    const result = await aliyunOssClient().get(objectKey);
    return result.content;
  }
  if (remote?.scheme === "s3" || (!remote && isS3Compatible())) {
    const objectKey = remote?.key || key;
    const result = await s3Client().send(new GetObjectCommand({
      Bucket: remote?.bucket || s3Bucket(),
      Key: objectKey
    }));
    return streamToBuffer(result.Body);
  }
  return readFile(storagePath);
}

export async function deleteObject({ key, storagePath }) {
  const remote = parseRemoteStoragePath(storagePath);
  if (remote?.scheme === "oss" || (!remote && isAliyunOss())) {
    await aliyunOssClient().delete(remote?.key || key);
    return;
  }
  if (remote?.scheme === "s3" || (!remote && isS3Compatible())) {
    await s3Client().send(new DeleteObjectCommand({
      Bucket: remote?.bucket || s3Bucket(),
      Key: remote?.key || key
    }));
    return;
  }
  try {
    await unlink(storagePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function objectStorageStatus() {
  const provider = providerName();
  if (isAliyunOss(provider)) {
    return { provider: "oss", bucket: process.env.OSS_BUCKET || "", endpoint: process.env.OSS_ENDPOINT || "" };
  }
  if (isS3Compatible(provider)) {
    return {
      provider: provider === "jdcloud" ? "jdcloud" : "s3",
      bucket: s3Bucket(),
      endpoint: s3Endpoint() || "",
      region: process.env.S3_REGION || process.env.OSS_REGION || ""
    };
  }
  return { provider: "local", bucket: "", endpoint: "" };
}

export function assertProductionObjectStorage() {
  if (process.env.NODE_ENV !== "production") return;
  if (isStandaloneDeploy()) return;
  const provider = providerName();
  if (!isRemoteObjectStorage(provider)) {
    throw new Error("云模式生产环境必须将 STORAGE_PROVIDER 设为 jdcloud、s3 或 oss；单机部署请设置 DEPLOY_MODE=standalone");
  }
  if (isAliyunOss(provider)) {
    requireEnv(["OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET"]);
    return;
  }
  const missing = [];
  if (!(process.env.S3_REGION || process.env.OSS_REGION)) missing.push("S3_REGION 或 OSS_REGION");
  if (!s3Bucket()) missing.push("S3_BUCKET 或 OSS_BUCKET");
  const { accessKeyId, secretAccessKey } = s3Credentials();
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID 或 OSS_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_ACCESS_KEY_SECRET 或 OSS_ACCESS_KEY_SECRET");
  if (provider === "jdcloud" && !s3Endpoint()) missing.push("S3_ENDPOINT（或配置地域以自动生成京东云 endpoint）");
  if (missing.length) throw new Error(`生产对象存储配置不完整：${missing.join(", ")}`);
}
