/**
 * End-to-end smoke for Feynman coach diagnosis.
 * Usage: node scripts/smoke-coach-diagnosis.mjs
 */
import "dotenv/config";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:8787";
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:5173";
const user = process.env.SMOKE_USER || "Jonny";
const password = process.env.SMOKE_PASS || "123456";

const results = [];
function ok(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${String(detail).slice(0, 140)}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name} — ${String(detail).slice(0, 240)}`);
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const headers = { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { res, json };
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) {
    const hit = raw.find((c) => c.startsWith("zhifan_session="));
    if (hit) return hit.split(";")[0];
  }
  const legacy = res.headers.get("set-cookie") || "";
  const m = legacy.match(/zhifan_session=[^;]+/);
  return m ? m[0] : "";
}

function assertDiagnosisShape(diagnosis, label) {
  if (!diagnosis || typeof diagnosis !== "object") throw new Error(`${label}: missing diagnosis`);
  for (const key of ["summary", "userProblem", "userAnswer", "expertFraming"]) {
    if (!String(diagnosis[key] || "").trim()) throw new Error(`${label}: empty ${key}`);
  }
  if (!Array.isArray(diagnosis.weakAspects)) throw new Error(`${label}: weakAspects not array`);
  if (!Array.isArray(diagnosis.knowledgeGaps) || !diagnosis.knowledgeGaps.length) {
    throw new Error(`${label}: knowledgeGaps empty`);
  }
  if (!Array.isArray(diagnosis.knowledgeToMaster) || !diagnosis.knowledgeToMaster.length) {
    throw new Error(`${label}: knowledgeToMaster empty`);
  }
  if (!diagnosis.knowledgeToMaster.every((item) => item?.title)) {
    throw new Error(`${label}: knowledgeToMaster missing title`);
  }
}

let cookie = "";
let projectId = "";
let project = null;
let concept = null;
let question = null;
let docs = [];

try {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { username: user, password }
  });
  cookie = cookieFrom(login.res);
  if (login.res.status !== 200 || !cookie) throw new Error(`login failed ${JSON.stringify(login.json)}`);
  ok("login", user);

  const projects = await api("/api/projects", { cookie });
  const list = projects.json.projects || projects.json || [];
  projectId = list[0]?.id;
  if (!projectId) throw new Error("no project");
  ok("project", projectId);

  const detail = await api(`/api/projects/${projectId}`, { cookie });
  project = detail.json.project || detail.json;
  concept = project.analysis?.modules?.[0]?.concepts?.[0];
  question = (project.analysis?.questions || [])[0] || {
    id: "q-test",
    conceptId: concept?.id,
    concept: concept?.title,
    question: `请用人话解释${concept?.title || "这个概念"}`
  };
  docs = (project.analysis?.sources || []).map((s) => s.id).filter(Boolean).slice(0, 1);
  if (!concept || !question?.question) throw new Error("missing concept/question");
  ok("concept/question", concept.title);

  // Path A: early finish — diagnosis via /api/coach/diagnosis after one mid turn
  const early = await api(`/api/projects/${projectId}/sessions`, {
    method: "POST",
    cookie,
    body: {
      documentIds: docs,
      conceptId: concept.id,
      concept: concept.title,
      questionId: `${question.id}-early`,
      question: question.question,
      meta: { maxTurns: 5, practiceDocumentIds: docs }
    }
  });
  const earlySessionId = early.json.session?.id;
  if (!earlySessionId) throw new Error(`create early session ${JSON.stringify(early.json)}`);

  const mid = await api("/api/coach", {
    method: "POST",
    cookie,
    body: {
      projectId,
      sessionId: earlySessionId,
      documentIds: docs,
      question,
      concept,
      answer: "我只知道大概有五十个假名，具体为什么是45还不清楚。",
      role: "child",
      turn: 1
    }
  });
  if (mid.res.status !== 200) throw new Error(`mid turn ${JSON.stringify(mid.json)}`);
  if (mid.json.completed) throw new Error("mid turn should not complete");
  if (mid.json.diagnosis) throw new Error("mid turn should not include diagnosis");
  ok("mid turn", `completed=${mid.json.completed} diagnosis=${Boolean(mid.json.diagnosis)}`);

  const earlyDiag = await api("/api/coach/diagnosis", {
    method: "POST",
    cookie,
    body: {
      projectId,
      sessionId: earlySessionId,
      question,
      concept,
      documentIds: docs
    }
  });
  if (earlyDiag.res.status !== 200) throw new Error(`early diagnosis ${JSON.stringify(earlyDiag.json)}`);
  assertDiagnosisShape(earlyDiag.json.diagnosis, "early");
  ok("early diagnosis endpoint", earlyDiag.json.diagnosis.summary);

  // Path B: final turn auto-diagnosis
  const finalCreated = await api(`/api/projects/${projectId}/sessions`, {
    method: "POST",
    cookie,
    body: {
      documentIds: docs,
      conceptId: concept.id,
      concept: concept.title,
      questionId: `${question.id}-final`,
      question: question.question,
      meta: { maxTurns: 5, practiceDocumentIds: docs }
    }
  });
  const finalSessionId = finalCreated.json.session?.id;
  if (!finalSessionId) throw new Error(`create final session ${JSON.stringify(finalCreated.json)}`);

  const coach = await api("/api/coach", {
    method: "POST",
    cookie,
    body: {
      projectId,
      sessionId: finalSessionId,
      documentIds: docs,
      question,
      concept,
      answer: "平假名来自草书，片假名来自楷书偏旁。平假名圆润用于固有词，片假名方正用于外来语。",
      role: "expert",
      turn: 5
    }
  });
  if (coach.res.status !== 200) throw new Error(`final coach ${JSON.stringify(coach.json)}`);
  if (!coach.json.completed) throw new Error(`expected completed, got maxTurns=${coach.json.maxTurns}`);
  assertDiagnosisShape(coach.json.diagnosis, "final");
  ok(
    "final turn diagnosis",
    `weak=${(coach.json.diagnosis.weakAspects || []).map((w) => w.label).join(",")}`
  );

  const cached = await api("/api/coach/diagnosis", {
    method: "POST",
    cookie,
    body: {
      projectId,
      sessionId: finalSessionId,
      question,
      concept,
      documentIds: docs
    }
  });
  if (cached.res.status !== 200 || !cached.json.cached) {
    throw new Error(`expected cached diagnosis ${JSON.stringify(cached.json)}`);
  }
  ok("diagnosis cache", "cached=true");

  const sessions = await api(`/api/projects/${projectId}/sessions?documentIds=${encodeURIComponent(docs[0] || "")}`, {
    cookie
  });
  const saved = (sessions.json.sessions || []).find((item) => item.id === finalSessionId);
  if (!saved?.meta?.diagnosis?.summary) {
    throw new Error("session meta.diagnosis not persisted");
  }
  assertDiagnosisShape(saved.meta.diagnosis, "persisted");
  ok("session meta persistence", saved.meta.diagnosis.summary);

  // Finish/save path should keep diagnosis
  const finish = await api(`/api/projects/${projectId}/sessions/${finalSessionId}`, {
    method: "PUT",
    cookie,
    body: {
      score: 40,
      status: "needs_review",
      meta: {
        maxTurns: 5,
        practiceDocumentIds: docs,
        diagnosis: coach.json.diagnosis
      }
    }
  });
  if (finish.res.status !== 200 || !finish.json.session?.meta?.diagnosis?.summary) {
    throw new Error(`finish save ${JSON.stringify(finish.json)}`);
  }
  ok("finish save keeps diagnosis", finish.json.session.status);
} catch (error) {
  fail("suite", error?.stack || error?.message || error);
}

const failed = results.filter((r) => !r.ok);
console.log("\n========== DIAGNOSIS SMOKE ==========");
console.log(`passed ${results.filter((r) => r.ok).length}/${results.length}`);
if (failed.length) {
  for (const item of failed) console.log(` - ${item.name}: ${item.detail}`);
  process.exitCode = 1;
} else {
  console.log("all diagnosis checks passed");
}
