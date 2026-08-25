import React, { useEffect, useMemo, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { NoAnalysis } from "../../components/NoAnalysis.jsx";
import { FileTypeIcon } from "../sources/FileTypeIcon.jsx";
import {
  ArrowRight,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  FolderOpen,
  Info,
  ListTree,
  MessageCircleQuestion,
  MoreHorizontal,
  Share2,
  Target,
  User
} from "../../components/icons.jsx";
import { MasteryDot, MasteryDots } from "./MasteryDot.jsx";
import { MapFlowGraph } from "./MapFlowGraph.jsx";

const TACIT_ICONS = [Target, User, Eye, Share2];

function importanceLevel(value) {
  if (value === "高" || value === "high" || Number(value) >= 3) return 3;
  if (value === "低" || value === "low" || Number(value) === 1) return 1;
  return 2;
}

function ImportanceDots({ level }) {
  return (
    <span className="importance-dots" aria-label={`重要性 ${level}`}>
      {[1, 2, 3].map((dot) => (
        <i key={dot} className={dot <= level ? "on" : ""} />
      ))}
    </span>
  );
}

function flattenConcepts(modules) {
  const nodes = [];
  modules.forEach((module, moduleIndex) => {
    (module.concepts || []).forEach((concept, conceptIndex) => {
      nodes.push({
        ...concept,
        moduleId: module.id || `m-${moduleIndex}`,
        moduleTitle: module.title,
        map: concept.map || {
          x: 12 + (conceptIndex % 3) * 28,
          y: 14 + moduleIndex * 28,
          status: concept.mastery >= 3 ? "mastered" : concept.mastery === 2 ? "learning" : concept.mastery ? "weak" : "locked",
          progress: `${Math.max(concept.mastery || 0, 0)}/4`,
          links: []
        }
      });
    });
  });
  return nodes;
}

function ConceptDetail({ selected, navigate }) {
  if (!selected) return null;

  const mastery = Number(selected.mastery || 0);
  const progress = selected.map?.progress || `${mastery}/4`;
  const sourceRef = (Array.isArray(selected.sourceRefs) ? selected.sourceRefs : []).filter(Boolean)[0];

  return (
    <aside className="concept-detail">
      <div className="concept-detail-top">
        <div className="concept-detail-brand">
          <div className="concept-detail-icon"><BookMarked size={20} /></div>
          <div>
            <h2>{selected.title}</h2>
            <p className="concept-importance-line">
              重要性：{selected.importance || "中"}
              <ImportanceDots level={importanceLevel(selected.importance)} />
            </p>
          </div>
        </div>
        <div className="concept-mastery-badge">
          <span>掌握度</span>
          <strong>{progress}</strong>
          <Info size={14} />
        </div>
      </div>

      <div className="concept-block">
        <h3>概念解释</h3>
        <p className="plain-explain">{selected.explanation || "暂无概念解释，解析资料后会自动生成。"}</p>
      </div>

      <div className="source-proof">
        <h3>来源证据</h3>
        {sourceRef ? (
          <>
            <div className="source-proof-file">
              <FileTypeIcon name={sourceRef.file || "资料.pdf"} compact />
              <div className="source-proof-meta">
                <strong className="source-proof-name">{sourceRef.file || "未知资料"}</strong>
                <span className="source-proof-page">第 {sourceRef.page || "-"} 页</span>
              </div>
            </div>
            <blockquote className="source-proof-quote">“{sourceRef.quote || "暂无引用原文"}”</blockquote>
          </>
        ) : (
          <div className="source-proof-empty">
            <p>解析资料后会在这里显示原文证据。</p>
          </div>
        )}
      </div>

      <div className="concept-detail-foot">
        <button
          className="concept-cta-btn"
          type="button"
          onClick={() => {
            sessionStorage.setItem("zhifan-selected-concept", JSON.stringify(selected));
            navigate("coach");
          }}
        >
          <MessageCircleQuestion size={17} /> 检验我是否真的懂了
        </button>
      </div>
    </aside>
  );
}

export function KnowledgeMap({ project, selectedDocumentIds = [], navigate }) {
  const modules = useMemo(
    () => (Array.isArray(project.analysis?.modules)
      ? project.analysis.modules.filter((module) => module && typeof module === "object")
      : []),
    [project.analysis?.modules]
  );
  const nodes = useMemo(() => flattenConcepts(modules), [modules]);
  const [selectedId, setSelectedId] = useState(nodes.find((item) => item.map?.status === "selected")?.id || nodes[0]?.id);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("graph");
  const [openModules, setOpenModules] = useState(() => new Set(modules.slice(0, 1).map((module, index) => module.id || `m-${index}`)));
  const selected = nodes.find((item) => item.id === selectedId) || nodes[0];
  const visible = nodes.filter((item) => filter === "all" || item.map.status === filter);

  useEffect(() => {
    const preferred = nodes.find((item) => item.map?.status === "selected") || nodes[0];
    setSelectedId(preferred?.id);
  }, [project.id, nodes]);

  useEffect(() => {
    setOpenModules(new Set(modules.slice(0, 1).map((module, index) => module.id || `m-${index}`)));
  }, [project.id, modules]);

  if (!modules.length) {
    return <NoAnalysis navigate={navigate} needsResummarize={Boolean(project.analysis?.needsResummarize)} />;
  }

  const toggleModule = (id) => {
    setOpenModules((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="knowledge-map-page">
      <PageHeading
        eyebrow="第二步 · 先骨架，后细节"
        title="知识地图"
        action={<button className="primary-btn" type="button" onClick={() => navigate("coach")}>开始费曼对练 <ArrowRight size={16} /></button>}
      />

      <div className="map-toolbar">
        <label>
          <Filter size={14} />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">全部模块</option>
            <option value="mastered">已掌握</option>
            <option value="learning">学习中</option>
            <option value="weak">薄弱</option>
            <option value="locked">未解锁</option>
          </select>
        </label>
        <div className="map-legend">
          <span><i className="mastered" /> 已掌握</span>
          <span><i className="learning" /> 学习中</span>
          <span><i className="weak" /> 薄弱</span>
          <span><i className="locked" /> 未解锁</span>
        </div>
        <div className="map-zoom">
          <div className="map-view-toggle" role="group" aria-label="地图样式">
            <button type="button" className={viewMode === "tree" ? "active" : ""} onClick={() => setViewMode("tree")} title="树形列表">
              <ListTree size={15} /> 树形
            </button>
            <button type="button" className={viewMode === "graph" ? "active" : ""} onClick={() => setViewMode("graph")} title="节点关系图">
              <Share2 size={15} /> 关系图
            </button>
          </div>
        </div>
      </div>

      <div className={`map-workspace ${viewMode}`}>
        {viewMode === "graph" ? (
          <MapFlowGraph
            projectId={project.id}
            nodes={visible}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        ) : (
          <section className="panel map-tree">
            <header className="map-tree-head">
              <div className="map-tree-title">
                <h3>知识树 (MECE)</h3>
                <Info size={14} />
              </div>
              <div className="map-tree-legend">
                <span className="legend-group">
                  掌握度
                  <MasteryDot level={0} />
                  <span className="legend-label">未掌握</span>
                  <MasteryDot level={1} />
                  <span className="legend-label">1 初步</span>
                  <MasteryDot level={2} />
                  <span className="legend-label">2 了解</span>
                  <MasteryDot level={3} />
                  <span className="legend-label">3 熟练</span>
                  <MasteryDot level={4} />
                  <span className="legend-label">4 精通</span>
                </span>
                <span className="legend-group">
                  重要性
                  <span className="legend-label">低</span>
                  <ImportanceDots level={1} />
                  <span className="legend-label">中</span>
                  <ImportanceDots level={2} />
                  <span className="legend-label">高</span>
                  <ImportanceDots level={3} />
                </span>
              </div>
              <button className="icon-btn map-tree-menu" type="button" aria-label="更多操作">
                <MoreHorizontal size={16} />
              </button>
            </header>

            <div className="map-tree-columns">
              <span />
              <span>掌握度</span>
              <span>重要性</span>
              <span />
            </div>

            {modules.map((module, moduleIndex) => {
              const moduleId = module.id || `m-${moduleIndex}`;
              const open = openModules.has(moduleId);
              const concepts = (module.concepts || []).filter((concept) => {
                if (filter === "all") return true;
                const node = nodes.find((item) => item.id === concept.id);
                return node?.map?.status === filter;
              });
              const moduleImportance = Math.max(
                ...((module.concepts || []).map((concept) => importanceLevel(concept.importance))),
                2
              );

              return (
                <div className="module-block" key={moduleId}>
                  <button type="button" className="module-head" onClick={() => toggleModule(moduleId)}>
                    <span className="module-toggle">
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <FolderOpen size={16} />
                    </span>
                    <strong>模块 {String(moduleIndex + 1).padStart(2, "0")} {module.title}</strong>
                    <span className="map-tree-mastery" />
                    <span className="map-tree-importance"><ImportanceDots level={moduleImportance} /></span>
                    <ChevronRight size={14} className="map-tree-chevron" />
                  </button>
                  {open && (
                    <div className="concept-list">
                      {concepts.map((concept, conceptIndex) => {
                        const active = selected?.id === concept.id;
                        return (
                          <button
                            type="button"
                            key={concept.id || `${concept.title}-${conceptIndex}`}
                            className={active ? "selected" : ""}
                            onClick={() => setSelectedId(concept.id)}
                          >
                            <span className={`concept-radio ${active ? "active" : ""}`} aria-hidden="true" />
                            <span className="concept-label">
                              {String(moduleIndex + 1).padStart(2, "0")}.{String(conceptIndex + 1).padStart(2, "0")} {concept.title}
                            </span>
                            <span className="map-tree-mastery"><MasteryDots level={concept.mastery} /></span>
                            <span className="map-tree-importance"><ImportanceDots level={importanceLevel(concept.importance)} /></span>
                            <ChevronRight size={14} className="map-tree-chevron" />
                          </button>
                        );
                      })}
                      {!concepts.length && <div className="concept-empty">该模块暂无匹配概念</div>}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="map-tree-foot">
              <div className="map-view-toggle" role="group" aria-label="地图样式">
                <button type="button" className="active" onClick={() => setViewMode("tree")} title="树形列表">
                  <ListTree size={15} /> 树形
                </button>
                <button type="button" onClick={() => setViewMode("graph")} title="节点关系图">
                  <Share2 size={15} /> 关系图
                </button>
              </div>
            </div>
          </section>
        )}

        <ConceptDetail selected={selected} navigate={navigate} />
      </div>

      {Array.isArray(project.analysis.tacitKnowledge) && project.analysis.tacitKnowledge.length > 0 && (
        <section className="tacit-section">
          <div className="tacit-section-head">
            <div>
              <h2>
                骨肉分离 · 讲师没有写在课件里的经验
                <Info size={14} />
              </h2>
            </div>
            <button className="text-btn" type="button">查看全部 <ChevronRight size={14} /></button>
          </div>
          <div className="tacit-grid four">
            {project.analysis.tacitKnowledge.map((item, index) => {
              const Icon = TACIT_ICONS[index % TACIT_ICONS.length];
              return (
                <article className="tacit-card" key={`${item.title}-${index}`}>
                  <div className="tacit-card-top">
                    <div className="tacit-icon"><Icon size={16} /></div>
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.detail}</p>
                  <footer>
                    <span className="tacit-tag">{item.type}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
