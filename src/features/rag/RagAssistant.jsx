import React, { useEffect, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { VoiceInputButton } from "../../components/VoiceInputButton.jsx";
import {
  BrainCircuit,
  CircleAlert,
  FileText,
  RotateCcw,
  Search,
  Sparkles,
  UploadCloud
} from "../../components/icons.jsx";
import { askRag, getRagHistory, saveRagHistory } from "../../api/rag.js";

export function RagAssistant({ project, navigate, showToast }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [requestError, setRequestError] = useState("");
  const hasSources = Number(project.documentCount || 0) > 0 || Boolean(project.analysis?.sources?.some((source) => source.downloadUrl));

  useEffect(() => {
    let cancelled = false;
    getRagHistory(project.id, 50)
      .then((data) => {
        if (!cancelled) setHistory((data.records || []).map((record) => ({ question: record.query, ...record })));
      })
      .catch((error) => showToast(`读取问答历史失败：${error.message}`));
    return () => { cancelled = true; };
  }, [project.id]);

  const ask = async () => {
    if (!query.trim() || loading) return;
    const question = query.trim();
    setQuery("");
    setRequestError("");
    setLoading(true);
    try {
      const data = await askRag({ projectId: project.id, query: question });
      const record = { question, ...data };
      setHistory((items) => [record, ...items]);
      await saveRagHistory(project.id, {
        query: question,
        answer: data.answer,
        sources: data.sources,
        debug: data.debug,
        insufficient: data.insufficient,
        demo: data.demo
      });
    } catch (error) {
      setQuery(question);
      setRequestError(error.message || "资料问答失败，请稍后重试");
      showToast("资料问答失败，详情已显示在输入框下方");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="基于资料 · 混合检索"
        title="资料问答"
        description="先用 pgvector 与全文关键词检索找到原文，再让 DeepSeek 严格依据证据回答。"
        action={<button className="secondary-btn" onClick={() => navigate("sources")}><UploadCloud size={16} /> 管理资料</button>}
        demo={project.analysis?.demo}
      />
      <section className="panel rag-ask-panel">
        <div className="rag-status">
          <span><BrainCircuit size={16} /> PostgreSQL + pgvector</span>
          <span><Search size={16} /> 向量与关键词混合检索</span>
          <span><FileText size={16} /> 回答附原文引用</span>
        </div>
        <div className="rag-input-row">
          <div className="rag-textarea-shell">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") ask();
              }}
              placeholder={hasSources ? "针对已上传的资料提问，例如：讲师认为这个方法落地时最大的风险是什么？" : "请先上传资料并完成解析"}
              disabled={!hasSources || loading}
            />
            <VoiceInputButton
              className="floating"
              disabled={!hasSources || loading}
              onTranscript={(text) => setQuery((current) => `${current}${current.trim() ? " " : ""}${text}`)}
              showToast={showToast}
            />
          </div>
          <button className="primary-btn" onClick={ask} disabled={!hasSources || !query.trim() || loading}>
            {loading ? <Spinner /> : <Search size={17} />} 检索并回答
          </button>
        </div>
        {loading && <div className="request-progress"><Spinner /> 正在生成问题向量、召回资料并生成回答，最多等待 60 秒…</div>}
        {requestError && (
          <div className="request-error" role="alert">
            <CircleAlert size={17} />
            <div><strong>资料问答未完成</strong><p>{requestError}</p></div>
            <button className="secondary-btn" onClick={ask} disabled={!query.trim() || loading}><RotateCcw size={15} /> 重试</button>
          </div>
        )}
      </section>

      <div className="rag-history">
        {history.map((item, index) => (
          <article className="panel rag-answer-card" key={`${item.question}-${index}`}>
            <div className="rag-question"><span>问</span><h3>{item.question}</h3></div>
            <div className="rag-answer"><Sparkles size={18} /><p>{item.answer}</p></div>
            {item.warning && <div className="request-warning"><CircleAlert size={15} /><span>{item.warning}</span></div>}
            {item.sources?.length > 0 && (
              <div className="rag-sources">
                <span className="section-kicker">检索依据 · {item.sources.length} 个片段</span>
                {item.sources.map((source, sourceIndex) => (
                  <div className="rag-source" key={source.id}>
                    <strong>[{sourceIndex + 1}] {source.filename} · 第 {source.page}{source.pageEnd > source.page ? `-${source.pageEnd}` : ""} 页 · 精排 {Number(source.score || 0).toFixed(3)}</strong>
                    {source.headingPath && <span className="rag-heading-path">{source.headingPath}</span>}
                    <p>{source.quote}</p>
                    {!!source.matchedKeywords?.length && <div className="rag-keywords">{source.matchedKeywords.map((word) => <span key={word}>{word}</span>)}</div>}
                    {source.documentId && <a href={`/api/documents/${source.documentId}/file`}>打开原始资料</a>}
                  </div>
                ))}
              </div>
            )}
            {item.debug && (
              <details className="rag-debug">
                <summary>检索调试 · {item.debug.candidateCount} 个候选 · 阈值 {item.debug.threshold}</summary>
                <div className="rag-debug-list">
                  {item.debug.candidates.map((candidate) => (
                    <article key={candidate.id}>
                      <header>
                        <strong>#{candidate.rank} {candidate.filename} · 第{candidate.page}{candidate.pageEnd > candidate.page ? `-${candidate.pageEnd}` : ""}页</strong>
                        <span>向量 {candidate.vectorScore} · 关键词 {candidate.keywordScore} · 融合 {candidate.fusionScore} · 精排 {candidate.rerankScore ?? "未进前5"}</span>
                      </header>
                      {candidate.headingPath && <div className="rag-debug-heading">章节：{candidate.headingPath}</div>}
                      {!!candidate.matchedKeywords?.length && <div className="rag-keywords">{candidate.matchedKeywords.map((word) => <span key={word}>{word}</span>)}</div>}
                      <div className="rag-debug-copy"><strong>命中子块</strong><pre>{candidate.content}</pre></div>
                      {candidate.parentContent && candidate.parentContent !== candidate.content && <div className="rag-debug-copy"><strong>章节父块</strong><pre>{candidate.parentContent}</pre></div>}
                    </article>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
        {!history.length && (
          <div className="empty-state">
            <div><Search size={28} /></div>
            <h3>{hasSources ? "从你的资料开始提问" : "资料库还是空的"}</h3>
            <p>{hasSources ? "回答会显示命中的文件、页码和原文片段。" : "上传 PDF、DOCX、TXT 或 Markdown 后即可使用 RAG 问答。"}</p>
          </div>
        )}
      </div>
    </>
  );
}
