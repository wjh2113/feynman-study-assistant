import React, { useEffect, useMemo, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { VoiceInputButton } from "../../components/VoiceInputButton.jsx";
import {
  Check,
  CircleAlert,
  Clock,
  FileText,
  RotateCcw,
  Search,
  Sparkles
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

function shortFilename(name = "") {
  const text = String(name || "").trim();
  if (text.length <= 28) return text;
  const ext = text.includes(".") ? text.slice(text.lastIndexOf(".")) : "";
  const base = ext ? text.slice(0, -ext.length) : text;
  return `${base.slice(0, 18)}…${base.slice(-4)}${ext}`;
}

function citationMeta(source) {
  const bits = [];
  if (source.page != null) bits.push(`第 ${source.page} 页`);
  const heading = source.headingPath || source.heading;
  if (heading) bits.push(heading);
  return bits.join(" · ");
}

function scoreLabel(candidate) {
  const raw = Number(candidate.fusionScore ?? candidate.rerankScore ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return "—";
  const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  return `${Math.min(pct, 100)}%`;
}

export function RagAssistant({ project, navigate, showToast, refreshProject }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [requestError, setRequestError] = useState("");
  const hasSources = Number(project.documentCount || 0) > 0
    || Boolean(project.analysis?.sources?.some((source) => source.downloadUrl));
  const grouped = useMemo(() => groupHistory(history), [history]);

  useEffect(() => {
    let cancelled = false;
    setCurrent(null);
    getRagHistory(project.id, 50)
      .then((data) => {
        if (cancelled) return;
        const records = (data.records || []).map((record) => {
          const raw = String(record.query || record.question || "").trim();
          const question = !raw || raw === "[object Object]" ? "（历史异常记录）" : raw;
          return {
            ...record,
            question,
            answer: record.answer,
            when: record.when || "",
            group: record.group || "更早"
          };
        });
        setHistory(records);
        // Keep empty main pane until user asks or picks history.
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

  const clearCurrent = () => {
    setCurrent(null);
    setRequestError("");
  };

  const item = current;
  const debugCandidates = item?.debug?.candidates || [];

  return (
    <div className="rag-layout">
      <div className="rag-main">
        <PageHeading
          eyebrow="严格据资料 · 禁止扩展"
          title="资料问答"
          description="只根据上传原文回答，并标出引用位置。历史记录在右侧，不会自动展开。"
        />

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
                onTranscript={(text) => setQuery((currentText) => `${currentText}${currentText ? " " : ""}${text}`.trim())}
              />
            </div>
            <button
              className="primary-btn rag-send"
              type="button"
              onClick={() => ask()}
              disabled={!hasSources || loading || !query.trim()}
            >
              {loading ? <Spinner /> : <Search size={16} />}
              {loading ? "检索中…" : "检索并回答"}
            </button>
          </div>
          {requestError && <p className="rag-error">{requestError}</p>}
          <p className="rag-ask-hint">
            <Check size={13} /> 仅用上传资料作答
          </p>
        </section>

        {item ? (
          <section className="panel rag-answer-panel">
            <header className="rag-answer-head">
              <div>
                <span className="rag-q-badge">问</span>
                <h2>{item.question}</h2>
              </div>
              <button type="button" className="text-btn rag-clear-btn" onClick={clearCurrent}>
                新提问
              </button>
            </header>

            <div className="rag-answer-body">
              <span className="rag-a-label">答</span>
              <p>{item.answer || "暂无回答"}</p>
              {item.insufficient && (
                <div className="rag-insufficient">
                  <CircleAlert size={15} /> 资料中未找到足够依据，以下回答可能不完整。
                </div>
              )}
            </div>

            {!!item.sources?.length && (
              <div className="rag-citations">
                <h3>引用来源 · {item.sources.length}</h3>
                <ol>
                  {item.sources.map((source, index) => {
                    const meta = citationMeta(source);
                    return (
                      <li className="rag-citation" key={`${source.filename}-${source.page}-${index}`}>
                        <span className="rag-cite-index">{index + 1}</span>
                        <div className="rag-cite-copy">
                          <strong title={source.filename}>{shortFilename(source.filename)}</strong>
                          {meta ? <span>{meta}</span> : null}
                          {source.quote || source.content ? (
                            <q>{String(source.quote || source.content).slice(0, 120)}</q>
                          ) : null}
                        </div>
                        <FileText size={14} className="rag-cite-icon" />
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {(item?.debug?.queryExpansion?.keywords?.length > 0 || item?.debug?.queryExpansion?.searchText) && (
              <div className="rag-query-expand">
                <span className="section-kicker">检索扩写</span>
                {item.debug.queryExpansion.intent ? <p>{item.debug.queryExpansion.intent}</p> : null}
                <p>
                  {item.debug.queryExpansion.keywords?.length
                    ? `关键词：${item.debug.queryExpansion.keywords.join("、")}`
                    : null}
                  {item.debug.queryExpansion.searchText
                    ? `${item.debug.queryExpansion.keywords?.length ? " · " : ""}检索句：${item.debug.queryExpansion.searchText}`
                    : null}
                </p>
              </div>
            )}

            {debugCandidates.length > 0 && (
              <details className="rag-debug">
                <summary>检索细节（{debugCandidates.length} 条候选）</summary>
                <div className="rag-debug-list compact">
                  {debugCandidates.map((candidate) => {
                    const heading = candidate.headingPath || candidate.heading || "";
                    return (
                      <article key={candidate.id}>
                        <strong title={candidate.filename}>
                          {shortFilename(candidate.filename)}
                          {candidate.page != null ? ` · 第 ${candidate.page} 页` : ""}
                          {heading ? ` · ${heading}` : ""}
                        </strong>
                        <em>{scoreLabel(candidate)}</em>
                      </article>
                    );
                  })}
                </div>
              </details>
            )}
          </section>
        ) : (
          <section className="panel rag-empty-panel">
            <Sparkles size={22} />
            <h3>{hasSources ? "提出一个具体问题" : "还没有可检索的资料"}</h3>
            <p>
              {hasSources
                ? "例如「五十音怎么记」「は和が有什么区别」。回答会严格依据原文并标注引用。"
                : "先到「学科资料」上传并完成解析，再回到这里提问。"}
            </p>
            {!hasSources && (
              <button type="button" className="secondary-btn" onClick={() => navigate?.("sources")}>
                去上传资料
              </button>
            )}
          </section>
        )}
      </div>

      <aside className="rag-history-side">
        <header>
          <Clock size={16} />
          <span>问答历史</span>
          {history.length > 0 && <em>{history.length}</em>}
        </header>

        {grouped.map(([label, items]) => (
          <div className="rag-history-group" key={label}>
            <span className="rag-history-label">{label}</span>
            {items.map((record) => (
              <button
                type="button"
                key={record.id || `${record.question}-${record.when}`}
                className={`rag-history-item ${current && (current.id === record.id || current.question === record.question) ? "active" : ""}`}
                onClick={() => setCurrent(record)}
                title={record.question}
              >
                <span className="q-mark">问</span>
                <strong>{record.question}</strong>
                <em>{record.when || label}</em>
              </button>
            ))}
          </div>
        ))}

        {!history.length && <p className="rag-history-empty">还没有问答记录</p>}

        {!!history.length && (
          <button
            className="text-btn rag-history-replay"
            type="button"
            onClick={() => {
              const latest = history[0];
              if (!latest?.question) return;
              setQuery(latest.question);
              setCurrent(null);
            }}
          >
            <RotateCcw size={14} /> 把最新问题填回输入框
          </button>
        )}
      </aside>
    </div>
  );
}
