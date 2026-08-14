const base = "http://127.0.0.1:8787";
const origin = "http://127.0.0.1:5173";

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ username: "Jonny", password: "123456" })
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const hdr = { Cookie: cookie, Origin: origin, "Content-Type": "application/json" };

const projects = await (await fetch(`${base}/api/projects`, { headers: hdr })).json();
const projectId = (projects.projects || projects)[0].id;
const detail = await (await fetch(`${base}/api/projects/${projectId}`, { headers: hdr })).json();
const project = detail.project || detail;
const concept = project.analysis?.modules?.[0]?.concepts?.[0];
const question = (project.analysis?.questions || [])[0] || {
  id: "q-test",
  conceptId: concept?.id,
  concept: concept?.title,
  question: `请用人话解释${concept?.title || "这个概念"}`
};
const docs = (project.analysis?.sources || []).map((s) => s.id).filter(Boolean).slice(0, 1);

const created = await (
  await fetch(`${base}/api/projects/${projectId}/sessions`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      documentIds: docs,
      conceptId: concept?.id,
      concept: concept?.title,
      questionId: question.id,
      question: question.question
    })
  })
).json();
const sessionId = created.session?.id;

const coach = await fetch(`${base}/api/coach`, {
  method: "POST",
  headers: hdr,
  body: JSON.stringify({
    projectId,
    sessionId,
    documentIds: docs,
    question,
    concept,
    answer: "平假名来自草书，片假名来自楷书偏旁。平假名圆润用于固有词，片假名方正用于外来语。",
    role: "expert",
    turn: 5
  })
});
const body = await coach.json();
console.log("status", coach.status, "completed", body.completed, "maxTurns", body.maxTurns, "hasDiagnosis", Boolean(body.diagnosis));
if (body.error) console.log("error", body.error);
if (body.diagnosis) {
  console.log(JSON.stringify({
    summary: body.diagnosis.summary,
    weak: (body.diagnosis.weakAspects || []).map((w) => `${w.label}:${w.score ?? "?"}`),
    userProblem: String(body.diagnosis.userProblem || "").slice(0, 100),
    userAnswer: String(body.diagnosis.userAnswer || "").slice(0, 100),
    expert: String(body.diagnosis.expertFraming || "").slice(0, 120),
    gaps: body.diagnosis.knowledgeGaps,
    master: (body.diagnosis.knowledgeToMaster || []).map((i) => i.title)
  }, null, 2));
}

const diag = await fetch(`${base}/api/coach/diagnosis`, {
  method: "POST",
  headers: hdr,
  body: JSON.stringify({ projectId, sessionId, question, concept, documentIds: docs })
});
const diagBody = await diag.json();
console.log("diagnosis endpoint", diag.status, "cached", diagBody.cached, "has", Boolean(diagBody.diagnosis));
