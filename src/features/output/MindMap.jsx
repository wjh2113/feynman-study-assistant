import React from "react";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { BrainCircuit } from "../../components/icons.jsx";

export function MindMap({ project }) {
  const modules = project.analysis?.modules || [];
  return (
    <article className="panel output-mind-map">
      <header>
        <div>
          <span className="section-kicker">知识结构可视化</span>
          <h2>学习思维导图</h2>
          <p>从主题展开到知识模块与核心概念，掌握度来自你的费曼对练结果。</p>
        </div>
        <BrainCircuit size={25} />
      </header>
      {modules.length ? (
        <div className="mind-map-scroll">
          <div className="mind-map-canvas">
            <div className="mind-map-root">
              <span>学习主题</span>
              <strong>{project.title}</strong>
            </div>
            <div className="mind-map-branches">
              {modules.map((module, moduleIndex) => (
                <div className="mind-map-branch" key={module.id || `${module.title}-${moduleIndex}`}>
                  <div className="mind-map-module">
                    <span>{String(moduleIndex + 1).padStart(2, "0")}</span>
                    <strong>{module.title}</strong>
                  </div>
                  <div className="mind-map-concepts">
                    {(module.concepts || []).map((concept, conceptIndex) => (
                      <div className="mind-map-concept" key={concept.id || `${concept.title}-${conceptIndex}`}>
                        <div>
                          <strong>{concept.title}</strong>
                          {concept.explanation && <span>{concept.explanation}</span>}
                        </div>
                        <b>{Math.max(0, Math.min(100, Number(concept.mastery || 0)))}%</b>
                      </div>
                    ))}
                    {!module.concepts?.length && <div className="mind-map-concept empty">暂未提取核心概念</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : <EmptyMini text="资料解析完成后会自动生成思维导图。" />}
    </article>
  );
}
