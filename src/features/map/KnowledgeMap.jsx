import React, { useEffect, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { NoAnalysis } from "../../components/NoAnalysis.jsx";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileText,
  MessageCircleQuestion,
  Sparkles
} from "../../components/icons.jsx";
import { MasteryDot } from "./MasteryDot.jsx";

export function KnowledgeMap({ project, navigate }) {
  const modules = Array.isArray(project.analysis?.modules)
    ? project.analysis.modules.filter((module) => module && typeof module === "object")
    : [];
  const moduleKey = (module, index) => module.id || `module-${index}`;
  const firstConcept = modules.find((module) => Array.isArray(module.concepts) && module.concepts.length)?.concepts[0] || null;
  const [expanded, setExpanded] = useState(() => new Set(modules.map(moduleKey)));
  const [selected, setSelected] = useState(firstConcept);

  useEffect(() => {
    setExpanded(new Set(modules.map(moduleKey)));
    setSelected(firstConcept);
  }, [project.id, project.analysis?.modules]);

  const toggle = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!modules.length) {
    return <NoAnalysis navigate={navigate} needsResummarize={Boolean(project.analysis?.needsResummarize)} />;
  }

  return (
    <>
      <PageHeading
        eyebrow="第二步 · 先骨架，后细节"
        title="知识地图"
        description="先获得全局视角，再进入最值得掌握的 20% 高价值区。"
        action={<button className="primary-btn" onClick={() => navigate("coach")}><MessageCircleQuestion size={17} /> 开始费曼对练</button>}
        demo={project.analysis?.demo}
      />

      <section className="insight-banner">
        <div className="insight-icon"><Sparkles size={19} /></div>
        <div><span>AI 一句话洞察</span><p>{project.analysis.summary}</p></div>
      </section>

      <div className="map-layout">
        <section className="panel map-tree">
          <div className="panel-head">
            <div><span className="section-kicker">知识骨架</span><h3>{modules.length} 个核心模块</h3></div>
            <span className="mece-tag">MECE</span>
          </div>
          {modules.map((module, moduleIndex) => {
            const id = moduleKey(module, moduleIndex);
            const concepts = Array.isArray(module.concepts) ? module.concepts.filter(Boolean) : [];
            return (
            <div className="module-block" key={id}>
              <button className="module-head" onClick={() => toggle(id)}>
                <div className="module-index">0{moduleIndex + 1}</div>
                <div><strong>{module.title}</strong><span>{module.description}</span></div>
                {expanded.has(id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              {expanded.has(id) && (
                <div className="concept-list">
                  {concepts.map((concept, conceptIndex) => (
                    <button key={concept.id || `${id}-concept-${conceptIndex}`} className={selected === concept || (concept.id && selected?.id === concept.id) ? "selected" : ""} onClick={() => setSelected(concept)}>
                      <MasteryDot level={concept.mastery} />
                      <span>{concept.title}</span>
                      <em>{concept.importance}</em>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {!concepts.length && <div className="concept-empty">该模块暂未提取出核心概念</div>}
                </div>
              )}
            </div>
          )})}
        </section>

        <aside className="concept-detail">
          {selected && (
            <>
              <div className="concept-meta"><span>{selected.importance}</span><span>掌握度 {selected.mastery}/4</span></div>
              <h2>{selected.title}</h2>
              <p className="plain-explain">{selected.explanation}</p>
              <div className="source-proof">
                <div><FileText size={16} /><strong>资料依据</strong></div>
                {(Array.isArray(selected.sourceRefs) ? selected.sourceRefs : []).filter(Boolean).map((ref, index) => (
                  <button key={index}>
                    <span>{ref.file || "未知资料"} · 第 {ref.page || "-"} 页</span>
                    <q>{ref.quote || "暂无引用原文"}</q>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              <button className="primary-btn full" onClick={() => {
                sessionStorage.setItem("zhifan-selected-concept", JSON.stringify(selected));
                navigate("coach");
              }}>检验我是否真的懂了 <ArrowRight size={17} /></button>
            </>
          )}
        </aside>
      </div>

      {Array.isArray(project.analysis.tacitKnowledge) && project.analysis.tacitKnowledge.length > 0 && (
        <section className="tacit-section">
          <div className="section-title-row"><div><span className="section-kicker">骨肉分离</span><h2>讲师没有写在课件里的经验</h2></div><span>{project.analysis.tacitKnowledge.length} 条隐性知识</span></div>
          <div className="tacit-grid">
            {project.analysis.tacitKnowledge.map((item, index) => (
              <article key={index}>
                <span className="soft-tag">{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                {item.sourceRef && <button className="source-link"><FileText size={14} /> {item.sourceRef.file || "未知资料"} · 第 {item.sourceRef.page || "-"} 页</button>}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
