import React, { useEffect, useState } from "react";
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
import { questionsForProject } from "../../lib/questions.js";
import { ScoreBar } from "./ScoreBar.jsx";

export function Coach({ project, updateProject, showToast, navigate }) {
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const questions = questionsForProject(project);
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem("zhifan-selected-concept")); } catch { return null; }
  })();
  const isVariant = stored?.isVariant;
  const initialQuestion =
    stored?.question ||
    questions.find((item) => item.id === stored?.questionId) ||
    questions.find((item) => item.conceptId === stored?.id || item.concept === stored?.title) ||
    questions[0];
  const [question, setQuestion] = useState(initialQuestion);
  const concept =
    concepts.find((item) => item.id === question?.conceptId || item.title === question?.concept) ||
    concepts[0];
  const [role, setRole] = useState("child");
  const [answer, setAnswer] = useState("");
  const [turn, setTurn] = useState(1);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [messages, setMessages] = useState(() => [
    { from: "ai", text: initialQuestion?.question || "请先上传资料，让AI根据资料生成问题。" }
  ]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionsCache, setSessionsCache] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await listSessions(project.id);
        if (cancelled) return;
        setSessionsCache(data.sessions || []);
        const existing = (data.sessions || []).find((item) =>
          item.questionId === initialQuestion?.id &&
          item.conceptId === concept?.id &&
          !item.status
        );
        if (existing) {
          setSessionId(existing.id);
          setMessages(existing.messages.length ? existing.messages : [{ from: "ai", text: initialQuestion?.question }]);
          setTurn((existing.messages.filter((m) => m.from === "user").length || 0) + 1);
          setCompleted(existing.messages.filter((m) => m.from === "user").length >= 3 || Boolean(existing.status));
          setEvaluation(existing.evaluations.at(-1) || null);
          setRole(existing.messages.length >= 4 ? "expert" : "child");
        } else {
          const createdData = await createSession(project.id, {
            conceptId: concept?.id,
            concept: concept?.title,
            questionId: initialQuestion?.id,
            question: initialQuestion?.question
          });
          if (!cancelled) setSessionId(createdData.session.id);
        }
      } catch (error) {
        if (!cancelled) showToast(`会话加载失败：${error.message}`);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [project.id, initialQuestion?.id, showToast]);

  useEffect(() => {
    sessionStorage.removeItem("zhifan-selected-concept");
  }, []);

  if (!question || !concept) return <NoAnalysis navigate={navigate} />;

  const persistMessages = async (nextMessages, nextEvaluations) => {
    if (!sessionId) return;
    await updateSession(project.id, sessionId, { messages: nextMessages, evaluations: nextEvaluations });
  };

  const changeQuestion = async (event) => {
    const next = questions.find((item) => item.id === event.target.value);
    setQuestion(next);
    setTurn(1);
    setCompleted(false);
    setRole("child");
    setEvaluation(null);
    setMessages([{ from: "ai", text: next.question }]);
    const targetConcept = concepts.find((item) => item.id === next?.conceptId || item.title === next?.concept);
    const existing = (sessionsCache || []).find((item) =>
      item.questionId === next?.id && item.conceptId === targetConcept?.id && !item.status
    );
    if (existing) {
      setSessionId(existing.id);
      setMessages(existing.messages.length ? existing.messages : [{ from: "ai", text: next.question }]);
      setTurn((existing.messages.filter((m) => m.from === "user").length || 0) + 1);
      setCompleted(existing.messages.filter((m) => m.from === "user").length >= 3 || Boolean(existing.status));
      setEvaluation(existing.evaluations.at(-1) || null);
      setRole(existing.messages.length >= 4 ? "expert" : "child");
    } else {
      try {
        const data = await createSession(project.id, {
          conceptId: targetConcept?.id,
          concept: targetConcept?.title,
          questionId: next?.id,
          question: next?.question
        });
        setSessionId(data.session.id);
        setSessionsCache((items) => [data.session, ...(items || [])]);
      } catch (error) {
        showToast(error.message);
      }
    }
  };

  const submit = async () => {
    if (!answer.trim() || loading || completed) return;
    const userText = answer.trim();
    setAnswer("");
    setRequestError("");
    const nextMessages = [...messages, { from: "user", text: userText }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const data = await askCoach({ projectId: project.id, sessionId, question, concept, answer: userText, role, turn });
      const finalMessages = [...nextMessages, { from: "ai", text: data.reply }];
      const finalEvaluations = [...(sessionId ? (sessionsCache?.find((s) => s.id === sessionId)?.evaluations || []) : []), data.evaluation];
      setMessages(finalMessages);
      setEvaluation(data.evaluation);
      setRole(data.phase || role);
      setTurn((value) => value + 1);
      setCompleted(Boolean(data.completed));
      await persistMessages(finalMessages, finalEvaluations);
      if (data.blindspot) {
        const exists = project.blindspots?.some((item) => item.title === data.blindspot.title);
        if (!exists) {
          updateProject({
            blindspots: [
              ...(project.blindspots || []),
              {
                id: `b-${Date.now()}`,
                ...data.blindspot,
                concept: concept.title,
                source: (question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file || "相关学习资料",
                status: "open"
              }
            ]
          });
          showToast("发现一个新的认知盲区，已加入补漏清单");
        }
      }
    } catch (error) {
      setAnswer(userText);
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
    const passed = avg >= 75;
    if (sessionId) {
      try {
        await updateSession(project.id, sessionId, { score: avg, status: passed ? "passed" : "needs_review" });
      } catch (error) {
        showToast(error.message);
        return;
      }
    }
    updateProject({
      sessions: [
        { id: `ss-${Date.now()}`, concept: concept.title, question: question.question, score: avg, date: "刚刚", status: passed ? "通过" : "需补漏" },
        ...(project.sessions || [])
      ],
      blindspots: (project.blindspots || []).map((item) =>
        passed && item.concept === concept.title && item.status === "review"
          ? { ...item, status: "done" }
          : item
      )
    });
    showToast(passed ? "对练已通过，相关待复测盲区已标记为掌握" : "对练已保存，相关盲区仍需继续练习");
  };

  return (
    <div className="coach-page">
      <PageHeading
        eyebrow={isVariant ? "变式复测 · 针对盲区" : "第三步 · 输出，暴露假懂"}
        title={isVariant ? `变式复测 · ${stored?.blindspotTitle || "盲区"}` : "费曼对练"}
        description={isVariant ? "这个问题专门设计来检验你刚才的盲区是否真正补上了。" : "AI 不会替你完善答案，而会通过追问逼你把逻辑讲清楚。"}
        action={<button className="secondary-btn" onClick={finish}><Check size={16} /> 结束并保存</button>}
        demo={project.analysis?.demo}
      />
      <div className="coach-layout">
        <section className="coach-main">
          <div className="coach-toolbar">
            <div className="coach-question-select"><span>当前问题</span><select value={question.id} onChange={changeQuestion}>{questions.map((item) => <option value={item.id} key={item.id}>{item.question}</option>)}</select></div>
            <div className="role-switch">
              <button className={role === "child" ? "active" : ""} onClick={() => setRole("child")}>小白模式</button>
              <button className={role === "expert" ? "active" : ""} onClick={() => setRole("expert")}>专家模式</button>
            </div>
          </div>

          <div className="chat-area">
            <div className="coach-intro">
              <div className="coach-avatar"><GraduationCap size={23} /></div>
              <div><strong>{role === "child" ? "好奇的 12 岁小孩" : "严厉的行业专家"}</strong><span>{role === "child" ? "会在你说黑话时立刻追问" : "会挑战假设、边界与极端情况"}</span></div>
            </div>
            {messages.map((message, index) => (
              <div className={`message ${message.from}`} key={index}>
                {message.from === "ai" && <div className="mini-avatar"><Sparkles size={14} /></div>}
                <div>{message.text}</div>
              </div>
            ))}
            {loading && (
              <div className="message ai thinking">
                <div className="mini-avatar"><Sparkles size={14} /></div>
                <div>
                  <div className="typing"><i /><i /><i /></div>
                  <span className="thinking-label">正在结合资料思考追问，最多等待 55 秒…</span>
                </div>
              </div>
            )}
          </div>

          {requestError && (
            <div className="request-error coach-request-error" role="alert">
              <CircleAlert size={17} />
              <div><strong>教练没有完成追问</strong><p>{requestError}</p><span>你的解释已经恢复在输入框中，可以修改后重试。</span></div>
              <button className="secondary-btn" onClick={submit} disabled={!answer.trim() || loading}><RotateCcw size={15} /> 重试</button>
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
              placeholder={completed ? "本轮三问已完成，请点击“结束并保存”" : "用你自己的话解释，不必追求完美……"}
            />
            <div className="answer-foot">
              <span>{completed ? "已完成 3 个问题，本轮不会继续追问" : "⌘ Enter 发送 · 可语音输入"}</span>
              <div className="answer-foot-actions">
                <VoiceInputButton
                  disabled={loading || completed}
                  onTranscript={(text) => setAnswer((current) => `${current}${current.trim() ? " " : ""}${text}`)}
                  showToast={showToast}
                />
                <button className="answer-send-btn" onClick={submit} disabled={!answer.trim() || loading || completed}><Send size={16} /> 发送解释</button>
              </div>
            </div>
          </div>
        </section>

        <aside className="coach-side">
          <div className="concept-note">
            <span className="section-kicker">问题依据 · {question.concept}</span>
            <h3>{concept.title}</h3>
            <p>{question.why || concept.explanation}</p>
            <button className="source-link"><FileText size={14} /> {(question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file}</button>
          </div>
          <div className="live-score">
            <span className="section-kicker">实时观察</span>
            {evaluation ? (
              <>
                <ScoreBar label="说人话" value={evaluation.clarity} />
                <ScoreBar label="逻辑闭环" value={evaluation.logic} />
                <ScoreBar label="举例能力" value={evaluation.example} />
                <ScoreBar label="边界意识" value={evaluation.boundary} />
                <p className="score-note"><Lightbulb size={14} /> 分数只是线索，能经得住追问才算真正掌握。</p>
              </>
            ) : <EmptyMini text="说出第一段解释后，AI 会观察你的表达。" />}
          </div>
        </aside>
      </div>
    </div>
  );
}
