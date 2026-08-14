/**
 * Seed a demo subject for the user manual screenshots.
 */
import "dotenv/config";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:8787";
const username = process.env.E2E_USER || "Jonny";
const password = process.env.E2E_PASS || "123456";
let cookie = "";

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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { response, data };
}

const login = await api("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username, password })
});
if (!login.response.ok) throw new Error(`login failed: ${JSON.stringify(login.data)}`);

const subjectId = `manual-demo-${Date.now()}`;
const created = await api(`/api/projects/${subjectId}`, {
  method: "PUT",
  body: JSON.stringify({
    id: subjectId,
    title: "日语入门（示例）",
    mode: "course",
    progress: 12,
    analysis: { sources: [], modules: [], questions: [] },
    blindspots: [],
    sessions: [],
    practiceDocumentIds: []
  })
});
if (!created.response.ok) throw new Error(`create failed: ${JSON.stringify(created.data)}`);

const form = new FormData();
const sampleText = [
  "助词「は」用来标示句子的主题。",
  "例如：私は学生です。意思是「我（作为主题）是学生」。",
  "敬语用于表示对对方的尊重，包括尊敬语和谦让语。",
  "学习建议：先掌握主题助词，再用自己的话向别人解释，并举一个生活例子。"
].join("\n");
form.append("files", new Blob([sampleText], { type: "text/plain" }), "n5-助词与敬语.txt");
form.append("title", "日语入门（示例）");
form.append("mode", "course");
form.append("projectId", subjectId);

console.log("uploading and analyzing...");
const analyzed = await api("/api/analyze", { method: "POST", body: form });
if (!analyzed.response.ok) throw new Error(`analyze failed: ${JSON.stringify(analyzed.data)}`);

const sources = analyzed.data?.sources || [];
const docId = sources[0]?.id;
if (docId) {
  await api(`/api/projects/${subjectId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...(analyzed.data?.projectId ? {} : {}),
      id: subjectId,
      title: "日语入门（示例）",
      mode: "course",
      practiceDocumentIds: [docId],
      analysis: {
        ...(created.data?.project?.analysis || {}),
        summary: analyzed.data?.summary,
        modules: analyzed.data?.modules,
        questions: analyzed.data?.questions,
        sources: analyzed.data?.sources,
        highValue: analyzed.data?.highValue
      },
      progress: 22,
      description: analyzed.data?.summary || "示例学科"
    })
  });
}

console.log(JSON.stringify({
  ok: true,
  cookie,
  subjectId,
  title: "日语入门（示例）",
  sources: sources.length,
  modules: (analyzed.data?.modules || []).length,
  questions: (analyzed.data?.questions || []).length
}, null, 2));
