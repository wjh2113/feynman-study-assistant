/**
 * Live smoke test against the running API (Jonny account).
 * Usage: node scripts/smoke-all.mjs
 */
import "dotenv/config";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787";
const ORIGIN = process.env.SMOKE_ORIGIN || "http://127.0.0.1:5173";
const USER = process.env.SMOKE_USER || "Jonny";
const PASS = process.env.SMOKE_PASS || "123456";

const results = [];
let cookie = "";
let projectId = "";

function ok(name, detail = "") {
  results.push({ name, pass: true, detail: String(detail).slice(0, 180) });
  console.log(`PASS  ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, pass: false, detail: String(detail).slice(0, 400) });
  console.error(`FAIL  ${name} — ${String(detail).slice(0, 200)}`);
}

async function api(path, options = {}) {
  const headers = {
    Origin: ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { res, json, text };
}

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) {
    const hit = raw.find((c) => c.startsWith("zhifan_session="));
    if (hit) return hit.split(";")[0];
  }
  const legacy = res.headers.get("set-cookie") || "";
  const m = legacy.match(/zhifan_session=[^;]+/);
  return m ? m[0] : "";
}

async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    fail(name, error?.stack || error?.message || error);
  }
}

await step("health", async () => {
  const { res, json } = await api("/api/health");
  if (res.status !== 200 || !json?.ok) throw new Error(JSON.stringify(json));
  ok("health", `db=${json.database?.mode || "?"} model=${json.model || "?"}`);
});

await step("login", async () => {
  const { res, json } = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS })
  });
  cookie = extractCookie(res);
  if (res.status !== 200 || !cookie) throw new Error(JSON.stringify(json));
  ok("login", `user=${json.username || USER}`);
});

await step("auth/me", async () => {
  const { res, json } = await api("/api/auth/me");
  if (res.status !== 200 || !json?.user?.id) throw new Error(JSON.stringify(json));
  ok("auth/me", json.user.username);
});

await step("projects list", async () => {
  const { res, json } = await api("/api/projects");
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  const list = json.projects || json || [];
  if (!Array.isArray(list) || !list.length) throw new Error("no projects");
  projectId = list[0].id;
  ok("projects list", `${list.length} projects, active=${projectId}`);
});

await step("project detail", async () => {
  const { res, json } = await api(`/api/projects/${projectId}`);
  const project = json?.project || json;
  if (res.status !== 200 || !project?.id) throw new Error(JSON.stringify(json));
  ok("project detail", `${project.title || project.name || project.id} docs=${project.documentCount ?? project.analysis?.sources?.length ?? "?"}`);
});

await step("chapters", async () => {
  const { res, json } = await api(`/api/projects/${projectId}/chapters`);
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("chapters", `count=${(json.chapters || []).length}`);
});

await step("sessions", async () => {
  const { res, json } = await api(`/api/projects/${projectId}/sessions`);
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("sessions", `count=${(json.sessions || []).length}`);
});

await step("reminders", async () => {
  const { res, json } = await api("/api/reminders");
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("reminders", `count=${(json.reminders || []).length}`);
});

await step("rag history", async () => {
  const { res, json } = await api(`/api/projects/${projectId}/rag-history`);
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("rag history", `count=${(json.records || []).length}`);
});

await step("rag ask", async () => {
  const { res, json } = await api("/api/rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, query: "五十音图一共有多少个假名？" })
  });
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  const answer = String(json.answer || "");
  if (!answer.trim()) throw new Error("empty answer");
  ok("rag ask", answer.slice(0, 80));
});

await step("coach turn", async () => {
  const { res, json } = await api("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      answer: "五十音图按行和段排列，平假名和片假名各有对应字符。",
      concept: "行段结构与假名总数"
    })
  });
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("coach turn", `score=${json.score ?? json.feedback?.score ?? "?"} hasReply=${Boolean(json.reply || json.followUp || json.feedback)}`);
});

await step("learning-plan", async () => {
  const { res, json } = await api("/api/learning-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "日语冒烟测试",
      goal: "工作应用",
      level: "刚刚入门",
      summary: "以五十音图为核心的日语基础"
    })
  });
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("learning-plan", `phases=${(json.phases || json.plan?.phases || []).length || "?"}`);
});

await step("one-pager", async () => {
  const { json: detail } = await api(`/api/projects/${projectId}`);
  const project = detail?.project || detail;
  const { res, json } = await api("/api/one-pager", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project })
  });
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  if (!json?.title && !json?.thesis && !json?.outline) throw new Error(JSON.stringify(json));
  ok("one-pager", String(json.title || json.thesis || "ok").slice(0, 80));
});

await step("settings model/vision/embedding/preferences", async () => {
  for (const path of [
    "/api/settings/model",
    "/api/settings/vision",
    "/api/settings/embedding",
    "/api/settings/preferences"
  ]) {
    const { res, json } = await api(path);
    if (res.status !== 200) throw new Error(`${path} ${JSON.stringify(json)}`);
  }
  ok("settings reads", "model/vision/embedding/preferences");
});

await step("billing plans", async () => {
  const { res, json } = await api("/api/billing/plans");
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("billing plans", `count=${(json.plans || []).length}`);
});

await step("ingestions list", async () => {
  const { res, json } = await api("/api/ingestions");
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("ingestions", `count=${(json.ingestions || json || []).length}`);
});

await step("voice transcribe", async () => {
  // tiny wav
  const sampleRate = 16000;
  const samples = sampleRate;
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
    buf.writeInt16LE((Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2 * 32767) | 0, 44 + i * 2);
  }
  const form = new FormData();
  form.append("audio", new Blob([buf], { type: "audio/wav" }), "t.wav");
  form.append("purpose", "smoke");
  const { res, json } = await api("/api/voice/transcribe", { method: "POST", body: form });
  if (res.status !== 200 || !json?.text) throw new Error(JSON.stringify(json));
  ok("voice transcribe", json.text);
});

await step("export project", async () => {
  const { res, json } = await api(`/api/projects/${projectId}/export`);
  if (res.status !== 200) throw new Error(JSON.stringify(json));
  ok("export project", typeof json === "object" ? "json ok" : "ok");
});

await step("document file download (if any)", async () => {
  const { json: project } = await api(`/api/projects/${projectId}`);
  const sources = project?.analysis?.sources || [];
  const withFile = sources.find((s) => s.id || s.documentId);
  if (!withFile) {
    ok("document file", "skipped (no source id)");
    return;
  }
  const docId = withFile.documentId || withFile.id;
  const { res } = await api(`/api/documents/${docId}/file`);
  if (![200, 302, 404].includes(res.status)) throw new Error(`status ${res.status}`);
  ok("document file", `status=${res.status} id=${docId}`);
});

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log("\n========== SMOKE SUMMARY ==========");
console.log(`passed ${passed}/${results.length}`);
if (failed.length) {
  console.log("failures:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exitCode = 1;
} else {
  console.log("all smoke checks passed");
}
