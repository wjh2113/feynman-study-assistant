import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = "http://127.0.0.1:8787";
const username = `e2e_${Date.now().toString(36)}`;
const password = "e2e_pass_123456";
const projectId = `e2e-project-${Date.now()}`;
const results = [];
let cookie = "";

function log(step, ok, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"} | ${step}${detail ? ` | ${detail}` : ""}`;
  results.push({ step, ok, detail });
  console.log(line);
}

function extractCookie(response) {
  const setCookie = response.headers.getSetCookie?.() || [];
  const raw = setCookie.join("; ") || response.headers.get("set-cookie") || "";
  const match = raw.match(/zhifan_session=[^;]+/);
  return match ? match[0] : cookie;
}

async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(cookie ? { Cookie: cookie } : {})
  };
  if (!(options.body instanceof FormData) && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const nextCookie = extractCookie(response);
  if (nextCookie) cookie = nextCookie;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  return { response, data, text };
}

async function main() {
  // 1 health
  {
    const { response } = await api("/api/health");
    log("health", response.ok, `HTTP ${response.status}`);
  }

  // 2 register
  {
    const { response, data } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email: `${username}@example.com` })
    });
    log("register", response.ok && Boolean(data?.id), response.ok ? username : data?.error || response.status);
  }

  // 3 me
  {
    const { response, data } = await api("/api/auth/me");
    log("auth/me", response.ok && data?.user?.username === username, data?.user?.username || data?.error);
  }

  // 4 create project shell
  {
    const { response, data } = await api(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "E2E 费曼项目",
        mode: "course",
        progress: 8,
        analysis: { sources: [] },
        blindspots: [],
        sessions: []
      })
    });
    log("create project", response.ok, data?.error || projectId);
  }

  // 5 upload + analyze TXT
  {
    const body = new FormData();
    body.append(
      "files",
      new Blob([
        "费曼学习法强调用自己的话解释概念。若无法解释清楚，说明理解还不扎实。反馈闭环能把用户修改转成可学习信号。"
      ], { type: "text/plain" }),
      "e2e-notes.txt"
    );
    body.append("title", "E2E 费曼项目");
    body.append("mode", "course");
    body.append("projectId", projectId);
    const { response, data } = await api("/api/analyze", { method: "POST", body });
    const ok = response.ok && Array.isArray(data?.sources) && data.sources.length >= 1;
    log(
      "analyze upload",
      ok,
      ok
        ? `sources=${data.sources.length} chunks=${data.retrieval?.chunks} demo=${data.demo} modules=${data.modules?.length}`
        : (data?.error || `HTTP ${response.status}`)
    );
  }

  // 6 list projects / get project
  {
    const listed = await api("/api/projects");
    const found = listed.data?.projects?.some((p) => p.id === projectId);
    log("list projects", listed.response.ok && found, `count=${listed.data?.projects?.length || 0}`);

    const got = await api(`/api/projects/${projectId}`);
    const sources = got.data?.project?.analysis?.sources || [];
    log("get project", got.response.ok && sources.length >= 1, `sources=${sources.length}`);
  }

  // 7 preferences
  {
    const get = await api("/api/settings/preferences");
    log("get preferences", get.response.ok, get.data?.error || "ok");
    const put = await api("/api/settings/preferences", {
      method: "PUT",
      body: JSON.stringify({ ...(get.data || {}), coachMaxTurns: 4 })
    });
    log("put preferences", put.response.ok && put.data?.coachMaxTurns === 4, put.data?.error || `coachMaxTurns=${put.data?.coachMaxTurns}`);
  }

  // 8 model settings read
  {
    const { response, data } = await api("/api/settings/model");
    log("get model settings", response.ok, data?.configured === false ? "demo/no-key" : `configured=${data?.configured}`);
  }

  // 9 create coach session + ask
  {
    const session = await api(`/api/projects/${projectId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ title: "E2E 对练", status: "active" })
    });
    const sessionId = session.data?.session?.id || session.data?.id;
    log("create session", session.response.ok && Boolean(sessionId), sessionId || session.data?.error || `HTTP ${session.response.status}`);

    if (sessionId) {
      const coach = await api("/api/coach", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          sessionId,
          answer: "费曼学习法就是用通俗语言把概念讲出来，讲不清就回去补。"
        })
      });
      // In demo mode without API key, coach may still return structured demo or error — record either.
      log(
        "coach turn",
        coach.response.ok,
        coach.response.ok
          ? `score=${coach.data?.score ?? coach.data?.evaluation?.score} demo=${coach.data?.demo}`
          : (coach.data?.error || `HTTP ${coach.response.status}`)
      );
    }
  }

  // 10 RAG
  {
    const rag = await api("/api/rag", {
      method: "POST",
      body: JSON.stringify({ projectId, question: "什么是费曼学习法？" })
    });
    log(
      "rag ask",
      rag.response.ok,
      rag.response.ok
        ? `answerLen=${String(rag.data?.answer || "").length} demo=${rag.data?.demo}`
        : (rag.data?.error || `HTTP ${rag.response.status}`)
    );
  }

  // 11 logout + login
  {
    const out = await api("/api/auth/logout", { method: "POST", body: "{}" });
    log("logout", out.response.ok, out.data?.error || "ok");
    cookie = "";
    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    log("login again", login.response.ok && Boolean(cookie), login.data?.error || username);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- summary ---");
  console.log(`passed=${results.filter((r) => r.ok).length} failed=${failed.length}`);
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.step}: ${item.detail}`);
    process.exitCode = 1;
  }

  writeFileSync(join(tmpdir(), "zhifan-e2e-result.json"), JSON.stringify({ username, projectId, results }, null, 2));
}

main().catch((error) => {
  console.error("E2E crashed:", error);
  process.exitCode = 1;
});
