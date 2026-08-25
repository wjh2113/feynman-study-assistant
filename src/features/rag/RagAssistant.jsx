import React, { useEffect, useMemo, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { VoiceInputButton } from "../../components/VoiceInputButton.jsx";
import {
  BarChart2,
  Check,
  CircleAlert,
  Clock,
  ExternalLink,
  FileText,
  RotateCcw,
  Search,
  Sparkles,
  Tag
} from "../../components/icons.jsx";
import { askRag, getRagHistory, saveRagHistory } from "../../api/rag.js";

function groupHistory(items) {
  const groups = { 今天: [], 昨天: [], 更早: [] };
  for (const item of items) {
    const key = item.group || "更早";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).filter(([, list]) => list.length);
}

export function RagAssistant({ project, navigate, showToast, refreshProject }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [requestError, setRequestError] = useState("");
  const hasSources = Number(project.documentCount || 0) > 0 || Boolean(project.analysis?.sources?.some((source) => source.downloadUrl));
  const grouped = useMemo(() => groupHistory(history), [history]);

  useEffect(() => {
    let cancelled = false;
    getRagHistory(project.id, 50)
      .then((data) => {
        if (cancelled) return;
        const records = (data.records || []).map((record) => {
          const raw = String(record.query || record.question || "").trim();
          const question = !raw || raw === "[object Object]" ? "（历史异常记录）" : raw;
          return { ...record, question, answer: record.answer, when: record.when || "", group: record.group || "更早" };
        });
        setHistory(records);
        setCurrent(records[0] || null);
      })
      .catch((error) => showToast(`读取问答历史失败：${error.message}`));
    return () => { cancelled = true; };
  }, [project.id, showToast]);

  const ask = async (overrideText) => {
    const raw = typeof overrideText === "string" ? overrideText : query;
    const question = String(raw || "").trim();
    if (!question || loading) return;
    setQuery("");
    setRequestError("");
    setLoading(true);
    try {
      const data = await askRag({ projectId: project.id, query: question });
      const record = { ...data, question, when: "刚刚", group: "今天" };
      setCurrent(record);
      setHistory((items) => [record, ...items]);
      await saveRagHistory(project.id, {
        query: question,
        answer: data.answer,
        sources: data.sources,
        debug: data.debug,
        insufficient: data.insufficient,
        demo: data.demo
      });
      await refreshProject?.(project.id);
    } catch (error) {
      setQuery(question);
      setRequestError(error.message || "资料问答失败，请稍后重试");
      showToast("资料问答失败，详情已显示在输入框下方");
    } finally {
      setLoading(false);
    }
  };

  const item = current;

  return (
    <div className="rag-layout">
      <div className="rag-main">
        <PageHeading
          eyebrow="严格据资料 · 禁止扩展"
          title="资料问答"
          description="只根据上传原文回答，并标文件名与引用。"
        />
        <div className="rag-toggles">
          <span className="rag-toggle on"><Check size={14} /> 仅用上传资料</span>
          <span className="rag-toggle on"><Tag size={14} /> 显示文件名与引用</span>
        </div>
        <section className="panel rag-ask-panel">
          <div className="rag-input-row">
            <div className="rag-textarea-shell">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") ask();
                }}
                placeholder={hasSources ? "输入问题，按 ⌘/Ctrl+Enter 检索并回答" : "请先上传资料并完成解析"}
                disabled={!hasSources || loading}
              />
              <VoiceInputButton
                className="floating"
                disabled={!hasSources || loading}
                onTranscript={(text) => setQuery((current) => `${current}${current ? " " : ""}${text}`.trim())}
              />
            </div>
            <button className="primary-btn rag-send" type="button" onClick={() => ask()} disabled={!hasSources || loading || !query.trim()}>
              {loading ? <Spinner /> : <Search size={16} />} {loading ? "检索中…" : "检索并回答"}
            </button>
          </div>
          {requestError && <p className="rag-error">{requestError}</p>}
        </section>

        {item ? (
          <>
            <section className="panel rag-answer-panel">
              <header className="rag-answer-head">
                <span className="rag-q-badge">问</span>
                <h2>{item.question}</h2>
              </header>
              <div className="rag-answer-body">
                <p>{item.answer || "暂无回答"}</p>
                {item.insufficient && (
                  <div className="rag-insufficient"><CircleAlert size={15} /> 资料中未找到足够依据，以下回答可能不完整。</div>
                )}
              </div>
              {!!item.sources?.length && (
                <div className="rag-citations">
                  {item.sources.map((source, index) => (
                    <div className="rag-citation" key={`${source.filename}-${index}`}>
                      <FileText size={14} />
                      <span>
                        《{source.filename}》
                        {source.page != null ? ` | 第 ${source.page} 页` : ""}
                        {source.headingPath ? ` | ${source.headingPath}` : source.heading ? ` | ${source.heading}` : ""}
                      </span>
                      <ExternalLink size={12} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {item.debug?.candidates?.length > 0 && (
              <section className="panel rag-debug-panel">
                <header><BarChart2 size={16} /> 检索调试</header>
                <div className="rag-debug-list compact">
                  {(item.debug.candidates || []).map((candidate) => {
                    const score = Number(candidate.fusionScore ?? candidate.rerankScore ?? 0);
                    const heading = candidate.headingPath || candidate.heading || "";
                    return (
                      <article key={candidate.id}>
                        <strong>
                          {candidate.filename}
                          {candidate.page != null ? ` 第 ${candidate.page} 页` : ""}
                          {heading ? ` · ${heading}` : ""}
                        </strong>
                        <em>{Math.round(score * 100)}%</em>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="panel rag-empty-panel">
            <Sparkles size={22} />
            <p>上传并完成资料解析后，在这里提问。回答会严格引用原文。</p>
          </section>
        )}
      </div>

      <aside className="rag-history-side">
        <header><Clock size={16} /> 问答历史</header>
        {grouped.map(([label, items]) => (
          <div className="rag-history-group" key={label}>
            <span>{label}</span>
            {items.map((record) => (
              <button
                type="button"
                key={record.id || record.question}
                className={current?.question === record.question ? "active" : ""}
                onClick={() => setCurrent(record)}
              >
                {record.question}
              </button>
            ))}
          </div>
        ))}
        {!history.length && <p className="rag-history-empty">还没有问答记录</p>}
        {!!history.length && (
          <button className="text-btn" type="button" onClick={() => { setCurrent(history[0]); setQuery(history[0]?.question || ""); }}>
            <RotateCcw size={14} /> 重新提问最新一条
          </button>
        )}
      </aside>
    </div>
  );
}
