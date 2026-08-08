import React, { useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  BookMarked,
  Check,
  Download,
  FileText,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  Target
} from "../../components/icons.jsx";
import { generateOnePager } from "../../api/projects.js";
import { MindMap } from "./MindMap.jsx";

export function OutputStudio({ project, updateProject, showToast }) {
  const [loading, setLoading] = useState(false);
  const [pager, setPager] = useState(project.onePager);
  const [edited, setEdited] = useState(false);

  const generate = async () => {
    if (pager && edited) {
      if (!window.confirm("重新生成会覆盖你手动编辑的内容，是否继续？")) return;
    }
    setLoading(true);
    try {
      const data = await generateOnePager(project);
      setPager(data);
      setEdited(false);
      updateProject({ onePager: data });
      showToast(data.demo ? "一页纸已生成（当前为演示模式）" : "学习成果已生成");
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveEdits = () => {
    if (!pager) return;
    updateProject({ onePager: pager });
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

  const updateAction = (value) => {
    setPager((current) => current ? { ...current, action: value } : current);
    setEdited(true);
  };

  const updateReflection = (value) => {
    setPager((current) => current ? { ...current, reflection: value } : current);
    setEdited(true);
  };

  const exportMarkdown = () => {
    if (!pager) return;
    const mindMapMarkdown = (project.analysis?.modules || []).length ? `

## 思维导图

- ${project.title}
${(project.analysis.modules || []).map((module) => `  - ${module.title}
${(module.concepts || []).map((concept) => `    - ${concept.title}${concept.explanation ? `：${concept.explanation}` : ""}`).join("\n")}`).join("\n")}
` : "";
    const outlineMarkdown = pager.outline ? `

---

# 专业成果大纲：${pager.outline.title}

- 作品形式：${pager.outline.format}
- 目标读者：${pager.outline.audience}
- 核心论点：${pager.outline.coreArgument}

${(pager.outline.sections || []).map((section, index) => `## ${index + 1}. ${section.title}

**本章目的：** ${section.purpose}

**核心论点：**
${(section.keyPoints || []).map((item) => `- ${item}`).join("\n")}

**可核对依据：**
${(section.evidence || []).length ? section.evidence.map((item) => `- ${item}`).join("\n") : "- 待从个人实践中补充"}

**写作提示：** ${section.writingPrompt}`).join("\n\n")}
` : "";
    const markdown = `# ${pager.title}\n\n> ${pager.thesis}\n\n## 三个关键收获\n\n${(pager.takeaways || []).map((item) => `- ${item}`).join("\n")}\n\n## 立即行动\n\n${pager.action}\n\n## 我的复盘\n\n${pager.reflection}\n${mindMapMarkdown}${outlineMarkdown}`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pager.title || "学习一页纸"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Markdown 已导出");
  };

  return (
    <>
      <PageHeading
        eyebrow="第五步 · 把理解变成作品"
        title="学习成果"
        description="把资料、你的解释和修正后的思考，沉淀为一份真正属于你的成果。"
        action={pager ? <div className="topbar-actions"><button className="secondary-btn" onClick={exportMarkdown}><Download size={16} /> 导出 Markdown</button><a className="secondary-btn" href={`/api/projects/${encodeURIComponent(project.id)}/export?format=zip`}><Download size={16} /> 导出完整档案</a></div> : null}
        demo={project.analysis?.demo}
      />
      {!pager ? (
        <div className="output-empty">
          <div className="paper-stack">
            <div /><div /><div className="paper-front"><BookMarked size={31} /><span>ONE<br />PAGER</span></div>
          </div>
          <span className="section-kicker">你的学习即将留下痕迹</span>
          <h2>生成一页纸学习卡</h2>
          <p>AI 会综合资料骨架、费曼对练和认知盲区，提炼核心收获与下一步行动。内容可继续编辑，也可以导出保存。</p>
          <div className="output-source-chips">
            <span><FileText size={14} /> {project.analysis?.sources?.length || 0} 份资料</span>
            <span><MessageCircleQuestion size={14} /> {project.sessions?.length || 0} 次对练</span>
            <span><Target size={14} /> {project.blindspots?.length || 0} 个盲区</span>
          </div>
          <button className="primary-btn large" onClick={generate} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={18} />}{loading ? "正在整理你的思考…" : "生成一页纸与成果大纲"}</button>
        </div>
      ) : (
        <div className="one-pager-shell">
          <div className="output-documents">
            <article className="one-pager">
              <header><span>LEARNING ONE-PAGER · {new Date().toLocaleDateString("zh-CN")}</span><h1>{pager.title}</h1><p>{pager.thesis}</p></header>
              <section><div className="pager-section-number">01</div><div><span className="section-kicker">关键收获</span>{(pager.takeaways || []).map((item, index) => <div className="takeaway" key={index}><b>0{index + 1}</b><p contentEditable suppressContentEditableWarning onInput={(event) => updateTakeaway(index, event.currentTarget.textContent)}>{item}</p></div>)}</div></section>
              <section><div className="pager-section-number">02</div><div><span className="section-kicker">立即行动</span><p className="pager-big-copy" contentEditable suppressContentEditableWarning onInput={(event) => updateAction(event.currentTarget.textContent)}>{pager.action}</p></div></section>
              <section><div className="pager-section-number">03</div><div><span className="section-kicker">我的复盘</span><p className="pager-big-copy" contentEditable suppressContentEditableWarning onInput={(event) => updateReflection(event.currentTarget.textContent)}>{pager.reflection}</p></div></section>
              <footer><span>知返 · 费曼学习助手</span><span>资料 → 骨架 → 输出 → 能力</span></footer>
            </article>

            <MindMap project={project} />

            <article className="panel output-outline">
              <header>
                <span className="section-kicker">专业作品大纲</span>
                <h2>{pager.outline?.title || "当前成果尚未生成大纲"}</h2>
                {pager.outline ? (
                  <>
                    <div className="outline-meta"><span>{pager.outline.format}</span><span>面向：{pager.outline.audience}</span></div>
                    <p>{pager.outline.coreArgument}</p>
                  </>
                ) : <p>点击右侧“重新生成成果与大纲”，AI 会结合资料、对练和盲区补全。</p>}
              </header>
              {(pager.outline?.sections || []).map((section, index) => (
                <section className="outline-section" key={`${section.title}-${index}`}>
                  <div className="outline-number">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <h3>{section.title}</h3>
                    <p className="outline-purpose">{section.purpose}</p>
                    {!!section.keyPoints?.length && <ul>{section.keyPoints.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul>}
                    {!!section.evidence?.length && <div className="outline-evidence"><strong>可核对依据</strong>{section.evidence.map((item, evidenceIndex) => <span key={evidenceIndex}>{item}</span>)}</div>}
                    <div className="outline-prompt"><strong>写作提示</strong><p>{section.writingPrompt}</p></div>
                  </div>
                </section>
              ))}
            </article>
          </div>
          <aside className="output-side">
            <div className="concept-note"><span className="section-kicker">完成度</span><h3>学习闭环已完成</h3><p>你已经走过知识提炼、主动输出、盲区诊断和成果沉淀。</p><div className="complete-ring">100<small>%</small></div></div>
            {edited && <button className="primary-btn full" onClick={saveEdits}><Check size={16} /> 保存修改</button>}
            <button className="primary-btn full" onClick={exportMarkdown}><Download size={16} /> 导出 Markdown</button>
            <button className="secondary-btn full" onClick={generate} disabled={loading}>{loading ? <Spinner /> : <RotateCcw size={16} />}{loading ? "正在重新生成…" : "重新生成成果与大纲"}</button>
          </aside>
        </div>
      )}
    </>
  );
}
