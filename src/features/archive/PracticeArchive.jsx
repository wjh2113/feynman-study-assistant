import React, { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  Archive,
  Bot,
  Check,
  FileText,
  Lightbulb,
  Trash2,
  User,
  X
} from "../../components/icons.jsx";
import { deleteSession, listSessions } from "../../api/projects.js";
import {
  formatSessionDate,
  formatSessionStatus
} from "../../lib/coachSessions.js";

const SCORE_LABELS = {
  clarity: "说人话",
  logic: "逻辑闭环",
  example: "举例能力",
  boundary: "边界意识"
};

function overlapsSelection(session, selectedDocumentIds = []) {
  if (!selectedDocumentIds.length) return true;
  const ids = Array.isArray(session?.documentIds) && session.documentIds.length
    ? session.documentIds
    : session?.meta?.practiceDocumentIds || [];
  if (!ids.length) return true;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

function scoreTone(score) {
  if (score >= 85) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "mid";
  return "warn";
}

function averageEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return null;
  const values = Object.values(evaluation).map(Number).filter((item) => Number.isFinite(item));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
}

function sessionScore(session) {
  if (Number.isFinite(Number(session?.score))) return Number(session.score);
  const last = Array.isArray(session?.evaluations) ? session.evaluations.at(-1) : null;
  return averageEvaluation(last) || averageEvaluation(session?.meta?.evaluation) || 0;
}

export function PracticeArchive({
  project,
  selectedDocumentIds = [],
  refreshProject,
  showToast,
  navigate
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [activeId, setActiveId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const selectionKey = selectedDocumentIds.join(",");

  const load = async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const data = await listSessions(project.id, {
        documentIds: selectedDocumentIds.length ? selectedDocumentIds : undefined
      });
      const next = (data.sessions || [])
        .filter((item) => overlapsSelection(item, selectedDocumentIds))
        .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
      setSessions(next);
      setActiveId((current) => (current && next.some((item) => item.id === current) ? current : null));
    } catch (error) {
      showToast?.(error.message || "读取对练归档失败");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on project/selection change only
  }, [project?.id, selectionKey]);

  const visible = useMemo(() => {
    if (filter === "archived") return sessions.filter((item) => item.status);
    if (filter === "open") return sessions.filter((item) => !item.status);
    if (filter === "passed") return sessions.filter((item) => item.status === "passed");
    if (filter === "needs_review") return sessions.filter((item) => item.status === "needs_review");
    return sessions;
  }, [sessions, filter]);

  const active = sessions.find((item) => item.id === activeId) || null;
  const evaluation = active?.meta?.evaluation || active?.evaluations?.at(-1) || null;
  const diagnosis = active?.meta?.diagnosis || null;

  const confirmDelete = async () => {
    if (!deleteTarget || !project?.id) return;
    setDeleting(true);
    try {
      await deleteSession(project.id, deleteTarget.id);
      setSessions((items) => items.filter((item) => item.id !== deleteTarget.id));
      if (activeId === deleteTarget.id) setActiveId(null);
      setDeleteTarget(null);
      showToast?.("已删除该条对练归档");
      await refreshProject?.(project.id, selectedDocumentIds);
    } catch (error) {
      showToast?.(error.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (!selectedDocumentIds.length) {
    return <EmptyMini text="请先在上方选择资料，再查看对练归档" />;
  }

  return (
    <div className="archive-page">
      <PageHeading
        title="对练归档"
        description="每次费曼对练与测评结果都会保存在这里，可随时回看或删除。"
        action={(
          <button className="secondary-btn" type="button" onClick={() => navigate?.("coach")}>
            <Check size={15} /> 继续对练
          </button>
        )}
      />

      <div className="archive-toolbar">
        <div className="archive-filters" role="tablist" aria-label="归档筛选">
          {[
            ["all", "全部"],
            ["archived", "已归档"],
            ["open", "进行中"],
            ["passed", "已通过"],
            ["needs_review", "需补漏"]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="archive-count">
          <Archive size={14} /> {visible.length} 条
        </span>
      </div>

      {loading ? (
        <div className="settings-loading"><Spinner /> 正在读取归档…</div>
      ) : (
        <div className={`archive-layout ${active ? "has-detail" : ""}`}>
          <section className="panel archive-list-panel">
            {!visible.length ? (
              <EmptyMini text="还没有对练记录。完成一次费曼对练后，结果会自动出现在这里。" />
            ) : (
              <div className="session-list archive-session-list">
                {visible.map((session) => {
                  const score = sessionScore(session);
                  const tone = scoreTone(score);
                  const status = formatSessionStatus(session.status);
                  return (
                    <button
                      type="button"
                      key={session.id}
                      className={`session-row archive-session-row ${activeId === session.id ? "active" : ""}`}
                      onClick={() => setActiveId(session.id)}
                    >
                      <span className="session-icon"><FileText size={16} /></span>
                      <div className="session-copy">
                        <strong>{session.concept || "未命名概念"}</strong>
                        <span>{formatSessionDate(session.updatedAt || session.createdAt)} · {session.meta?.isVariant ? "复测" : "对练"}</span>
                      </div>
                      <span className={`grade-pill ${tone}`}>{status}</span>
                      <b>{score} 分</b>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {active && (
            <section className="panel archive-detail-panel" aria-label="对练详情">
              <header className="archive-detail-head">
                <div>
                  <span className="section-kicker">{active.meta?.isVariant ? "盲区复测" : "费曼对练"}</span>
                  <h3>{active.concept || "未命名概念"}</h3>
                  <p>{formatSessionDate(active.updatedAt || active.createdAt)} · {formatSessionStatus(active.status)} · {sessionScore(active)} 分</p>
                </div>
                <div className="archive-detail-actions">
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => setDeleteTarget(active)}
                  >
                    <Trash2 size={15} /> 删除
                  </button>
                  <button type="button" className="icon-btn" aria-label="关闭详情" onClick={() => setActiveId(null)}>
                    <X size={18} />
                  </button>
                </div>
              </header>

              <div className="archive-question">
                <strong>练习问题</strong>
                <p>{active.question || "（无问题文本）"}</p>
              </div>

              {evaluation && (
                <div className="archive-scores">
                  {Object.entries(SCORE_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <strong>{Number(evaluation[key]) || 0}</strong>
                    </div>
                  ))}
                </div>
              )}

              {diagnosis && (
                <div className="archive-diagnosis">
                  <header><Lightbulb size={15} /> 学习诊断</header>
                  {diagnosis.summary && <p>{diagnosis.summary}</p>}
                  {Array.isArray(diagnosis.weakAspects) && diagnosis.weakAspects.length > 0 && (
                    <>
                      <strong>薄弱点</strong>
                      <ul>
                        {diagnosis.weakAspects.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </>
                  )}
                  {diagnosis.userProblem && (
                    <>
                      <strong>问题聚焦</strong>
                      <p>{diagnosis.userProblem}</p>
                    </>
                  )}
                  {Array.isArray(diagnosis.knowledgeGaps) && diagnosis.knowledgeGaps.length > 0 && (
                    <>
                      <strong>知识缺口</strong>
                      <ul>
                        {diagnosis.knowledgeGaps.map((gap) => <li key={gap}>{gap}</li>)}
                      </ul>
                    </>
                  )}
                  {Array.isArray(diagnosis.knowledgeToMaster) && diagnosis.knowledgeToMaster.length > 0 && (
                    <>
                      <strong>建议掌握</strong>
                      <ul>
                        {diagnosis.knowledgeToMaster.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <div className="archive-transcript">
                <header>对话记录</header>
                <div className="archive-messages">
                  {(active.messages || []).map((message, index) => (
                    <div className={`archive-message ${message.from}`} key={`${active.id}-${index}`}>
                      <span className="archive-message-role">
                        {message.from === "user" ? <User size={14} /> : <Bot size={14} />}
                        {message.from === "user" ? "我" : "教练"}
                      </span>
                      <p>{message.text}</p>
                    </div>
                  ))}
                  {!active.messages?.length && <EmptyMini text="没有对话内容" />}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        tone="danger"
        title="删除这条对练归档？"
        description={deleteTarget ? `将永久删除「${deleteTarget.concept || "未命名概念"}」的对练记录、评分与诊断，不可恢复。` : ""}
        confirmLabel={deleting ? "删除中…" : "确认删除"}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
