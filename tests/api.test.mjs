import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import JSZip from "jszip";

const port = 20_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const ragProjectId = `rag-test-${port}`;
let server;
let visionMock;
let visionMockUrl;
let serverError = "";
let uploadedSources = [];
let sessionCookie = "";
let secondSessionCookie = "";

function cookieHeader() {
  return sessionCookie ? { Cookie: sessionCookie } : {};
}

async function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...cookieHeader(),
      ...(options.headers || {})
    }
  });
}

function extractCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/zhifan_session=[^;]+/);
  return match ? match[0] : "";
}

async function registerTestUser(username) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "testpass" })
  });
  assert.equal(response.status, 200, await response.clone().text());
  return extractCookie(response);
}

function createBlankPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 3 >>\nstream\nq\nQ\nendstream"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

async function createDocxWithScreenshot(png) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>课堂正文：以下截图记录访谈结论。</w:t></w:r></w:p><w:sectPr/></w:body>
    </w:document>`);
  zip.folder("word").folder("media").file("screenshot.png", png);
  return zip.generateAsync({ type: "nodebuffer" });
}

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
  visionMock = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/models") {
      response.end(JSON.stringify({ data: [{ id: "mock-vision" }] }));
      return;
    }
    if (request.url === "/chat/completions") {
      response.end(JSON.stringify({
        choices: [{ message: { content: "截图标题：用户访谈结论。关键发现：先验证最危险的假设。" } }]
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => visionMock.listen(0, "127.0.0.1", resolve));
  visionMockUrl = `http://127.0.0.1:${visionMock.address().port}`;

  server = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DEEPSEEK_API_KEY: "",
      RAG_TEST_MODE: "true",
      PGLITE_MEMORY: "true",
      DATA_DIR: `.data-test-${port}`,
      VISION_BASE_URL: visionMockUrl,
      VISION_API_KEY: "mock"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });
  await waitForServer();

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `tester-${port}`, password: "testpass" })
  });
  if (registerResponse.ok) {
    sessionCookie = extractCookie(registerResponse);
  } else {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `tester-${port}`, password: "testpass" })
    });
    assert.equal(loginResponse.status, 200, "测试用户登录失败");
    sessionCookie = extractCookie(loginResponse);
  }
  assert.ok(sessionCookie, "未能获取测试会话 cookie");
});

after(async () => {
  if (server && !server.killed) server.kill();
  if (visionMock) await new Promise((resolve) => visionMock.close(resolve));
  await rm(`.data-test-${port}`, { recursive: true, force: true });
});

test("健康检查返回模型与演示模式状态", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.model, "deepseek-v4-flash");
  assert.equal(data.configured, false);
  assert.equal(data.database.mode, "pglite");
  assert.equal(data.embedding.provider, "test");
  assert.equal(data.embedding.model, "BAAI/bge-m3");
  assert.equal(data.embedding.rerankerModel, "BAAI/bge-reranker-v2-m3");
});

test("未登录请求、跨站写请求和已移除的用户列表接口会被拒绝", async () => {
  const anonymous = await fetch(`${baseUrl}/api/projects`);
  assert.equal(anonymous.status, 401);

  const crossSite = await fetch(`${baseUrl}/api/projects/origin-check`, {
    method: "PUT",
    headers: {
      ...cookieHeader(),
      Origin: "https://attacker.example",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: "不应保存" })
  });
  assert.equal(crossSite.status, 403);

  const users = await authFetch(`${baseUrl}/api/users`);
  assert.equal(users.status, 404);
});

test("两个用户的项目、会话、文件和模型配置相互隔离", async () => {
  const projectId = `private-${port}`;
  const primaryProject = {
    id: projectId,
    title: "用户一的私有项目",
    mode: "course",
    createdAt: Date.now(),
    progress: 0,
    analysis: { sources: [], modules: [], questions: [] },
    blindspots: [],
    sessions: [],
    onePager: null
  };
  const saved = await authFetch(`${baseUrl}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(primaryProject)
  });
  assert.equal(saved.status, 200);

  const session = await authFetch(`${baseUrl}/api/projects/${projectId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept: "私有概念", question: "请解释" })
  });
  assert.equal(session.status, 200, await session.clone().text());
  const sessionId = (await session.json()).session.id;

  secondSessionCookie = await registerTestUser(`other-${port}`);
  const asSecond = (url, options = {}) => fetch(url, {
    ...options,
    headers: { Cookie: secondSessionCookie, ...(options.headers || {}) }
  });

  assert.equal((await asSecond(`${baseUrl}/api/projects/${projectId}`)).status, 404);
  assert.equal((await asSecond(`${baseUrl}/api/projects/${projectId}/sessions`)).status, 200);
  const hiddenSessions = await asSecond(`${baseUrl}/api/projects/${projectId}/sessions`).then((response) => response.json());
  assert.deepEqual(hiddenSessions.sessions, []);

  const createForeignSession = await asSecond(`${baseUrl}/api/projects/${projectId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept: "越权", question: "越权" })
  });
  assert.equal(createForeignSession.status, 404);

  const overwrite = await asSecond(`${baseUrl}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...primaryProject, title: "被篡改" })
  });
  assert.equal(overwrite.status, 400);

  const updateSession = await asSecond(`${baseUrl}/api/projects/${projectId}/sessions/${sessionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 100 })
  });
  assert.equal(updateSession.status, 404);

  const stillOwned = await authFetch(`${baseUrl}/api/projects/${projectId}`).then((response) => response.json());
  assert.equal(stillOwned.project.title, "用户一的私有项目");

  const secondConfig = await asSecond(`${baseUrl}/api/settings/model`).then((response) => response.json());
  assert.equal(secondConfig.configured, false);
});

test("模型配置接口不会向前端返回明文密钥", async () => {
  const response = await authFetch(`${baseUrl}/api/settings/model`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.provider, "DeepSeek");
  assert.equal(data.model, "deepseek-v4-flash");
  assert.equal(data.configured, false);
  assert.equal("apiKey" in data, false);

  const visionResponse = await authFetch(`${baseUrl}/api/settings/vision`);
  assert.equal(visionResponse.status, 200);
  const vision = await visionResponse.json();
  assert.equal(vision.provider, "阿里云百炼 Qwen OCR");
  assert.ok(
    vision.baseUrl === "https://dashscope.aliyuncs.com/compatible-mode/v1" || vision.baseUrl === visionMockUrl,
    `vision.baseUrl 应该是默认值或 mock 地址，实际为 ${vision.baseUrl}`
  );
  assert.equal(vision.model, "qwen3.5-ocr");
  assert.equal(vision.configured, true);
  assert.equal("apiKey" in vision, false);

  const testResponse = await authFetch(`${baseUrl}/api/settings/model/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(testResponse.status, 400);
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
  const saved = await authFetch(`${baseUrl}/api/projects/${ragProjectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  assert.equal(saved.status, 200);

  const response = await authFetch(`${baseUrl}/api/projects`);
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

  const response = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.demo, true);
  assert.equal(data.sources.length, 2);
  uploadedSources = data.sources;
  assert.equal(data.sources[0].name, "课堂笔记.txt");
  assert.ok(data.sources[0].chunks >= 1);
  assert.match(data.sources[0].summary.summary, /反馈闭环|用户修改/);
  assert.match(data.sources[0].parsedPreview, /反馈闭环/);
  assert.equal(data.sources[0].parseReport.nativeCharacters > 0, true);
  assert.match(data.sources[0].downloadUrl, /\/api\/documents\//);
  assert.ok(data.retrieval.chunks >= 2);
  assert.ok(data.modules.length >= 3);
  assert.ok(data.modules.flatMap((module) => module.concepts).length >= 5);
  assert.ok(data.questions.length >= 5);
  assert.match(data.questions[0].question, /解释|例子|什么情况下|如何|比较/);
  assert.ok(data.questions[0].concept);
});

test("资料上传可创建后台解析任务并在完成后返回分析结果", async () => {
  const projectId = `background-analysis-${port}`;
  const created = await authFetch(`${baseUrl}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "后台解析测试",
      mode: "course",
      progress: 8,
      analysis: { sources: [] },
      blindspots: [],
      sessions: []
    })
  });
  assert.equal(created.status, 200);

  const body = new FormData();
  body.append("files", new Blob(["后台任务应该完成解析、索引与项目更新。"], { type: "text/plain" }), "后台资料.txt");
  body.append("title", "后台解析测试");
  body.append("mode", "course");
  body.append("projectId", projectId);
  const queued = await authFetch(`${baseUrl}/api/analyze?background=true`, { method: "POST", body });
  assert.equal(queued.status, 202, await queued.clone().text());
  const queuedData = await queued.json();
  assert.ok(queuedData.task?.id);

  let task;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await authFetch(`${baseUrl}/api/tasks/${queuedData.task.id}`);
    assert.equal(response.status, 200);
    task = (await response.json()).task;
    if (task.status === "completed" || task.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(task?.status, "completed", task?.error);
  assert.equal(task.result.projectId, projectId);
  assert.equal(task.result.analysis.sources[0].name, "后台资料.txt");
  assert.ok(task.result.analysis.retrieval.chunks >= 1);
});

test("后台解析失败后保留任务记录并允许从失败阶段重试", async () => {
  const projectId = `background-retry-${port}`;
  await authFetch(`${baseUrl}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "后台重试测试", mode: "course", progress: 8, analysis: { sources: [] } })
  });
  const body = new FormData();
  body.append("files", new Blob(["unsupported"], { type: "application/octet-stream" }), "失败资料.csv");
  body.append("projectId", projectId);
  const queued = await authFetch(`${baseUrl}/api/analyze?background=true`, { method: "POST", body });
  assert.equal(queued.status, 202);
  const queuedData = await queued.json();
  let ingestion;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await authFetch(`${baseUrl}/api/ingestions/${queuedData.ingestionId}`);
    ingestion = (await status.json()).ingestion;
    if (ingestion.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ingestion.status, "failed");
  assert.equal(ingestion.stage, "ocr");
  const retried = await authFetch(`${baseUrl}/api/ingestions/${queuedData.ingestionId}/retry`, { method: "POST" });
  assert.equal(retried.status, 202, await retried.clone().text());
  const retryData = await retried.json();
  assert.equal(retryData.ingestionId, queuedData.ingestionId);
  assert.equal(retryData.resumedFrom, "ocr");
});

test("图片资料会调用视觉模型 OCR，并把识别结果写入总结和检索分块", async () => {
  const savedVision = await authFetch(`${baseUrl}/api/settings/vision`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: visionMockUrl,
      model: "mock-vision",
      apiKey: "vision-test-secret"
    })
  });
  assert.equal(savedVision.status, 200);
  const publicConfig = await savedVision.json();
  assert.equal(publicConfig.configured, true);
  assert.equal(JSON.stringify(publicConfig).includes("vision-test-secret"), false);

  const connection = await authFetch(`${baseUrl}/api/settings/vision/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(connection.status, 200);
  assert.equal((await connection.json()).modelAvailable, true);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlS8AAAAASUVORK5CYII=",
    "base64"
  );
  const body = new FormData();
  body.append("files", new Blob([png], { type: "image/png" }), "课堂截图.png");
  body.append("title", "截图 OCR 测试");
  body.append("projectId", `ocr-test-${port}`);
  const response = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].parseReport.ocrStatus, "ready");
  assert.equal(data.sources[0].parseReport.imagesOcrd, 1);
  assert.match(data.sources[0].parsedPreview, /用户访谈结论/);
  assert.match(data.sources[0].summary.summary, /用户访谈结论/);
  assert.ok(data.sources[0].chunks >= 1);

  const pdfBody = new FormData();
  pdfBody.append("files", new Blob([createBlankPdf()], { type: "application/pdf" }), "扫描讲义.pdf");
  pdfBody.append("title", "PDF OCR 测试");
  pdfBody.append("projectId", `pdf-ocr-test-${port}`);
  const pdfResponse = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body: pdfBody });
  assert.equal(pdfResponse.status, 200, await pdfResponse.clone().text());
  const pdfData = await pdfResponse.json();
  assert.equal(pdfData.sources[0].parseReport.ocrStatus, "ready");
  assert.equal(pdfData.sources[0].parseReport.imagesOcrd, 1);
  assert.match(pdfData.sources[0].parsedPreview, /最危险的假设/);

  const docxBody = new FormData();
  docxBody.append(
    "files",
    new Blob([await createDocxWithScreenshot(png)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    "含截图课堂笔记.docx"
  );
  docxBody.append("title", "DOCX 截图 OCR 测试");
  docxBody.append("projectId", `docx-ocr-test-${port}`);
  const docxResponse = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body: docxBody });
  assert.equal(docxResponse.status, 200, await docxResponse.clone().text());
  const docxData = await docxResponse.json();
  assert.equal(docxData.sources[0].parseReport.imagesFound, 1);
  assert.equal(docxData.sources[0].parseReport.imagesOcrd, 1);
  assert.match(docxData.sources[0].parsedPreview, /课堂正文/);
  assert.match(docxData.sources[0].parsedPreview, /用户访谈结论/);

  const cleared = await authFetch(`${baseUrl}/api/settings/vision`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clearApiKey: true })
  });
  assert.equal(cleared.status, 200);
});

test("原始资料会落盘并可通过受控接口重新下载", async () => {
  const response = await authFetch(`${baseUrl}${uploadedSources[0].downloadUrl}`);
  const content = await response.text();
  assert.equal(response.status, 200, content);
  assert.match(content, /反馈闭环需要把用户修改转化为可学习的信号/);
});

test("已有资料可以重建为 BGE-M3 层级索引", async () => {
  const response = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/reindex`, {
    method: "POST"
  });
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.equal(data.documents, uploadedSources.length);
  assert.ok(data.chunks >= uploadedSources.length);
  assert.ok(data.parents >= uploadedSources.length);
  assert.equal(data.project.analysis.retrieval.embedding.model, "BAAI/bge-m3");
  assert.equal(data.project.analysis.retrieval.embedding.rerankerModel, "BAAI/bge-reranker-v2-m3");
  assert.match(data.project.analysis.retrieval.strategy, /Reranker/);
});

test("RAG 会保留 20 个候选再精排到 5 个", async () => {
  const projectId = `candidate-pool-${port}`;
  const sections = Array.from({ length: 24 }, (_, index) => (
    `# 候选章节 ${index + 1}\n召回池验证。${`这是第${index + 1}章用于验证二十路候选召回与精排流程的资料内容。`.repeat(28)}`
  )).join("\n\n");
  const body = new FormData();
  body.append("files", new Blob([sections], { type: "text/markdown" }), "候选池测试.md");
  body.append("title", "候选池测试");
  body.append("projectId", projectId);
  const uploaded = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(uploaded.status, 200, await uploaded.clone().text());

  const response = await authFetch(`${baseUrl}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, query: "召回池验证的精排流程是什么？" })
  });
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  assert.equal(data.debug.candidateCount, 20);
  assert.equal(data.debug.candidates.length, 20);
  assert.equal(data.sources.length, 5);
});

test("混合检索会返回持久化资料的原文与页码", async () => {
  const response = await authFetch(`${baseUrl}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: ragProjectId,
      query: "用户修改如何变成反馈信号？"
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.retrieval, "bge-m3-hybrid-rerank");
  assert.ok(data.sources.length >= 1);
  assert.match(data.sources.map((item) => item.quote).join(" "), /反馈|用户修改/);
  assert.ok(data.sources[0].documentId);
  assert.ok(data.sources[0].page >= 1);
  assert.ok(data.debug.candidateCount >= 1);
  assert.ok(data.debug.candidates[0].content);
});

test("相关度低于阈值时明确拒绝回答并保留调试候选", async () => {
  const response = await authFetch(`${baseUrl}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: ragProjectId,
      query: "量子色动力学中的渐近自由如何证明？"
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.insufficient, true);
  assert.match(data.answer, /资料中没有找到/);
  assert.equal(data.sources.length, 0);
  assert.ok(data.debug.candidates.length >= 1);
});

test("删除资料会同步清理原始文件、项目记录和向量分块", async () => {
  const target = uploadedSources[0];
  const response = await authFetch(
    `${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/documents/${encodeURIComponent(target.id)}`,
    { method: "DELETE" }
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.deleted.id, target.id);
  assert.equal(data.project.analysis.sources.some((item) => item.id === target.id), false);
  assert.equal(
    data.project.analysis.retrieval.chunks,
    uploadedSources.reduce((total, item) => total + item.chunks, 0) - target.chunks
  );

  const originalFile = await authFetch(`${baseUrl}${target.downloadUrl}`);
  assert.equal(originalFile.status, 404);

  const ragResponse = await authFetch(`${baseUrl}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: ragProjectId,
      query: "反馈闭环和用户修改"
    })
  });
  assert.equal(ragResponse.status, 200);
  const rag = await ragResponse.json();
  assert.equal(rag.sources.some((item) => item.documentId === target.id), false);
});

test("不支持的文件格式返回明确错误", async () => {
  const body = new FormData();
  body.append("files", new Blob(["fake"], { type: "application/octet-stream" }), "资料.exe");
  body.append("title", "错误格式");
  const response = await authFetch(`${baseUrl}/api/analyze`, { method: "POST", body });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /暂不支持/);
});

test("费曼教练会针对黑话追问", async () => {
  const response = await authFetch(`${baseUrl}/api/coach`, {
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

test("费曼教练会话可创建、追加并读取", async () => {
  const create = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conceptId: "c1",
      concept: "数据飞轮",
      questionId: "q-data-loop",
      question: "请不用专业术语解释数据飞轮为什么会运转。"
    })
  });
  assert.equal(create.status, 200, await create.clone().text());
  const { session } = await create.json();
  assert.ok(session.id);
  assert.equal(session.messages.length, 1);

  const coach = await authFetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: ragProjectId,
      sessionId: session.id,
      question: { id: "q-data-loop", question: "请不用专业术语解释数据飞轮为什么会运转。", concept: "数据飞轮" },
      concept: { title: "数据飞轮" },
      answer: "它能赋能业务并形成闭环。",
      role: "child",
      turn: 1
    })
  });
  assert.equal(coach.status, 200);

  const list = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/sessions`);
  assert.equal(list.status, 200);
  const { sessions } = await list.json();
  const found = sessions.find((item) => item.id === session.id);
  assert.ok(found);
  assert.equal(found.messages.length, 3);
  assert.equal(found.messages[1].from, "user");
  assert.equal(found.evaluations.length, 1);
});

test("盲区可生成变式复测题", async () => {
  const project = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}`).then((r) => r.json());
  const blindspot = {
    id: `blind-${port}`,
    title: "数据飞轮的失效条件",
    concept: "数据飞轮",
    problem: "只解释了生效情况，没说明什么时候会失效。",
    action: "给出一个数据飞轮无法运转的反例。",
    source: "测试",
    status: "review"
  };
  const patched = {
    ...project.project,
    blindspots: [blindspot]
  };
  const save = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patched)
  });
  assert.equal(save.status, 200);

  const response = await authFetch(
    `${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/blindspots/${encodeURIComponent(blindspot.id)}/variant-question`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.question.question);
  assert.equal(data.question.isVariant, true);
  assert.match(data.question.question, /数据飞轮|失效|反例/);
});

test("RAG 问答历史可保存并读取", async () => {
  const save = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/rag-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "用户修改如何变成反馈信号？",
      answer: "根据资料，用户修改是高价值反馈。",
      sources: [{ id: "src-1", filename: "课堂笔记.txt", page: 1, quote: "反馈闭环" }],
      debug: { candidateCount: 1, threshold: 0.35 },
      insufficient: false,
      demo: true
    })
  });
  assert.equal(save.status, 200);
  const { record } = await save.json();
  assert.equal(record.query, "用户修改如何变成反馈信号？");

  const list = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/rag-history`);
  assert.equal(list.status, 200);
  const { records } = await list.json();
  assert.ok(records.some((item) => item.id === record.id));
});

test("费曼教练能识别例子并追问边界", async () => {
  const response = await authFetch(`${baseUrl}/api/coach`, {
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

test("费曼教练在第三个问题回答后结束本轮且不再追问", async () => {
  const response = await authFetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concept: { title: "能力边界" },
      answer: "这个方法依赖数据质量，数据不足时应该改由人工判断。",
      role: "expert",
      turn: 3
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.completed, true);
  assert.doesNotMatch(data.reply, /[？?]\s*$/);
  assert.match(data.reply, /三问已完成|结束本轮/);
});

test("空回答会被拒绝", async () => {
  const response = await authFetch(`${baseUrl}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: "   " })
  });
  assert.equal(response.status, 400);
});

test("可以从项目数据生成一页纸", async () => {
  const response = await authFetch(`${baseUrl}/api/one-pager`, {
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
  assert.match(data.outline.title, /AI 产品方法/);
  assert.ok(data.outline.sections.length >= 3);
  assert.ok(data.outline.sections.every((section) => section.title && section.purpose));
  assert.equal(data.demo, true);
});

test("API Key 可持久化、脱敏显示并清除", async () => {
  const saveResponse = await authFetch(`${baseUrl}/api/settings/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      apiKey: "sk-test-secret-12345678"
    })
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.configured, true);
  assert.match(saved.apiKeyMasked, /^sk-t.*5678$/);
  assert.equal(JSON.stringify(saved).includes("sk-test-secret-12345678"), false);

  const clearResponse = await authFetch(`${baseUrl}/api/settings/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clearApiKey: true })
  });
  assert.equal(clearResponse.status, 200);
  assert.equal((await clearResponse.json()).configured, false);
});

test("检索设置返回脱敏 Key，且 Reranker 可共用 Embedding Key", async () => {
  const saveResponse = await authFetch(`${baseUrl}/api/settings/embedding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embedding: {
        provider: "remote",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "text-embedding-v3",
        dimensions: 1024,
        apiKey: "sk-embedding-secret-1234"
      },
      reranker: {
        provider: "remote",
        baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
        model: "qwen3-vl-rerank",
        apiKey: "sk-reranker-secret-5678"
      }
    })
  });
  assert.equal(saveResponse.status, 200, await saveResponse.clone().text());
  const saved = await saveResponse.json();
  assert.match(saved.embedding.apiKeyMasked, /^sk-e.*1234$/);
  assert.match(saved.reranker.apiKeyMasked, /^sk-r.*5678$/);
  assert.equal(JSON.stringify(saved).includes("sk-embedding-secret-1234"), false);
  assert.equal(JSON.stringify(saved).includes("sk-reranker-secret-5678"), false);

  const shareResponse = await authFetch(`${baseUrl}/api/settings/embedding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embedding: {
        provider: "remote",
        baseUrl: saved.embedding.baseUrl,
        model: saved.embedding.model,
        dimensions: saved.embedding.dimensions
      },
      reranker: {
        provider: "remote",
        baseUrl: saved.reranker.baseUrl,
        model: saved.reranker.model,
        clearApiKey: true
      }
    })
  });
  assert.equal(shareResponse.status, 200, await shareResponse.clone().text());
  const shared = await shareResponse.json();
  assert.equal(shared.reranker.apiKeyMasked, shared.embedding.apiKeyMasked);
});

test("商业化基础接口支持提醒、导出、沙箱支付和运行指标", async () => {
  const reminderResponse = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conceptId: "c1", mastery: 2, lastReviewedAt: Date.now() })
  });
  assert.equal(reminderResponse.status, 201, await reminderResponse.clone().text());
  const reminders = await authFetch(`${baseUrl}/api/reminders`).then((response) => response.json());
  assert.ok(reminders.reminders.some((item) => item.project_id === ragProjectId));

  const exported = await authFetch(`${baseUrl}/api/projects/${encodeURIComponent(ragProjectId)}/export?format=zip`);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type"), /application\/zip/);
  assert.ok((await exported.arrayBuffer()).byteLength > 100);

  const plansResponse = await authFetch(`${baseUrl}/api/billing/plans`).then((response) => response.json());
  assert.ok(plansResponse.plans.some((plan) => plan.id === "pro_monthly" && plan.amountFen === 3900));
  const orderResponse = await authFetch(`${baseUrl}/api/billing/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: "pro_monthly", provider: "sandbox" })
  });
  assert.equal(orderResponse.status, 201, await orderResponse.clone().text());
  const { order } = await orderResponse.json();
  const complete = await authFetch(`${baseUrl}/api/payments/sandbox/${order.id}/complete`, { method: "POST" });
  assert.equal(complete.status, 200, await complete.clone().text());
  const subscriptions = await authFetch(`${baseUrl}/api/billing/subscriptions`).then((response) => response.json());
  assert.ok(subscriptions.subscriptions.some((item) => item.order_id === order.id && item.status === "active"));

  const metrics = await authFetch(`${baseUrl}/api/diagnostics/metrics`).then((response) => response.json());
  assert.ok(Array.isArray(metrics.metrics));
});

test("邮箱密码重置令牌一次有效并使旧密码失效", async () => {
  const username = `reset-${port}`;
  const email = `reset-${port}@example.test`;
  const register = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password: "old-password" })
  });
  assert.equal(register.status, 200, await register.clone().text());
  const forgot = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const forgotData = await forgot.json();
  assert.equal(forgot.status, 200);
  assert.ok(forgotData.developmentToken);
  const reset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: forgotData.developmentToken, password: "new-password" })
  });
  assert.equal(reset.status, 200, await reset.clone().text());
  const reuse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: forgotData.developmentToken, password: "another-password" })
  });
  assert.equal(reuse.status, 400);
  const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "old-password" })
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "new-password" })
  });
  assert.equal(newLogin.status, 200);
});
