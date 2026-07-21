import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveEmbeddingConfig } from "./model-config.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pythonHome = path.join(rootDir, ".tools", "python311");
const pythonExecutable = path.join(pythonHome, "python.exe");
const serviceScript = path.join(rootDir, "model_service", "app.py");
let serviceProcess;

function isLocalUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.includes("127.0.0.1") || lower.includes("localhost") || lower.startsWith("http://0.0.0.0");
}

export async function ensureLocalRetrievalService() {
  if (process.env.RAG_TEST_MODE === "true" || process.env.BGE_AUTO_START === "false") return null;

  const config = resolveEmbeddingConfig({});
  if (config.provider === "remote" || !isLocalUrl(config.baseUrl)) {
    console.log("[retrieval] 使用云端 Embedding 服务，跳过本地 BGE 自动启动");
    return null;
  }

  if (serviceProcess && serviceProcess.exitCode == null) return serviceProcess;
  try {
    await access(pythonExecutable);
    await access(serviceScript);
  } catch {
    console.log("[retrieval] 未找到本地 Python 环境或模型服务脚本，跳过自动启动");
    return null;
  }

  serviceProcess = spawn(pythonExecutable, [serviceScript], {
    cwd: rootDir,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONHOME: pythonHome,
      HF_HOME: process.env.HF_HOME || path.join(rootDir, ".data", "models"),
      BGE_PORT: process.env.BGE_PORT || "8001",
      CUDA_VISIBLE_DEVICES: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serviceProcess.stdout.on("data", (chunk) => console.log(chunk.toString().trim()));
  serviceProcess.stderr.on("data", (chunk) => console.error(chunk.toString().trim()));
  serviceProcess.on("exit", () => { serviceProcess = null; });
  return serviceProcess;
}

export function stopLocalRetrievalService() {
  if (serviceProcess && serviceProcess.exitCode == null) {
    serviceProcess.kill();
    serviceProcess = null;
  }
}
