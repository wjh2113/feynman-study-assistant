import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { after, before, test } from "node:test";

const port = 20_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const ragProjectId = `rag-test-${port}`;
let server;
let serverError = "";
let uploadedSources = [];

async function waitForServer() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`测试服务器提前退出：${serverError || `exit ${server.exitCode}`}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("测试服务器未能按时启动");
}

before(async () => {
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DEEPSEEK_API_KEY: "",
      PGLITE_MEMORY: "true",
      DATA_DIR: `.data-test-${port}`
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });
  await waitForServer();
});

after(async () => {
  if (server && !server.killed) server.kill();
  await rm(`.data-test-${port}`, { recursive: true, force: true });
});

test("健康检查返回模型与演示模式状态", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.model, "deepseek-v4-pro");
  assert.equal(data.configured, false);
  assert.equal(data.database.mode, "pglite");
  assert.equal(data.embedding.provider, "local-hash");
});

test("项目数据会写入 PostgreSQL 并可重新读取", async () => {
  const project = {
    id: ragProjectId,
    title: "持久化测试项目",
    mode: "course",
    createdAt: Date.now(),
    progress: 8,
    analysis: { summary: "", highValue: [], modules: [], tacitKnowledge: [], scenarios: [], sources: [] },
    blindspots: [],
    sessions: [],
    onePager: null
  };
  const saved = await fetch(`${baseUrl}/api/projects/${ragProjectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  assert.equal(saved.status, 200);

  const response = await fetch(`${baseUrl}/api/projects`);
  const data = await response.json();
  assert.ok(data.projects.some((item) => item.id === ragProjectId && item.title === "持久化测试项目"));
});

test("TXT 与 Markdown 资料可上传并生成知识骨架", async () => {
  const body = new FormData();
  body.append(
    "files",
    new Blob(["反馈闭环需要把用户修改转化为可学习的信号。"], { type: "text/plain" }),
    "课堂笔记.txt"
  );
  body.append(
    "files",
    new Blob(["# 最小验证\n先验证最危险的假设，再增加投入。"], { type: "text/markdown" }),
    "个人笔记.md"
  );
  body.append("title", "AI 产品方法");
  body.append("mode", "course");
  body.append("projectId", ragProjectId);

  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.demo, true);
  assert.equal(data.sources.length, 2);
  uploadedSources = data.sources;
  assert.equal(data.sources[0].name, "课堂笔记.txt");
  assert.ok(data.sources[0].chunks >= 1);
  assert.match(data.sources[0].downloadUrl, /\/api\/documents\//);
  assert.ok(data.retrieval.chunks >= 2);
  assert.ok(data.modules.length >= 3);
  assert.ok(data.modules.flatMap((module) => module.concepts).length >= 5);
  assert.ok(data.questions.length >= 5);
  assert.match(data.questions[0].question, /解释|例子|什么情况下|如何|比较/);
  assert.ok(data.questions[0].concept);
});

test("原始资料会落盘并可通过受控接口重新下载", async () => {
  const response = await fetch(`${baseUrl}${uploadedSources[0].downloadUrl}`);
  const content = await response.text();
  assert.equal(response.status, 200, content);
  assert.match(content, /反馈闭环需要把用户修改转化为可学习的信号/);
});

test("混合检索会返回持久化资料的原文与页码", async () => {
  const response = await fetch(`${baseUrl}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: ragProjectId,
      query: "用户修改如何变成反馈信号？"
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.retrieval, "hybrid");
  assert.ok(data.sources.length >= 1);
  assert.match(data.sources.map((item) => item.quote).join(" "), /反馈|用户修改/);
  assert.ok(data.sources[0].documentId);
  assert.ok(data.sources[0].page >= 1);
});

test("不支持的文件格式返回明确错误", async () => {
  const body = new FormData();
  body.append("files", new Blob(["fake"], { type: "application/octet-stream" }), "资料.exe");
  body.append("title", "错误格式");
  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /暂不支持/);
});

test("费曼教练会针对黑话追问", async () => {
  const response = await fetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: {
        id: "q-data-loop",
        question: "请不用专业术语解释数据飞轮为什么会运转。",
        concept: "数据飞轮"
      },
      concept: { title: "数据飞轮" },
      answer: "它能赋能业务并形成闭环。",
      role: "child",
      turn: 1
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.demo, true);
  assert.match(data.reply, /赋能|闭环/);
  assert.ok(data.evaluation.clarity < 70);
});

test("费曼教练能识别例子并追问边界", async () => {
  const response = await fetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concept: { title: "能力边界" },
      answer: "比如客服机器人遇到退款争议时，需要交给人工确认。",
      role: "child",
      turn: 1
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.reply, /什么情况下/);
  assert.ok(data.evaluation.example >= 80);
});

test("空回答会被拒绝", async () => {
  const response = await fetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: "   " })
  });
  assert.equal(response.status, 400);
});

test("可以从项目数据生成一页纸", async () => {
  const response = await fetch(`${baseUrl}/api/one-pager`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: {
        title: "AI 产品方法",
        analysis: { summary: "先验证问题，再设计方案。", highValue: ["问题定义", "最小验证", "反馈闭环"] }
      }
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.title, "AI 产品方法");
  assert.equal(data.takeaways.length, 3);
  assert.equal(data.demo, true);
});
