import React, { useEffect, useMemo, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { NoAnalysis } from "../../components/NoAnalysis.jsx";
import { VoiceInputButton } from "../../components/VoiceInputButton.jsx";
import {
  Check,
  CircleAlert,
  FileText,
  GraduationCap,
  Lightbulb,
  RotateCcw,
  Send,
  Sparkles
} from "../../components/icons.jsx";
import { askCoach } from "../../api/coach.js";
import { createSession, listSessions, updateSession } from "../../api/projects.js";
import { getPreferences } from "../../api/settings.js";
import { questionsForProject } from "../../lib/questions.js";
import { ScoreBar } from "./ScoreBar.jsx";

function readStoredConcept() {
  try {
    return JSON.parse(sessionStorage.getItem("zhifan-selected-concept"));
  } catch {
    return null;
  }
}

function resolveInitialQuestion(baseQuestions, stored) {
  if (stored?.question && typeof stored.question === "object" && stored.question.question) {
    return {
      ...stored.question,
      isVariant: Boolean(stored.isVariant || stored.question.isVariant),
      blindspotId: stored.blindspotId || stored.question.blindspotId,
      why: stored.question.why || (stored.blindspotTitle ? `针对盲区：${stored.blindspotTitle}` : stored.question.why)
    };
  }
  if (typeof stored?.question === "string" && stored.isVariant) {
    return {
      id: `q-variant-${Date.now()}`,
      question: stored.question,
      conceptId: stored.id || "",
      concept: stored.title || stored.concept || "",
      isVariant: true,
      blindspotId: stored.blindspotId,
      why: stored.blindspotTitle ? `针对盲区：${stored.blindspotTitle}` : "变式复测"
    };
  }
  return (
    baseQuestions.find((item) => item.id === stored?.questionId) ||
    baseQuestions.find((item) => item.conceptId === stored?.id || item.concept === stored?.title) ||
    baseQuestions[0]
  );
}

export function Coach({ project, selectedDocumentIds = [], updateProject, showToast, navigate }) {
  const concepts = (project.analysis?.modules || []).flatMap((module) => module.concepts || []);
  const baseQuestions = questionsForProject(project, { documentIds: selectedDocumentIds });
  const stored = useMemo(() => readStoredConcept(), []);
  const bootQuestion = useMemo(() => resolveInitialQuestion(baseQuestions, stored), [baseQuestions, stored]);
  const selectionKey = selectedDocumentIds.join(",");

  const [questionList] = useState(() => {
    if (!bootQuestion) return baseQuestions;
    if (baseQuestions.some((item) => item.id === bootQuestion.id)) return baseQuestions;
    return [bootQuestion, ...baseQuestions];
  });
  const [question, setQuestion] = useState(bootQuestion);
  const concept =
    concepts.find((item) => item.id === question?.conceptId || item.title === question?.concept) ||
    concepts[0];
  const isVariant = Boolean(question?.isVariant || stored?.isVariant);
  const blindspotId = question?.blindspotId || stored?.blindspotId || null;
  const blindspotTitle = stored?.blindspotTitle || "";
  const projectBlindspots = project.blindspots || [];

  const [prefs, setPrefs] = useState({
    coachMaxTurns: 3,
    coachPassScore: 75,
    coachRoleMode: "auto",
    coachShowEvidence: true
  });
  const [role, setRole] = useState("child");
  const [answer, setAnswer] = useState("");
  const [turn, setTurn] = useState(1);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationNotes, setEvaluationNotes] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [latestBlindspot, setLatestBlindspot] = useState(null);
  const [messages, setMessages] = useState(() => [
    { from: "ai", text: bootQuestion?.question || "请先上传资料，让AI根据资料生成问题。" }
  ]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionsCache, setSessionsCache] = useState(null);

  const maxTurns = prefs.coachMaxTurns || 3;
  const roleLocked = prefs.coachRoleMode === "auto";

  useEffect(() => {
    getPreferences()
      .then((data) => setPrefs((current) => ({ ...current, ...data })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDocumentIds.length) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await listSessions(project.id, { documentIds: selectedDocumentIds });
        if (cancelled) return;
        setSessionsCache(data.sessions || []);
        const existing = (data.sessions || []).find((item) =>
          item.questionId === bootQuestion?.id &&
          item.conceptId === concept?.id &&
          !item.status
        );
        if (existing) {
          const userTurns = existing.messages.filter((m) => m.from === "user").length || 0;
          const sessionMax = Number(existing.meta?.maxTurns) || maxTurns;
          setSessionId(existing.id);
          setMessages(existing.messages.length ? existing.messages : [{ from: "ai", text: bootQuestion?.question }]);
          setTurn(userTurns + 1);
          setCompleted(userTurns >= sessionMax || Boolean(existing.status));
          setEvaluation(existing.evaluations.at(-1) || null);
          setRole(userTurns + 1 >= Math.max(2, sessionMax - 1) ? "expert" : "child");
        } else {
          const createdData = await createSession(project.id, {
            documentIds: selectedDocumentIds,
            conceptId: concept?.id,
            concept: concept?.title,
            questionId: bootQuestion?.id,
            question: bootQuestion?.question,
            meta: {
              maxTurns,
              isVariant,
              blindspotId,
              blindspotTitle,
              practiceDocumentIds: selectedDocumentIds
            }
          });
          if (!cancelled) {
            setSessionId(createdData.session.id);
            setSessionsCache((items) => [createdData.session, ...(items || [])]);
          }
        }
      } catch (error) {
        if (!cancelled) showToast(`会话加载失败：${error.message}`);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [project.id, selectionKey, bootQuestion?.id, showToast]);

  useEffect(() => {
    sessionStorage.removeItem("zhifan-selected-concept");
  }, []);

  if (!selectedDocumentIds.length) return <EmptyMini text="请先在上方勾选要练习的资料" />;
  if (!question || !concept) return <NoAnalysis navigate={navigate} />;

  const syncSessionCache = (sessionPatch) => {
    if (!sessionPatch?.id) return;
    setSessionsCache((items) => {
      const list = items || [];
      const index = list.findIndex((item) => item.id === sessionPatch.id);
      if (index < 0) return [sessionPatch, ...list];
      const next = [...list];
      next[index] = { ...next[index], ...sessionPatch };
      return next;
    });
  };

  const changeQuestion = async (event) => {
    const next = questionList.find((item) => item.id === event.target.value);
    if (!next) return;
    setQuestion(next);
    setTurn(1);
    setCompleted(false);
    setRole(prefs.coachRoleMode === "expert" ? "expert" : "child");
    setEvaluation(null);
    setEvaluationNotes(null);
    setEvidence([]);
    setLatestBlindspot(null);
    setMessages([{ from: "ai", text: next.question }]);
    const targetConcept = concepts.find((item) => item.id === next?.conceptId || item.title === next?.concept);
    const existing = (sessionsCache || []).find((item) =>
      item.questionId === next?.id && item.conceptId === targetConcept?.id && !item.status
    );
    if (existing) {
      const userTurns = existing.messages.filter((m) => m.from === "user").length || 0;
      const sessionMax = Number(existing.meta?.maxTurns) || maxTurns;
      setSessionId(existing.id);
      setMessages(existing.messages.length ? existing.messages : [{ from: "ai", text: next.question }]);
      setTurn(userTurns + 1);
      setCompleted(userTurns >= sessionMax || Boolean(existing.status));
      setEvaluation(existing.evaluations.at(-1) || null);
      setRole(userTurns + 1 >= Math.max(2, sessionMax - 1) ? "expert" : "child");
    } else {
      try {
        const data = await createSession(project.id, {
          documentIds: selectedDocumentIds,
          conceptId: targetConcept?.id,
          concept: targetConcept?.title,
          questionId: next?.id,
          question: next?.question,
          meta: {
            maxTurns,
            isVariant: Boolean(next.isVariant),
            blindspotId: next.blindspotId || null,
            practiceDocumentIds: selectedDocumentIds
          }
        });
        setSessionId(data.session.id);
        setSessionsCache((items) => [data.session, ...(items || [])]);
      } catch (error) {
        showToast(error.message);
      }
    }
  };

  const submit = async (overrideText) => {
    const raw = typeof overrideText === "string" ? overrideText : answer;
    const userText = String(raw || "").trim();
    if (!userText || loading || completed) return;
    setAnswer("");
    setRequestError("");
    const nextMessages = [...messages, { from: "user", text: userText }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const data = await askCoach({
        projectId: project.id,
        documentIds: selectedDocumentIds,
        sessionId,
        question,
        concept,
        answer: userText,
        role,
        turn
      });
      const finalMessages = data.session?.messages || [...nextMessages, { from: "ai", text: data.reply }];
      setMessages(finalMessages);
      setEvaluation(data.evaluation);
      setEvaluationNotes(data.evaluationNotes || null);
      setEvidence(Array.isArray(data.evidence) ? data.evidence : []);
      setRole(data.phase || role);
      setTurn((value) => value + 1);
      setCompleted(Boolean(data.completed));
      if (data.session) syncSessionCache(data.session);
      if (data.blindspot) {
        setLatestBlindspot(data.blindspot);
        const exists = projectBlindspots.some((item) => item.title === data.blindspot.title);
        if (!exists) {
          updateProject({
            blindspots: [
              ...projectBlindspots,
              {
                id: `b-${Date.now()}`,
                ...data.blindspot,
                concept: concept.title,
                source: (question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file || "相关学习资料",
                status: "open",
                documentIds: selectedDocumentIds
              }
            ]
          });
          showToast("发现一个新的认知盲区，已加入补漏清单");
        }
      }
    } catch (error) {
      setAnswer(userText);
      setMessages(messages);
      setRequestError(error.message || "教练暂时无法回应，请重试");
      showToast("教练响应失败，你的解释已恢复，可以直接重试");
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    if (!evaluation) {
      showToast("请至少完成一轮解释和追问后再保存");
      return;
    }
    const avg = Math.round(Object.values(evaluation).reduce((a, b) => a + b, 0) / 4);
    const passScore = Number(prefs.coachPassScore) || 75;
    const passed = avg >= passScore;
    if (sessionId) {
      try {
        await updateSession(project.id, sessionId, {
          documentIds: selectedDocumentIds,
          score: avg,
          status: passed ? "passed" : "needs_review",
          meta: { maxTurns, isVariant, blindspotId, blindspotTitle, practiceDocumentIds: selectedDocumentIds }
        });
      } catch (error) {
        showToast(error.message);
        return;
      }
    }
    updateProject({
      sessions: [
        {
          id: `ss-${Date.now()}`,
          concept: concept.title,
          question: question.question,
          score: avg,
          date: "刚刚",
          status: passed ? "通过" : "需补漏",
          isRetest: isVariant,
          documentIds: selectedDocumentIds
        },
        ...(project.sessions || [])
      ],
      blindspots: projectBlindspots.map((item) => {
        if (!passed) return item;
        if (blindspotId && item.id === blindspotId) return { ...item, status: "done" };
        if (!blindspotId && item.concept === concept.title && item.status === "review") {
          return { ...item, status: "done" };
        }
        return item;
      })
    });
    showToast(passed ? "对练已通过，相关待复测盲区已标记为掌握" : "对练已保存，相关盲区仍需继续练习");
  };

  const currentTurn = Math.min(turn, maxTurns);
  const roleLabel = role === "child" ? "好奇的小孩" : "严厉的专家";
  const dialogue = messages.filter((message, index) => {
    if (index === 0 && message.from === "ai" && message.text === question.question) return false;
    return true;
  });
  const avgScore = evaluation
    ? Math.round(Object.values(evaluation).reduce((a, b) => a + b, 0) / 4)
    : null;

  return (
    <div className="coach-page">
      <PageHeading
        eyebrow={isVariant ? "变式复测" : "第三步 · 费曼输出"}
        title={isVariant ? `复测 · ${blindspotTitle || "盲区"}` : "费曼对练"}
        description={isVariant ? "用变式题检验盲区是否真的补上了。" : "用自己的话讲清楚，经得住追问才算掌握。"}
        action={<button className="primary-btn" onClick={finish}><Check size={16} /> 结束并保存</button>}
        demo={project.analysis?.demo}
      />

      <div className="coach-layout">
        <section className="coach-main">
          <header className="coach-top">
            <div className="coach-progress" aria-label={`进度 ${currentTurn}/${maxTurns}`}>
              {Array.from({ length: maxTurns }, (_, index) => {
                const step = index + 1;
                const done = completed || step < currentTurn;
                const active = !completed && step === currentTurn;
                return <i key={step} className={done ? "done" : active ? "active" : ""} />;
              })}
              <span>{completed ? `已完成 ${maxTurns} 问` : `${currentTurn} / ${maxTurns}`}</span>
            </div>
            <div className="coach-top-meta">
              <span className={`coach-role-chip ${role}`}>{roleLabel}{roleLocked ? " · 自动" : ""}</span>
              {!roleLocked && (
                <div className="role-switch compact">
                  <button className={role === "child" ? "active" : ""} onClick={() => setRole("child")}>小白</button>
                  <button className={role === "expert" ? "active" : ""} onClick={() => setRole("expert")}>专家</button>
                </div>
              )}
              <label className="coach-switch-q">
                <span>换题</span>
                <select value={question.id} onChange={changeQuestion} title={question.question}>
                  {questionList.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.isVariant ? `复测 · ${item.concept || item.question.slice(0, 18)}` : (item.concept || item.question.slice(0, 22))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          <div className="coach-prompt">
            <div className="coach-prompt-icon"><GraduationCap size={20} /></div>
            <div>
              <em>{isVariant ? "复测题" : "本题"} · {concept.title}</em>
              <strong>{question.question}</strong>
            </div>
          </div>

          <div className="chat-area">
            {!dialogue.length && !loading && (
              <div className="coach-empty-chat">
                <Sparkles size={18} />
                <p>在下方写下你的解释。教练会追问，但不会替你补完答案。</p>
              </div>
            )}
            {dialogue.map((message, index) => (
              <div className={`message ${message.from}`} key={`${message.from}-${index}`}>
                {message.from === "ai" && <div className="mini-avatar"><Sparkles size={14} /></div>}
                <div>{message.text}</div>
              </div>
            ))}
            {loading && (
              <div className="message ai thinking">
                <div className="mini-avatar"><Sparkles size={14} /></div>
                <div>
                  <div className="typing"><i /><i /><i /></div>
                  <span className="thinking-label">结合资料思考中…</span>
                </div>
              </div>
            )}
          </div>

          {requestError && (
            <div className="request-error coach-request-error" role="alert">
              <CircleAlert size={17} />
              <div><strong>发送失败</strong><p>{requestError}</p></div>
              <button className="secondary-btn" onClick={() => submit()} disabled={!answer.trim() || loading}><RotateCcw size={15} /> 重试</button>
            </div>
          )}

          <div className="answer-box">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={completed}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
              }}
              placeholder={completed ? "本轮已结束，可点击右上角保存" : "用人话解释……"}
            />
            <div className="answer-foot">
              <span>{completed ? "本轮不会继续追问" : "⌘/Ctrl + Enter 发送"}</span>
              <div className="answer-foot-actions">
                <VoiceInputButton
                  disabled={loading || completed}
                  showToast={showToast}
                  title="语音输入"
                  tip="录音时实时显示浏览器转写，结束后自动交给 AI 修正"
                  placeholder="用人话解释概念… 识别结果会出现在这里"
                  confirmLabel="确认"
                  purpose="费曼对练解释"
                  onTranscript={(text) => setAnswer((current) => `${current}${current.trim() ? " " : ""}${text}`)}
                />
                <button className="answer-send-btn" onClick={() => submit()} disabled={!answer.trim() || loading || completed}>
                  <Send size={16} /> 发送
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="coach-side">
          <div className="coach-panel">
            <div className="coach-panel-head">
              <span className="section-kicker">{question.concept || concept.title}</span>
              {avgScore != null && <b className="coach-avg">{avgScore}</b>}
            </div>
            <h3>{concept.title}</h3>
            <p className="coach-panel-why">{question.why || concept.explanation}</p>
            <button className="source-link" type="button" onClick={() => navigate?.("sources")}>
              <FileText size={14} /> {(question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file || "查看资料"}
            </button>

            <div className="coach-score-block">
              <span className="section-kicker">实时评分</span>
              {evaluation ? (
                <>
                  <ScoreBar label="说人话" value={evaluation.clarity} />
                  <ScoreBar label="逻辑闭环" value={evaluation.logic} />
                  <ScoreBar label="举例能力" value={evaluation.example} />
                  <ScoreBar label="边界意识" value={evaluation.boundary} />
                  {evaluationNotes && (
                    <p className="coach-note-line">
                      <Lightbulb size={14} />
                      {Object.values(evaluationNotes).filter(Boolean)[0]}
                    </p>
                  )}
                  <p className="score-note">通过线 {prefs.coachPassScore || 75} 分</p>
                </>
              ) : (
                <EmptyMini text="发出第一段解释后显示评分。" />
              )}
            </div>
          </div>

          {prefs.coachShowEvidence !== false && evidence.length > 0 && (
            <div className="coach-panel coach-evidence">
              <span className="section-kicker">资料依据</span>
              <ul>
                {evidence.slice(0, 3).map((item, index) => (
                  <li key={`${item.filename}-${item.page}-${index}`}>
                    <strong>{item.filename || "资料"}{item.page ? ` · p.${item.page}` : ""}</strong>
                    <p>{item.quote}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latestBlindspot && (
            <div className="coach-panel coach-blindspot-card">
              <span className="section-kicker">本轮盲区</span>
              <h3>{latestBlindspot.title}</h3>
              <p>{latestBlindspot.problem}</p>
              <p className="coach-blindspot-action"><strong>下一步</strong>{latestBlindspot.action}</p>
            </div>
          )}
        </aside>
      </div>

    </div>
  );
}
