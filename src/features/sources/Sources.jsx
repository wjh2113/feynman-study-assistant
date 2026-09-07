import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { ConfirmDialog } from "../../components/ConfirmDialog.jsx";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap
} from "../../components/icons.jsx";
import { formatSize } from "../../lib/format.js";
import { outlineForSource } from "../../lib/documentOutline.js";
import { dedupeAnalysisSources } from "../../lib/analysis-sources.mjs";
import { resolveMapAvailability } from "../../lib/map-availability.js";
import { decodeUploadName } from "../../lib/filename-encoding.js";
import { analyzeBackground } from "../../api/ingest.js";
import { deleteDocument, getProject, reindexProject, resummarizeProjectBackground, syncProjectSources } from "../../api/projects.js";
import { FileTypeIcon } from "./FileTypeIcon.jsx";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function projectAfterSourceDelete(project, source) {
  const sources = project.analysis?.sources || [];
  const remainingSources = sources.filter((item) => item.id !== source.id && item.name !== source.name);
  const deletedName = String(source.name || "");
  const removedIds = new Set([source.id].filter(Boolean));
  const willQueueRebuild = remainingSources.length > 0;
  return {
    ...project,
    documentCount: Math.max(0, Number(project.documentCount || sources.length) - 1),
    description: remainingSources.length
      ? "资料已变更，正在后台清理向量并重建知识地图…"
      : (project.learningPlan?.summary || "上传学习资料后，AI 将生成学科知识地图。"),
    progress: remainingSources.length ? Math.min(Number(project.progress || 0), 15) : 0,
    analysis: {
      ...(project.analysis || {}),
      sources: remainingSources,
      summary: "",
      highValue: [],
      modules: [],
      tacitKnowledge: [],
      scenarios: [],
      questions: [],
      documentSummaries: (project.analysis?.documentSummaries || []).filter(
        (item) => String(item.filename || item.name || "") !== deletedName
      ),
      needsResummarize: remainingSources.length > 0 && !willQueueRebuild,
      contentAnalysisStatus: willQueueRebuild ? "pending" : "ready",
      contentAnalysisError: null
    },
    practiceDocumentIds: (project.practiceDocumentIds || []).filter((id) => !removedIds.has(id)),
    blindspots: (project.blindspots || []).filter((item) => {
      const ids = Array.isArray(item.documentIds) ? item.documentIds : [];
      if (ids.length) return ids.every((id) => !removedIds.has(id));
      return !String(item.source || "").startsWith(deletedName);
    })
  };
}

export function Sources({
  project,
  updateProject,
  navigate,
  showToast,
  onTaskStarted,
  analysisTask
}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openSource, setOpenSource] = useState(null);
  const [bankFocusId, setBankFocusId] = useState(null);
  const [deleteSourceId, setDeleteSourceId] = useState(null);
  const [deletingSourceId, setDeletingSourceId] = useState(null);
  const [reindexing, setReindexing] = useState(false);
  const [resummarizing, setResummarizing] = useState(false);
  const fileInput = useRef();
  const prevSourceCountRef = useRef(0);
  const mapNotifyRef = useRef(null);
  const bankNotifyRef = useRef(null);
  const rawSources = project.analysis?.sources || [];
  const sources = useMemo(() => dedupeAnalysisSources(rawSources), [rawSources]);
  const mapAvailability = useMemo(() => resolveMapAvailability(project), [project]);
  const mapNeedsGenerate = mapAvailability.kind === "sources-without-map";
  const hasDuplicateSources = rawSources.length > sources.length;
  const hasPersistedSources = Number(project.documentCount || 0) > 0 || sources.some((source) => source.downloadUrl);
  const mapStatus = project.analysis?.contentAnalysisStatus;
  const mapPending = mapStatus === "pending" || mapStatus === "running";
  const mapFailed = mapStatus === "failed";
  const mapBusy = mapPending || resummarizing;
  const resummarizeLabel = mapBusy ? "正在生成知识地图…" : "重新总结知识地图";
  const persistedSourceNames = useMemo(() => new Set(sources.map((source) => source.name)), [sources]);
  const ingestingFilenames = useMemo(() => {
    if (!analysisTask?.filenames?.length) return [];
    return analysisTask.filenames
      .map((name) => decodeUploadName(name))
      .filter((name) => !persistedSourceNames.has(name));
  }, [analysisTask, persistedSourceNames]);
  const ingestingStageLabel = useMemo(() => {
    const labels = {
      queued: "排队中",
      ocr: "OCR 解析中",
      embedding: "生成向量中",
      storage: "写入索引中",
      content: "生成知识地图中",
      completed: "即将完成"
    };
    return labels[analysisTask?.stage] || "后台解析中";
  }, [analysisTask?.stage]);
  const listSourceCount = sources.length + ingestingFilenames.length;
  const bankPending = useMemo(
    () => sources.some((source) => source.questionBankMeta?.pendingLlm),
    [sources]
  );
  const bankTotal = useMemo(
    () => sources.reduce((sum, source) => sum + (Array.isArray(source.questionBank) ? source.questionBank.length : 0), 0),
    [sources]
  );

  useEffect(() => {
    if (mapPending) setResummarizing(false);
  }, [mapPending]);

  useEffect(() => {
    if (!mapPending) mapNotifyRef.current = null;
  }, [mapPending]);

  useEffect(() => {
    if ((!mapPending && !bankPending) || !project.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getProject(project.id);
        if (cancelled || !data.project) return;
        updateProject(data.project);
        const nextStatus = data.project.analysis?.contentAnalysisStatus;
        if (mapPending) {
          if (nextStatus === "ready" && mapNotifyRef.current !== "ready") {
            mapNotifyRef.current = "ready";
            showToast("知识地图已重新生成，可前往查看");
          } else if (nextStatus === "failed" && mapNotifyRef.current !== "failed") {
            mapNotifyRef.current = "failed";
            showToast(data.project.analysis?.contentAnalysisError || "知识地图生成失败，请重试");
          }
        }
        const stillPending = (data.project.analysis?.sources || []).some(
          (source) => source.questionBankMeta?.pendingLlm
        );
        if (bankPending && !stillPending && bankNotifyRef.current !== "ready") {
          bankNotifyRef.current = "ready";
          showToast("资料题库已生成，可在资料列表中点击「查看题库」");
        }
      } catch {
        // keep current project state
      }
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mapPending, bankPending, project.id, updateProject, showToast]);

  useEffect(() => {
    if (bankPending) bankNotifyRef.current = null;
  }, [bankPending]);

  useEffect(() => {
    if (!bankFocusId || openSource !== bankFocusId) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(`question-bank-${bankFocusId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [bankFocusId, openSource]);

  useEffect(() => {
    if (!analysisTask || !project.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getProject(project.id);
        if (!cancelled && data.project) updateProject(data.project);
      } catch {
        // keep current project state
      }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [analysisTask?.id, project.id, updateProject]);

  useEffect(() => {
    if (!project.id || !hasDuplicateSources) return undefined;
    let cancelled = false;
    syncProjectSources(project.id)
      .then((data) => {
        if (!cancelled && data.project) updateProject(data.project);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id, hasDuplicateSources, updateProject]);

  useEffect(() => {
    const count = sources.length;
    if (count > prevSourceCountRef.current && count > 0) {
      const newest = sources[sources.length - 1];
      if (newest?.id) setOpenSource(newest.id);
    }
    prevSourceCountRef.current = count;
  }, [sources]);

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const accepted = [];
    let rejectedType = 0;
    const oversized = [];
    for (const file of incoming) {
      if (!/\.(pdf|docx|txt|md|markdown|png|jpe?g|webp)$/i.test(file.name)) {
        rejectedType += 1;
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        oversized.push(file.name);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) setFiles((current) => [...current, ...accepted].slice(0, 12));
    if (oversized.length) {
      showToast(`单个文件不能超过 100 MB：${oversized.slice(0, 2).join("、")}${oversized.length > 2 ? " 等" : ""}`);
    } else if (rejectedType) {
      showToast("支持 PDF、DOCX、TXT、Markdown、PNG、JPG 和 WebP");
    }
  };

  const analyze = async (overrideFiles) => {
    const selectedFiles = Array.isArray(overrideFiles) ? overrideFiles : files;
    if (!selectedFiles.length && hasPersistedSources) {
      navigate("map");
      return;
    }
    if (!selectedFiles.length) return showToast("请先添加至少一份学习资料");
    const oversized = selectedFiles.filter((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized.length) {
      return showToast(`单个文件不能超过 100 MB：${oversized[0].name}${oversized.length > 1 ? " 等" : ""}`);
    }
    if (analysisTask) return showToast("当前项目已有资料正在后台解析");
    setLoading(true);
    setUploadProgress(0);
    try {
      const body = new FormData();
      selectedFiles.forEach((file) => body.append("files", file));
      body.append("projectId", project.id);
      body.append("title", project.title);
      body.append("mode", project.mode);
      const data = await analyzeBackground(body, {
        onUploadProgress: (percent) => setUploadProgress(percent)
      });
      if (!data.task?.id) throw new Error("后台任务创建失败");
      onTaskStarted(data.task, project.id, selectedFiles.map((file) => file.name), data.ingestionId);
      showToast("资料已上传，正在后台解析；完成后会通知你");
      setFiles([]);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const deleteSource = async (source) => {
    setDeleteSourceId(null);
    const previousProject = project;
    updateProject(projectAfterSourceDelete(project, source));
    if (openSource === source.id) setOpenSource(null);
    setDeletingSourceId(source.id);
    showToast(`正在删除「${source.name}」…`);
    try {
      const data = await deleteDocument(project.id, source.id);
      updateProject(data.project);
      if (data.queued || data.resummarize?.queued) {
        showToast(`已移除「${source.name}」，正在后台清理向量并重建知识地图`);
      } else if (data.mapCleared && data.needsResummarize) {
        showToast(`已删除「${source.name}」，知识地图已清空，请重新总结剩余资料`);
      } else if (data.mapCleared) {
        showToast(`已删除「${source.name}」及向量分块，知识地图已清空`);
      } else {
        showToast(`已删除「${source.name}」`);
      }
    } catch (error) {
      updateProject(previousProject);
      showToast(error.message);
    } finally {
      setDeletingSourceId(null);
    }
  };

  const reindexSources = async () => {
    setReindexing(true);
    try {
      const data = await reindexProject(project.id);
      updateProject(data.project);
      showToast(`已重建 ${data.documents} 份资料的检索索引：${data.parents} 个父块、${data.chunks} 个子块`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setReindexing(false);
    }
  };

  const resummarizeSources = async () => {
    if (mapPending) {
      showToast("知识地图正在后台生成，请稍候");
      return;
    }
    const previousProject = project;
    setResummarizing(true);
    updateProject({
      ...project,
      description: "正在后台重新总结知识地图…",
      analysis: {
        ...(project.analysis || {}),
        contentAnalysisStatus: "running",
        contentAnalysisError: null,
        needsResummarize: false
      }
    });
    try {
      await resummarizeProjectBackground(project.id);
      showToast("已开始后台重新总结知识地图，可继续使用其他功能");
    } catch (error) {
      updateProject(previousProject);
      showToast(error.message);
      setResummarizing(false);
    }
  };

  const renderPendingIngestion = (filename, index) => (
    <div className="file-row file-row-pending" key={`ingesting-${filename}-${index}`}>
      <FileTypeIcon name={filename} />
      <div className="file-copy">
        <strong>{filename}</strong>
        <span>{ingestingStageLabel} · 入库完成后可展开查看大纲</span>
      </div>
      <span className="source-pending-badge"><Spinner /> 解析中</span>
    </div>
  );

  const renderSource = (source) => {
    const expanded = openSource === source.id;
    const report = source.parseReport || {};
    const outline = outlineForSource(source);
    const stats = outline.stats || {};
    const bank = Array.isArray(source.questionBank) ? source.questionBank : [];
    const bankMeta = source.questionBankMeta || {};
    const bankPendingLlm = Boolean(bankMeta.pendingLlm);
    const bankStatusLabel = bankPendingLlm
      ? `题库 ${bank.length} 题 · 正式题生成中`
      : bankMeta.generated
        ? `题库 ${bank.length} 题`
        : bank.length
          ? `题库 ${bank.length} 题 · 临时`
          : "暂无题库";
    const ocrLabel =
      report.ocrStatus === "ready" ? `OCR ${report.imagesOcrd || 0}/${report.imagesFound || report.imagesOcrd || 0} 张`
        : report.ocrStatus === "not_configured" ? "OCR 待配置"
          : report.ocrStatus === "partial" ? `OCR 部分完成 ${report.imagesOcrd || 0}/${report.imagesFound || "?"}`
            : "无需 OCR";
    const completenessLabel =
      outline.completeness === "complete" ? "解析较完整"
        : outline.completeness === "empty" ? "未提取到文本"
          : "解析可能不完整";
    const openBank = () => {
      setOpenSource(source.id);
      setBankFocusId(source.id);
    };
    return (
      <div className={`source-item ${expanded ? "expanded" : ""}`} key={source.id}>
        <div className="file-row">
          <FileTypeIcon name={source.name} />
          <div className="file-copy">
            <strong>{source.name}</strong>
            <span>
              {source.type} · {source.pages || 1} 页
              {source.chunks ? ` · ${source.chunks} 个检索分块` : ""}
              {" · "}{ocrLabel}
              {" · "}{bankStatusLabel}
            </span>
          </div>
          <button type="button" className="parse-toggle" onClick={() => {
            setBankFocusId(null);
            setOpenSource(expanded ? null : source.id);
          }}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {expanded ? "收起" : "查看大纲"}
          </button>
          <button type="button" className="parse-toggle bank-toggle" onClick={openBank}>
            <Sparkles size={14} />
            查看题库{bank.length ? `（${bank.length}）` : ""}
          </button>
          {source.downloadUrl ? (
            <a className="icon-btn" href={source.downloadUrl} title="下载原始资料"><Download size={17} /></a>
          ) : null}
          <button
            type="button"
            className="icon-btn source-delete-btn"
            aria-label={`删除资料 ${source.name}`}
            title={deletingSourceId === source.id ? "正在删除…" : "删除资料"}
            disabled={deletingSourceId === source.id}
            onClick={() => setDeleteSourceId(source.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {expanded && (
          <div className="parse-detail">
            <div className="parse-outline">
              <div className="parse-outline-head">
                <span className="section-kicker">资料大纲</span>
                <b className={`parse-completeness ${outline.completeness || "partial"}`}>{completenessLabel}</b>
              </div>
              <p className="parse-outline-tip">用大纲核对是否解析完整：标题是否齐全、字数与图片 OCR 是否合理。</p>
              <div className="parse-stats">
                <span>原生文本 <b>{stats.nativeCharacters || 0}</b> 字</span>
                <span>OCR 文本 <b>{stats.ocrCharacters || 0}</b> 字</span>
                <span>入库分块 <b>{stats.chunkCount || source.chunks || 0}</b> 个</span>
                <span>检测图片 <b>{stats.imagesFound || 0}</b> 张</span>
                <span>已 OCR <b>{stats.imagesOcrd || 0}</b> 张</span>
                {stats.imagesSkipped > 0 && <span>未 OCR <b>{stats.imagesSkipped}</b> 张</span>}
                {stats.indexedCharacters > 0 && <span>索引字符 <b>{stats.indexedCharacters}</b></span>}
              </div>
              {outline.sections?.length ? (
                <ol className="parse-outline-list">
                  {outline.sections.map((section, index) => (
                    <li key={`${section.title}-${index}`} style={{ paddingLeft: `${Math.max(0, (section.level || 1) - 1) * 12}px` }}>
                      <span>{section.title}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="parse-outline-empty">暂未识别出清晰章节标题，请向下查看原文预览。</p>
              )}
            </div>
            <div className="parse-summary">
              <span className="section-kicker">本资料总结</span>
              <h3>{source.summary?.summary || "尚未生成总结"}</h3>
              {!!source.summary?.keyPoints?.length && (
                <ul>{source.summary.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
              )}
              <p className="verification-note">{source.summary?.verificationNote}</p>
            </div>

            <div
              className={`parse-question-bank${bankFocusId === source.id ? " is-focused" : ""}`}
              id={`question-bank-${source.id}`}
            >
              <div className="parse-outline-head">
                <span className="section-kicker">费曼题库</span>
                <b>{bankStatusLabel}</b>
              </div>
              <p className="parse-outline-tip">
                上传入库后为每份资料生成 10–30 道题；费曼对练时会按所选资料从这些题库中随机抽取。
                {bankMeta.capability ? ` 当前生成能力：${bankMeta.capability}` : ""}
                {bankMeta.fallback ? "（含本地兜底题）" : ""}
              </p>
              {bankPendingLlm && (
                <div className="request-warning" role="status" style={{ margin: "0 0 12px" }}>
                  <Spinner />
                  <span>正式题库正在后台生成，可先查看临时题目。</span>
                </div>
              )}
              {bank.length ? (
                <ol className="question-bank-list">
                  {bank.map((item, index) => (
                    <li key={item.id || `${source.id}-q-${index}`}>
                      <strong>{index + 1}. {item.question}</strong>
                      <span>
                        {item.concept ? `概念：${item.concept}` : "概念：未标注"}
                        {item.why ? ` · ${item.why}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="parse-outline-empty">本题库尚未生成。解析完成后会自动出现，也可稍后再刷新页面。</p>
              )}
            </div>

            {(!!report.warnings?.length || !!outline.notes?.length) && (
              <div className="parse-warning"><CircleAlert size={15} /><div>{[...(report.warnings || []), ...(outline.notes || []).filter((note) => !(report.warnings || []).includes(note))].map((warning) => <p key={warning}>{warning}</p>)}</div></div>
            )}
            <div className="parsed-preview">
              <span className="section-kicker">解析原文预览（用于核对）</span>
              <pre>{source.parsedPreview || "没有提取到可预览的文字。"}</pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeading
        eyebrow="构建专属语料库"
        title="学科资料"
        description="上传课件与笔记。解析完成后可展开查看大纲与费曼题库；再进入知识地图。练习时勾选资料，对练会从对应题库抽题。"
        action={<button className="primary-btn" onClick={analyze} disabled={loading || !!analysisTask}>{loading ? <Spinner /> : <Sparkles size={17} />}{loading ? "正在上传…" : analysisTask ? "后台解析中" : files.length ? `分析 ${files.length} 份新资料` : "查看知识地图"}</button>}
      />

      <div
        className="upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
      >
        <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp" onChange={(event) => addFiles(event.target.files)} />
        <div className="upload-icon"><UploadCloud size={28} /></div>
        <h3>拖入学习资料，或点击选择文件</h3>
        <p>支持 PDF、DOCX、TXT、Markdown、PNG、JPG、WebP · 单个文件不超过 100 MB</p>
        <div className="upload-hint"><Zap size={14} /> PDF 扫描页、文档截图和单独图片会进入 OCR 识别流程</div>
      </div>

      {loading && (
        <div className="analysis-task-card" role="status">
          <Spinner />
          <div>
            <strong>{uploadProgress > 0 ? `正在上传资料（${uploadProgress}%）` : "正在上传资料…"}</strong>
            <span>{files.length} 份 · 上传完成后将自动进入后台解析，可继续使用其他功能</span>
          </div>
          <div className={`analysis-task-progress${uploadProgress > 0 ? "" : " is-indeterminate"}`}>
            <i style={{ width: `${Math.max(uploadProgress, uploadProgress > 0 ? uploadProgress : 35)}%` }} />
          </div>
          <b>{uploadProgress > 0 ? `${uploadProgress}%` : "…"}</b>
          <div className="analysis-stage-list">
            <span className="active">上传</span>
            <span>OCR</span>
            <span>Embedding</span>
            <span>入库</span>
          </div>
        </div>
      )}

      {!loading && analysisTask && (
        <div className="analysis-task-card" role="status">
          <Spinner />
          <div><strong>{analysisTask.label || "资料正在后台解析"}</strong><span>可以继续使用其他功能，完成后会发送通知</span></div>
          <div className="analysis-task-progress"><i style={{ width: `${analysisTask.progress || 3}%` }} /></div>
          <b>{Math.max(3, analysisTask.progress || 0)}%</b>
          <div className="analysis-stage-list">
            {[['ocr', 'OCR'], ['embedding', 'Embedding'], ['storage', '入库']].map(([stage, label]) => (
              <span className={analysisTask.stage === stage || (stage === 'storage' && analysisTask.stage === 'completed') ? "active" : ""} key={stage}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {mapPending && (
        <div className="request-warning" role="status">
          <Spinner />
          <span>
            {project.description?.includes("资料已变更")
              ? "正在后台重嵌剩余资料并重建知识地图…"
              : project.description?.includes("重新总结")
                ? "正在后台重新总结知识地图…"
                : "资料已可检索，知识地图正在后台用 quality-chat 生成…"}
          </span>
        </div>
      )}

      {bankPending && (
        <div className="request-warning" role="status">
          <Spinner />
          <span>资料题库正在后台生成正式题目，可先在资料列表中查看临时题。</span>
        </div>
      )}

      {!bankPending && bankTotal > 0 && sources.length > 0 && (
        <div className="question-bank-banner" role="status">
          <Sparkles size={16} />
          <div>
            <strong>已入库题库共 {bankTotal} 题</strong>
            <span>在下方每份资料点击「查看题库」即可浏览；费曼对练会按所选资料抽题。</span>
          </div>
        </div>
      )}

      {mapNeedsGenerate && !mapPending && !mapFailed && !project.analysis?.needsResummarize && (
        <div className="request-warning">
          <CircleAlert size={16} />
          <span>{mapAvailability.description}</span>
          <button className="secondary-btn" onClick={resummarizeSources} disabled={mapBusy || loading}>
            {mapBusy ? <Spinner /> : <Sparkles size={15} />} {resummarizeLabel}
          </button>
        </div>
      )}

      {mapFailed && (
        <div className="request-warning">
          <CircleAlert size={16} />
          <span>{project.analysis?.contentAnalysisError || "知识地图生成失败，可点击重新总结重试。"}</span>
          <button className="secondary-btn" onClick={resummarizeSources} disabled={mapBusy || loading}>
            {mapBusy ? <Spinner /> : <Sparkles size={15} />} {resummarizeLabel}
          </button>
        </div>
      )}

      {project.analysis?.needsResummarize && sources.length > 0 && (
        <div className="request-warning">
          <CircleAlert size={16} />
          <span>资料已变更，知识地图已清空，请重新总结剩余资料。</span>
          <button className="secondary-btn" onClick={resummarizeSources} disabled={mapBusy || loading}>
            {mapBusy ? <Spinner /> : <Sparkles size={15} />} {resummarizeLabel}
          </button>
        </div>
      )}

      {files.length > 0 && (
        <section className="panel file-panel pending-files">
          <div className="panel-head"><div><span className="section-kicker">等待分析</span><h3>{files.length} 份新资料</h3></div></div>
          {files.map((file, index) => (
            <div className="file-row" key={`${file.name}-${index}`}>
              <FileTypeIcon name={file.name} />
              <div className="file-copy"><strong>{file.name}</strong><span>{formatSize(file.size)} · 将参与本次分析</span></div>
              <select aria-label="资料类型"><option>自动识别</option><option>课件</option><option>录音转写</option><option>教材</option><option>个人笔记</option></select>
              <button className="icon-btn" onClick={(event) => { event.stopPropagation(); setFiles((items) => items.filter((_, i) => i !== index)); }}><X size={17} /></button>
            </div>
          ))}
        </section>
      )}

      <section className="panel file-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">{hasPersistedSources ? "已入库" : ingestingFilenames.length ? "解析中 / 已入库" : "资料列表"}</span>
            <h3>{listSourceCount} 份资料{ingestingFilenames.length ? `（${ingestingFilenames.length} 份解析中）` : ""}</h3>
          </div>
          <div className="source-panel-actions">
            {hasPersistedSources && !!sources.length && (
              <button className="secondary-btn" onClick={resummarizeSources} disabled={mapBusy || loading}>
                {mapBusy ? <Spinner /> : <Sparkles size={14} />}
                {resummarizeLabel}
              </button>
            )}
            {hasPersistedSources && !!sources.length && (
              <button className="secondary-btn" onClick={reindexSources} disabled={reindexing}>
                {reindexing ? <Spinner /> : <RotateCcw size={14} />}
                {reindexing ? "正在重建索引…" : "重建检索索引"}
              </button>
            )}
            <button className="filter-btn">全部类型 <ChevronDown size={14} /></button>
          </div>
        </div>
        {sources.map(renderSource)}
        {ingestingFilenames.map(renderPendingIngestion)}
        {!listSourceCount && <EmptyMini text="还没有已解析的资料。" />}
        {!sources.length && ingestingFilenames.length > 0 && (
          <p className="source-list-hint">资料尚未入库，解析完成后会自动出现在列表中。</p>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(deleteSourceId)}
        tone="danger"
        title={`确认删除「${sources.find((item) => item.id === deleteSourceId)?.name || "这份资料"}」？`}
        description="将删除原文件与对应向量；剩余资料会在后台重新分块嵌入，并重建知识地图。此操作无法撤销。"
        confirmLabel="确认删除"
        cancelLabel="取消"
        onCancel={() => {
          if (!deletingSourceId) setDeleteSourceId(null);
        }}
        onConfirm={() => {
          const source = sources.find((item) => item.id === deleteSourceId);
          if (!source || deletingSourceId) return;
          setDeleteSourceId(null);
          deleteSource(source);
        }}
      />
    </>
  );
}
