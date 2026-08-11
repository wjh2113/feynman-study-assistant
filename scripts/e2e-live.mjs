/**
 * Live E2E against running API (uses DB-backed user settings).
 * Usage: node scripts/e2e-live.mjs
 */
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:8787";
const username = process.env.E2E_USER || "Jonny";
const password = process.env.E2E_PASS || "123456";
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

async function main() {
  const health = await api("/api/health");
  log("health", health.response.ok, String(health.response.status));

  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  log("login", login.response.ok, login.data?.error || username);

  const me = await api("/api/auth/me");
  log("auth/me", me.response.ok && me.data?.user?.username === username, me.data?.user?.username || me.data?.error);

  const model = await api("/api/settings/model");
  log("model settings", model.response.ok, `configured=${model.data?.configured} model=${model.data?.model || "-"}`);

  const vision = await api("/api/settings/vision");
  log("vision settings", vision.response.ok, `configured=${vision.data?.configured}`);

  const embedding = await api("/api/settings/embedding").catch(() => null);
  if (embedding) {
    log(
      "embedding settings",
      embedding.response.ok,
      embedding.response.ok
        ? `embedding=${embedding.data?.embedding?.configured} reranker=${embedding.data?.reranker?.configured}`
        : (embedding.data?.error || String(embedding.response.status))
    );
  }

  const prefs = await api("/api/settings/preferences");
  log("preferences", prefs.response.ok, prefs.data?.error || `coachMaxTurns=${prefs.data?.coachMaxTurns}`);

  const listed = await api("/api/projects");
  const projects = listed.data?.projects || [];
  log("list projects", listed.response.ok && projects.length > 0, projects.map((p) => p.title).join(" / ") || "empty");

  const project = projects.find((p) => p.title === "日语") || projects[0];
  if (!project) {
    log("pick project", false, "no project");
  } else {
    const got = await api(`/api/projects/${project.id}`);
    const sources = got.data?.project?.analysis?.sources || [];
    log("get project", got.response.ok, `${project.title} sources=${sources.length}`);

    const sessions = await api(`/api/projects/${project.id}/sessions`);
    log("list sessions", sessions.response.ok, `count=${(sessions.data?.sessions || []).length}`);

    // upload a small note into existing project (sync analyze)
    const form = new FormData();
    form.append(
      "files",
      new Blob(["日语助词は表示主题。费曼学习法要求用自己的话解释概念。"], { type: "text/plain" }),
      `e2e-live-${Date.now()}.txt`
    );
    form.append("title", project.title);
    form.append("mode", project.mode || "course");
    form.append("projectId", project.id);
    const analyze = await api("/api/analyze", { method: "POST", body: form });
    log(
      "analyze upload",
      analyze.response.ok,
      analyze.response.ok
        ? `sources=${analyze.data?.sources?.length} chunks=${analyze.data?.retrieval?.chunks} demo=${analyze.data?.demo}`
        : (analyze.data?.error || String(analyze.response.status)).slice(0, 180)
    );

    const session = await api(`/api/projects/${project.id}/sessions`, {
      method: "POST",
      body: JSON.stringify({ title: "E2E live 对练", status: "active" })
    });
    const sessionId = session.data?.session?.id || session.data?.id;
    log("create session", session.response.ok && Boolean(sessionId), sessionId || session.data?.error || String(session.response.status));

    if (sessionId) {
      const coach = await api("/api/coach", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          sessionId,
          answer: "は用来标主题，用自己的话解释就是先点出话题再展开。"
        })
      });
      log(
        "coach turn",
        coach.response.ok,
        coach.response.ok
          ? `demo=${coach.data?.demo} replyLen=${String(coach.data?.reply || "").length}`
          : (coach.data?.error || String(coach.response.status)).slice(0, 180)
      );
    }

    const rag = await api("/api/rag", {
      method: "POST",
      body: JSON.stringify({ projectId: project.id, query: "助词は是什么意思？" })
    });
    log(
      "rag ask",
      rag.response.ok,
      rag.response.ok
        ? `demo=${rag.data?.demo} answerLen=${String(rag.data?.answer || "").length}`
        : (rag.data?.error || String(rag.response.status)).slice(0, 180)
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("--- summary ---");
  console.log(`passed=${results.filter((r) => r.ok).length} failed=${failed.length}`);
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.step}: ${item.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("E2E crashed:", error);
  process.exitCode = 1;
});
