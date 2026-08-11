import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const port = 8799;
const dataDir = `.data-e2e-${port}`;
const baseUrl = `http://127.0.0.1:${port}`;
await rm(dataDir, { recursive: true, force: true });

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    DEPLOY_MODE: "standalone",
    STORAGE_PROVIDER: "local",
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://zhifan:zhifan_local_2026@127.0.0.1:5432/zhifan",
    DATABASE_SSL: "false",
    RAG_TEST_MODE: "true",
    DEEPSEEK_API_KEY: "",
    DATA_DIR: dataDir,
    REDIS_URL: "",
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || "e2e-test-encryption-key-32bytes-min!!"
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let serverLog = "";
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });

async function waitReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early: ${serverLog.slice(-800)}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not ready: ${serverLog.slice(-800)}`);
}

let cookie = "";
const results = [];
function log(step, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} | ${step}${detail ? ` | ${detail}` : ""}`);
  results.push({ step, ok, detail });
}
function extractCookie(response) {
  const setCookie = response.headers.getSetCookie?.() || [];
  const raw = setCookie.join("; ") || response.headers.get("set-cookie") || "";
  const match = raw.match(/zhifan_session=[^;]+/);
  return match ? match[0] : cookie;
}
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) };
  if (!(options.body instanceof FormData) && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const next = extractCookie(response);
  if (next) cookie = next;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  return { response, data };
}

try {
  await waitReady();
  if (!/postgresql \+ pgvector/i.test(serverLog)) {
    log("persistence mode", false, serverLog.match(/Persistence ready:.*/)?.[0] || "mode log missing");
  } else {
    log("persistence mode", true, "postgresql + pgvector");
  }

  const username = `e2e_pg_${Date.now().toString(36)}`;
  const password = "e2e_pass_123456";
  const projectId = `e2e-pg-${Date.now()}`;

  const health = await api("/api/health");
  log("health", health.response.ok, String(health.response.status));

  const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
  log("register", reg.response.ok, reg.data?.error || username);

  const me = await api("/api/auth/me");
  log("auth/me", me.response.ok && me.data?.user?.username === username, me.data?.user?.username || me.data?.error);

  const created = await api(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify({ title: "PG E2E", mode: "course", progress: 8, analysis: { sources: [] }, blindspots: [], sessions: [] })
  });
  log("create project", created.response.ok, created.data?.error || projectId);

  const form = new FormData();
  form.append("files", new Blob(["费曼学习法要求用自己的话解释概念，说不清就回去补。反馈闭环把修改转成学习信号。"], { type: "text/plain" }), "notes.txt");
  form.append("title", "PG E2E");
  form.append("mode", "course");
  form.append("projectId", projectId);
  const analyze = await api("/api/analyze", { method: "POST", body: form });
  log(
    "analyze upload",
    analyze.response.ok && analyze.data?.sources?.length >= 1,
    analyze.response.ok
      ? `chunks=${analyze.data.retrieval?.chunks} demo=${analyze.data.demo}`
      : (analyze.data?.error || String(analyze.response.status))
  );

  const listed = await api("/api/projects");
  log("list projects", listed.response.ok && listed.data?.projects?.some((p) => p.id === projectId), `count=${listed.data?.projects?.length || 0}`);

  const got = await api(`/api/projects/${projectId}`);
  log("get project", got.response.ok && (got.data?.project?.analysis?.sources || []).length >= 1, `sources=${(got.data?.project?.analysis?.sources || []).length}`);

  const prefs = await api("/api/settings/preferences", { method: "PUT", body: JSON.stringify({ coachMaxTurns: 3 }) });
  log("preferences", prefs.response.ok, prefs.data?.error || `coachMaxTurns=${prefs.data?.coachMaxTurns}`);

  const session = await api(`/api/projects/${projectId}/sessions`, { method: "POST", body: JSON.stringify({ title: "对练", status: "active" }) });
  const sessionId = session.data?.session?.id || session.data?.id;
  log("create session", session.response.ok && Boolean(sessionId), sessionId || session.data?.error || String(session.response.status));

  if (sessionId) {
    const coach = await api("/api/coach", {
      method: "POST",
      body: JSON.stringify({ projectId, sessionId, answer: "用自己的话解释概念，讲不清就回去补。" })
    });
    log(
      "coach turn",
      coach.response.ok,
      coach.response.ok
        ? `demo=${coach.data?.demo} score=${coach.data?.score ?? coach.data?.evaluation?.score}`
        : (coach.data?.error || String(coach.response.status))
    );
  }

  const rag = await api("/api/rag", { method: "POST", body: JSON.stringify({ projectId, query: "什么是费曼学习法？" }) });
  log(
    "rag ask",
    rag.response.ok,
    rag.response.ok
      ? `answerLen=${String(rag.data?.answer || "").length} demo=${rag.data?.demo}`
      : (rag.data?.error || String(rag.response.status))
  );

  // verify vectors actually landed in postgres
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://zhifan:zhifan_local_2026@127.0.0.1:5432/zhifan" });
  const vectors = await pool.query(
    "SELECT COUNT(*)::int AS n FROM document_chunks WHERE project_id=$1 AND embedding IS NOT NULL",
    [projectId]
  );
  log("pgvector rows", vectors.rows[0].n > 0, `embedding_rows=${vectors.rows[0].n}`);
  await pool.end();

  const failed = results.filter((r) => !r.ok);
  console.log("--- summary ---");
  console.log(`passed=${results.filter((r) => r.ok).length} failed=${failed.length}`);
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.step}: ${item.detail}`);
    process.exitCode = 1;
  }
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!server.killed && server.exitCode === null) server.kill("SIGKILL");
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
