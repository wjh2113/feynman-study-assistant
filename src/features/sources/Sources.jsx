import React, { useRef, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap
} from "../../components/icons.jsx";
import { formatSize } from "../../lib/format.js";
import { analyzeBackground } from "../../api/ingest.js";
import { deleteDocument, reindexProject } from "../../api/projects.js";
import { FileTypeIcon } from "./FileTypeIcon.jsx";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
  const [openSource, setOpenSource] = useState(null);
  const [deleteSourceId, setDeleteSourceId] = useState(null);
  const [deletingSourceId, setDeletingSourceId] = useState(null);
  const [reindexing, setReindexing] = useState(false);
  const fileInput = useRef();
  const sources = project.analysis?.sources || [];
  const hasPersistedSources = Number(project.documentCount || 0) > 0 || sources.some((source) => source.downloadUrl);

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
    try {
      const body = new FormData();
      selectedFiles.forEach((file) => body.append("files", file));
      body.append("projectId", project.id);
      body.append("title", project.title);
      body.append("mode", project.mode);
      const data = await analyzeBackground(body);
      if (!data.task?.id) throw new Error("后台任务创建失败");
      onTaskStarted(data.task, project.id, selectedFiles.map((file) => file.name), data.ingestionId);
      showToast("资料已上传，正在后台解析；完成后会通知你");
      setFiles([]);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const importSampleMaterials = () => {
    const samples = [
      new File([`# AI 产品方法论\n\nAI 产品不是给旧功能增加聊天框，而是从模型能力出发重构用户任务链路。\n\n## 能力边界\n高风险回答必须设置人工确认条件，并向用户展示模型的不确定性。\n\n## 数据飞轮\n产品使用产生反馈，反馈改善模型，模型改进后带来更多有效使用。`], "AI产品方法论示例.md", { type: "text/markdown" }),
      new File([`# 课堂经验\n\n不要掩盖模型的不确定性，要设计处理不确定性的体验。上线前先明确错误成本和人工介入阈值。\n\n点赞点踩不一定是高质量反馈，用户如何修改模型输出往往更能反映真实偏好。`], "课堂经验示例.md", { type: "text/markdown" }),
      new File([`# 个人学习笔记\n\n先验证最危险的假设，再增加投入。产品进展应以关键不确定性是否减少来判断。\n\n价值指标必须对应用户任务的最终结果，每次真实使用都应产生可学习的反馈信号。`], "个人学习笔记示例.md", { type: "text/markdown" })
    ];
    setFiles(samples);
    analyze(samples);
  };

  const deleteSource = async (source) => {
    setDeletingSourceId(source.id);
    try {
      const data = await deleteDocument(project.id, source.id);
      updateProject(data.project);
      if (openSource === source.id) setOpenSource(null);
      setDeleteSourceId(null);
      showToast(`已删除“${source.name}”及其检索分块`);
    } catch (error) {
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

  const renderSource = (source) => {
    const expanded = openSource === source.id;
    const report = source.parseReport || {};
    const ocrLabel =
      report.ocrStatus === "ready" ? `OCR ${report.imagesOcrd || 0} 张`
        : report.ocrStatus === "not_configured" ? "OCR 待配置"
          : report.ocrStatus === "partial" ? "OCR 部分完成" : "无需 OCR";
    return (
      <div className={`source-item ${expanded ? "expanded" : ""}`} key={source.id}>
        <div className="file-row">
          <FileTypeIcon name={source.name} />
          <div className="file-copy"><strong>{source.name}</strong><span>{source.type} · {source.pages || 1} 页 {source.chunks ? `· ${source.chunks} 个检索分块` : ""} · {ocrLabel}</span></div>
          <button className="parse-toggle" onClick={() => setOpenSource(expanded ? null : source.id)}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {expanded ? "收起解析" : "查看解析"}
          </button>
          {source.downloadUrl ? (
            <a className="icon-btn" href={source.downloadUrl} title="下载原始资料"><Download size={17} /></a>
          ) : <button className="icon-btn"><MoreHorizontal size={18} /></button>}
          {hasPersistedSources && <button
            className="icon-btn source-delete-btn"
            aria-label={`删除资料 ${source.name}`}
            title="删除资料"
            onClick={() => setDeleteSourceId(source.id)}
          >
            <Trash2 size={16} />
          </button>}
        </div>
        {deleteSourceId === source.id && (
          <div className="source-delete-confirm" role="alert">
            <div>
              <strong>确认删除“{source.name}”？</strong>
              <span>原始文件、资料记录和对应的向量检索分块都会删除，此操作无法撤销。</span>
            </div>
            <button className="secondary-btn" onClick={() => setDeleteSourceId(null)} disabled={deletingSourceId === source.id}>取消</button>
            <button className="danger-btn" onClick={() => deleteSource(source)} disabled={deletingSourceId === source.id}>
              {deletingSourceId === source.id ? <Spinner /> : <Trash2 size={15} />}
              {deletingSourceId === source.id ? "正在删除…" : "确认删除"}
            </button>
          </div>
        )}
        {expanded && (
          <div className="parse-detail">
            <div className="parse-summary">
              <span className="section-kicker">本资料总结</span>
              <h3>{source.summary?.summary || "尚未生成总结"}</h3>
              {!!source.summary?.keyPoints?.length && (
                <ul>{source.summary.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
              )}
              <p className="verification-note">{source.summary?.verificationNote}</p>
            </div>
            <div className="parse-stats">
              <span>原生文本 <b>{report.nativeCharacters || 0}</b> 字</span>
              <span>OCR 文本 <b>{report.ocrCharacters || 0}</b> 字</span>
              <span>检测图片 <b>{report.imagesFound || 0}</b> 张</span>
              <span>已 OCR <b>{report.imagesOcrd || 0}</b> 张</span>
            </div>
            {!!report.warnings?.length && (
              <div className="parse-warning"><CircleAlert size={15} /><div>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>
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
        eyebrow="第一步 · 构建专属语料库"
        title="学科资料"
        description="上传课件与笔记。解析完成后先核对每份资料的总结、关键点和原文预览，再进入知识地图；练习时再勾选要使用的资料。"
        action={<button className="primary-btn" onClick={analyze} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={17} />}{loading ? "正在提炼…" : files.length ? `分析 ${files.length} 份新资料` : "查看知识地图"}</button>}
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

      {analysisTask && (
        <div className="analysis-task-card" role="status">
          <Spinner />
          <div><strong>{analysisTask.label || "资料正在后台解析"}</strong><span>可以继续使用其他功能，完成后会发送通知</span></div>
          <div className="analysis-task-progress"><i style={{ width: `${analysisTask.progress || 3}%` }} /></div>
          <b>{Math.max(3, analysisTask.progress || 0)}%</b>
          <div className="analysis-stage-list">
            {[['ocr', 'OCR'], ['embedding', 'Embedding'], ['content', '内容分析'], ['storage', '入库']].map(([stage, label]) => (
              <span className={analysisTask.stage === stage ? "active" : ""} key={stage}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {!hasPersistedSources && sources.length > 0 && (
        <div className="request-warning">
          <CircleAlert size={16} />
          <span>下方内容是产品演示，不是已上传资料，暂不能参与检索。</span>
          <button className="secondary-btn" onClick={importSampleMaterials} disabled={loading}>
            {loading ? <Spinner /> : <UploadCloud size={15} />} 导入可检索示例资料
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
          <div><span className="section-kicker">{hasPersistedSources ? "已入库" : "产品演示"}</span><h3>{sources.length} 份资料</h3></div>
          <div className="source-panel-actions">
            {hasPersistedSources && !!sources.length && <button className="secondary-btn" onClick={reindexSources} disabled={reindexing}>{reindexing ? <Spinner /> : <RotateCcw size={14} />}{reindexing ? "正在重建索引…" : "重建检索索引"}</button>}
            <button className="filter-btn">全部类型 <ChevronDown size={14} /></button>
          </div>
        </div>
        {sources.map(renderSource)}
        {!sources.length && <EmptyMini text="还没有已解析的资料。" />}
      </section>
    </>
  );
}
