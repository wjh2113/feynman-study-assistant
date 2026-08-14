import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { messageText } from "../server/services/voice.mjs";

const port = 21_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
let asrMock;
let mockUrl = "";
let sessionCookie = "";
let asrCalls = 0;
let asrImpl = null;

function makeWav(seconds = 1, sampleRate = 16_000) {
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2 * 32767;
    buf.writeInt16LE(sample | 0, 44 + i * 2);
  }
  return buf;
}

function extractCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/zhifan_session=[^;]+/);
  return match ? match[0] : "";
}

async function authFetch(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(options.headers || {})
    }
  });
}

test("messageText parses string and array ASR payloads", () => {
  assert.equal(
    messageText({ choices: [{ message: { content: " 你好世界 " } }] }),
    "你好世界"
  );
  assert.equal(
    messageText({
      choices: [{ message: { content: [{ text: "费曼" }, { text: "学习" }] } }]
    }),
    "费曼学习"
  );
  assert.equal(
    messageText({ choices: [{ message: { content: [{ transcript: "语音" }] } }] }),
    "语音"
  );
  assert.equal(messageText({ choices: [{ message: { content: "" } }] }), "");
});

before(async () => {
  asrMock = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    void Buffer.concat(chunks).toString("utf8");
    asrCalls += 1;
    if (asrImpl) {
      const result = await asrImpl();
      res.writeHead(result.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.json || {}));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "这是识别结果" } }]
    }));
  });
  await new Promise((resolve) => asrMock.listen(0, "127.0.0.1", resolve));
  mockUrl = `http://127.0.0.1:${asrMock.address().port}/compatible-mode/v1`;

  server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      VISION_PROVIDER: "qwen",
      VISION_API_KEY: "sk-test-voice",
      VISION_BASE_URL: mockUrl,
      DASHSCOPE_API_KEY: "",
      QWEN_API_KEY: "",
      DEEPSEEK_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let boot = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server boot timeout\n${boot}`)), 60_000);
    const onData = (buf) => {
      boot += buf.toString();
      if (/listening on/.test(boot)) {
        clearTimeout(timer);
        server.stdout.off("data", onData);
        server.stderr.off("data", onData);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early ${code}\n${boot}`));
    });
  });

  const username = `voice_${port}`;
  const register = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ username, password: "testpass" })
  });
  assert.equal(register.status, 200, await register.clone().text());
  sessionCookie = extractCookie(register);
  assert.ok(sessionCookie);

  const saveVision = await authFetch("/api/settings/vision", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "qwen",
      baseUrl: mockUrl,
      model: "qwen3-asr-flash",
      apiKey: "sk-test-voice"
    })
  });
  assert.equal(saveVision.status, 200, await saveVision.clone().text());
});

after(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (asrMock) {
    await new Promise((resolve) => asrMock.close(resolve));
  }
});

test("voice transcribe rejects empty upload", async () => {
  const form = new FormData();
  form.append("audio", new Blob([]), "empty.webm");
  const res = await authFetch("/api/voice/transcribe", { method: "POST", body: form });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /录制|语音/);
});

test("voice transcribe returns text from ASR", async () => {
  asrImpl = null;
  asrCalls = 0;
  const form = new FormData();
  form.append("audio", new Blob([makeWav()], { type: "audio/wav" }), "t.wav");
  form.append("purpose", "费曼对练解释");
  const res = await authFetch("/api/voice/transcribe", { method: "POST", body: form });
  const json = await res.json();
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.equal(json.raw, "这是识别结果");
  assert.equal(json.text, "这是识别结果");
  assert.ok(asrCalls >= 1);
});

test("voice transcribe surfaces ASR errors", async () => {
  asrImpl = async () => ({
    status: 400,
    json: { error: { message: "The audio is empty" } }
  });
  const form = new FormData();
  form.append("audio", new Blob([makeWav(0.3)], { type: "audio/wav" }), "t.wav");
  const res = await authFetch("/api/voice/transcribe", { method: "POST", body: form });
  const json = await res.json();
  assert.equal(res.status, 500);
  assert.match(json.error, /录音内容无效或过短|audio is empty|语音识别失败/i);
});

test("voice transcribe requires auth", async () => {
  const form = new FormData();
  form.append("audio", new Blob([makeWav()], { type: "audio/wav" }), "t.wav");
  const res = await fetch(`${baseUrl}/api/voice/transcribe`, {
    method: "POST",
    headers: { Origin: `http://127.0.0.1:${port}` },
    body: form
  });
  assert.equal(res.status, 401);
});
