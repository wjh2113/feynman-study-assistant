import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pythonHome = path.join(rootDir, ".tools", "python311");
const pythonExecutable = path.join(pythonHome, "python.exe");
const serviceScript = path.join(rootDir, "model_service", "app.py");
let serviceProcess;

export async function ensureLocalRetrievalService() {
  if (process.env.RAG_TEST_MODE === "true" || process.env.BGE_AUTO_START === "false") return null;
  if (serviceProcess && serviceProcess.exitCode == null) return serviceProcess;
  try {
    await access(pythonExecutable);
    await access(serviceScript);
  } catch {
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

