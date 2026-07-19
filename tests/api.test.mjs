import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

const port = 20_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverError = "";

async function waitForServer() {
  const deadline = Date.now() + 90_000;
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
      DEEPSEEK_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });
  await waitForServer();
});

after(() => {
  if (server && !server.killed) server.kill();
});

test("健康检查返回模型与演示模式状态", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, {
    ok: true,
    model: "deepseek-v4-pro",
    configured: false
  });
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

  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.demo, true);
  assert.equal(data.sources.length, 2);
  assert.equal(data.sources[0].name, "课堂笔记.txt");
  assert.ok(data.modules.length >= 3);
  assert.ok(data.modules.flatMap((module) => module.concepts).length >= 5);
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
