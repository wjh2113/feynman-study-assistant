import React, { useState } from "react";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Maximize2, X } from "../../components/icons.jsx";

const BRANCH_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#ea580c", "#ef4444"];

function scoreOf(concept) {
  const mastery = Number(concept.mastery || 0);
  return mastery >= 4 ? 95 : mastery === 3 ? 90 : mastery === 2 ? 80 : mastery === 1 ? 45 : 0;
}

function toneOf(score) {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "mid";
  return "weak";
}

export function MindMap({ project, compact = false }) {
  const modules = project.analysis?.modules || [];
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={`panel output-mind-map ${compact ? "compact" : ""} ${expanded ? "expanded" : ""}`}>
      {!compact && (
        <header className="mind-map-head">
          <h2>思维导图预览</h2>
          <button className="secondary-btn mind-map-expand" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <X size={15} /> : <Maximize2 size={15} />}
            {expanded ? "收起" : "放大查看"}
          </button>
        </header>
      )}

      {modules.length ? (
        <>
          <div className="mind-map-scroll">
            <div className="mind-map-canvas">
              <div className="mind-map-root">
                <span>学习主题</span>
                <strong>{project.title}</strong>
              </div>

              <div className="mind-map-trunk" aria-hidden="true" />

              <div className="mind-map-branches">
                {modules.map((module, moduleIndex) => {
                  const branchColor = BRANCH_COLORS[moduleIndex % BRANCH_COLORS.length];
                  const concepts = module.concepts || [];
                  return (
                    <div
                      className="mind-map-branch"
                      key={module.id || `${module.title}-${moduleIndex}`}
                      style={{ "--branch-color": branchColor }}
                    >
                      <div className="mind-map-module">
                        <span>{String(moduleIndex + 1).padStart(2, "0")}</span>
                        <strong>{module.title}</strong>
                      </div>

                      <div className="mind-map-concept-rail">
                        <div className="mind-map-rail-line" aria-hidden="true" />
                        <div className="mind-map-concepts">
                          {concepts.map((concept, conceptIndex) => {
                            const score = scoreOf(concept);
                            return (
                              <div
                                className={`mind-map-concept tone-${toneOf(score)}`}
                                key={concept.id || `${concept.title}-${conceptIndex}`}
                              >
                                <div className="mind-map-concept-head">
                                  <strong>{concept.title}</strong>
                                  <b>{score}%</b>
                                </div>
                                <div className="mind-map-bar" aria-hidden="true"><i style={{ width: `${score}%` }} /></div>
                              </div>
                            );
                          })}
                          {!concepts.length && <div className="mind-map-concept empty">暂未提取核心概念</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mind-map-legend">
            <span className="mind-map-legend-title">掌握度说明：</span>
            <span><i className="excellent" /> 90%+ 优秀</span>
            <span><i className="good" /> 70%~89% 良好</span>
            <span><i className="mid" /> 50%~69% 一般</span>
            <span><i className="weak" /> &lt;50% 需加强</span>
          </div>
        </>
      ) : (
        <EmptyMini text="资料解析完成后会自动生成思维导图。" />
      )}
    </article>
  );
}
