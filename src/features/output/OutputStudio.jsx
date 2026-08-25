import React, { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog.jsx";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  Archive,
  BookMarked,
  Download,
  FileText,
  MessageCircleQuestion,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Target
} from "../../components/icons.jsx";
import { generateOnePager } from "../../api/projects.js";
import { MindMap } from "./MindMap.jsx";

function overlapsSelection(item, selectedDocumentIds = []) {
  const ids = Array.isArray(item?.documentIds) ? item.documentIds : [];
  if (!ids.length) return true;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

export function OutputStudio({ project, selectedDocumentIds = [], updateProject, saveProjectPatch, refreshProject, showToast }) {
  const [loading, setLoading] = useState(false);
  const [pager, setPager] = useState(project?.onePager || null);
  const [edited, setEdited] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [tab, setTab] = useState("pager");
  const sessions = (project.sessions || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const blindspots = (project.blindspots || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const practiceDocs = (project.analysis?.sources || []).filter((source) => selectedDocumentIds.includes(source.id));
  const docsLabel = practiceDocs.length
    ? practiceDocs.map((doc) => doc.name).slice(0, 2).join("、") + (practiceDocs.length > 2 ? " 等" : "")
    : project.title;

  useEffect(() => {
    setPager(project?.onePager || null);
    setEdited(false);
  }, [project.id, project?.onePager]);

  if (!selectedDocumentIds.length) return <EmptyMini text="请先上传资料并完成解析，再生成学习成果" />;

  const runGenerate = async () => {
    setConfirmRegenerate(false);
    setLoading(true);
    try {
      const data = await generateOnePager(project, {
        documentIds: selectedDocumentIds,
        practiceDocumentIds: selectedDocumentIds,
        practiceDocs
      });
      setPager(data);
      setEdited(false);
      if (saveProjectPatch) {
        await saveProjectPatch({ onePager: data });
      } else {
        updateProject({ onePager: data });
      }
      await refreshProject?.(project.id);
      showToast(data.notice || (data.degraded ? "模型较慢，已先生成可用大纲" : "学习成果已生成"));
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (pager && edited) {
      setConfirmRegenerate(true);
      return;
    }
    await runGenerate();
  };

  const saveEdits = async () => {
    if (!pager) return;
    if (saveProjectPatch) {
      await saveProjectPatch({ onePager: pager });
    } else {
      updateProject({ onePager: pager });
    }
    setEdited(false);
    showToast("一页纸编辑已保存");
  };

  const updateTakeaway = (index, value) => {
    setPager((current) => {
      if (!current) return current;
      const next = [...(current.takeaways || [])];
      next[index] = value;
      return { ...current, takeaways: next };
    });
    setEdited(true);
  };

  const exportMarkdown = () => {
    if (!pager) return;
    const markdown = `# ${pager.title}\n\n> ${pager.thesis}\n\n## 三个关键收获\n\n${(pager.takeaways || []).map((item) => `- ${item}`).join("\n")}\n\n## 立即行动\n\n${pager.action}\n\n## 我的复盘\n\n${pager.reflection}\n`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pager.title || "学习一页纸"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Markdown 已导出");
  };

  const romanLabels = ["I", "II", "III", "IV", "V", "VI"];

  return (
    <>
      <PageHeading
        eyebrow="第五步 · 把理解变成作品"
        title={`${project.title} 的学习成果`}
        description={`把已选资料、你的解释和修正后的思考，沉淀为一份真正属于你的成果。`}
      />

      {pager && (
        <div className="output-hero">
          <div className="complete-ring sm">100<small>%</small></div>
          <div>
            <strong>学习成果完成度</strong>
            <p>太棒了！你已完成全部内容</p>
            <button className="text-btn" type="button">查看生成记录 →</button>
          </div>
          <div className="output-hero-actions">
            {edited && <button className="primary-btn" onClick={saveEdits}><Save size={15} /> 保存修改</button>}
            <button className="secondary-btn" onClick={generate} disabled={loading}>{loading ? <Spinner /> : <RotateCcw size={15} />} 重新生成</button>
            <button className="secondary-btn" onClick={exportMarkdown}><Download size={15} /> 导出 Markdown</button>
            <a className="secondary-btn" href={`/api/projects/${encodeURIComponent(project.id)}/export?format=zip`}><Archive size={15} /> 导出完整 ZIP 档案</a>
          </div>
        </div>
      )}

      {pager && (
        <div className="output-tabs">
          <button className={tab === "pager" ? "active" : ""} onClick={() => setTab("pager")}><FileText size={15} /> 一页纸</button>
          <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}><Sparkles size={15} /> 思维导图</button>
          <button className={tab === "outline" ? "active" : ""} onClick={() => setTab("outline")}><BookMarked size={15} /> 专业大纲</button>
        </div>
      )}

      {!pager ? (
        <div className="output-empty">
          <div className="paper-stack">
            <div /><div /><div className="paper-front"><BookMarked size={31} /><span>ONE<br />PAGER</span></div>
          </div>
          <span className="section-kicker">你的学习即将留下痕迹</span>
          <h2>生成「{docsLabel}」一页纸学习卡</h2>
          <p>AI 会综合已选资料骨架、费曼对练和认知盲区，提炼核心收获与下一步行动。</p>
          <div className="output-source-chips">
            <span><FileText size={14} /> {practiceDocs.length || project.analysis?.sources?.length || 0} 份资料</span>
            <span><MessageCircleQuestion size={14} /> {sessions.length} 次对练</span>
            <span><Target size={14} /> {blindspots.length} 个盲区</span>
          </div>
          <button className="primary-btn large" onClick={generate} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={18} />}{loading ? "正在整理你的思考…" : "生成一页纸与成果大纲"}</button>
        </div>
      ) : tab === "pager" ? (
        <article className="one-pager">
          <header>
            <span>LEARNING ONE-PAGER · {new Date().toLocaleDateString("zh-CN")}</span>
            <h1>{pager.title}</h1>
          </header>
          <section className="pager-block thesis-box">
            <span className="section-kicker">THESIS（核心论点）</span>
            <p>{pager.thesis}</p>
          </section>
          <section className="pager-block">
            <span className="section-kicker">01 关键收获</span>
            {(pager.takeaways || []).map((item, index) => (
              <div className="takeaway" key={index}>
                <b>0{index + 1}</b>
                <p contentEditable suppressContentEditableWarning onInput={(event) => updateTakeaway(index, event.currentTarget.textContent)}>{item}</p>
                <Pencil size={13} />
              </div>
            ))}
          </section>
          <section className="pager-block">
            <span className="section-kicker">02 立即行动</span>
            <ul className="pager-actions">
              {String(pager.action || "")
                .split(/[\n；;]+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          </section>
          <section className="pager-block">
            <span className="section-kicker">03 我的复盘</span>
            <p className="pager-big-copy reflection-box">{pager.reflection || "记录我的思考、收获与下一步改进方向..."}</p>
          </section>
          <footer><span>知练 · 费曼型学习助手</span><span>资料 → 骨架 → 输出 → 能力</span></footer>
        </article>
      ) : tab === "map" ? (
        <MindMap project={project} />
      ) : (
        <article className="panel output-outline">
          <header className="output-outline-head">
            <span className="section-kicker">专业大纲</span>
            <h2>{pager.outline?.title || `${project.title}能力作品大纲`}</h2>
          </header>
          <div className="output-outline-body">
            {(pager.outline?.sections || []).map((section, index) => (
              <section className="outline-section" key={`${section.title}-${index}`}>
                <header className="outline-section-head">
                  <span className="outline-roman">{romanLabels[index] || index + 1}.</span>
                  <h3 className="outline-section-title">{section.title}</h3>
                </header>
                {section.purpose && <p className="outline-purpose">{section.purpose}</p>}
                {!!section.keyPoints?.length && (
                  <ul className="outline-points">
                    {section.keyPoints.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}
                  </ul>
                )}
              </section>
            ))}
            {!pager.outline?.sections?.length && <EmptyMini text="重新生成一页纸后，会同步生成专业大纲。" />}
          </div>
        </article>
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        tone="warn"
        title="重新生成会覆盖编辑"
        description="你手动改过的一页纸内容将被新结果替换，是否继续？"
        confirmLabel="重新生成"
        cancelLabel="保留原文"
        onCancel={() => setConfirmRegenerate(false)}
        onConfirm={runGenerate}
      />
    </>
  );
}
