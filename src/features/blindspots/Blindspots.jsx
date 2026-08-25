import React, { useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { StatCard } from "../../components/StatCard.jsx";
import { StatusTag } from "../../components/StatusTag.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  RotateCcw,
  Target
} from "../../components/icons.jsx";
import { variantQuestion } from "../../api/projects.js";

function overlapsSelection(item, selectedDocumentIds = []) {
  const ids = Array.isArray(item?.documentIds) ? item.documentIds : [];
  if (!ids.length) return true;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

export function Blindspots({ project, selectedDocumentIds = [], updateProject, saveProjectPatch, showToast, navigate }) {
  const blindspots = (project.blindspots || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const [filter, setFilter] = useState("all");
  const visible = blindspots.filter((item) => filter === "all" || item.status === filter);

  if (!selectedDocumentIds.length) return <EmptyMini text="暂无练习资料，请先在「学习资料」上传并完成解析" />;

  const setStatus = async (id, status) => {
    const nextBlindspots = (project.blindspots || []).map((item) => item.id === id ? { ...item, status } : item);
    if (saveProjectPatch) {
      await saveProjectPatch({ blindspots: nextBlindspots });
    } else {
      updateProject({ blindspots: nextBlindspots });
    }
    showToast(status === "done" ? "盲区已通过复测" : "已加入复测队列");
  };

  const startRetest = async (blind) => {
    const concept = project.analysis?.modules
      ?.flatMap((module) => module.concepts)
      .find((item) => item.title === blind.concept);
    try {
      const data = await variantQuestion(project.id, blind.id, { documentIds: selectedDocumentIds });
      sessionStorage.setItem("zhifan-selected-concept", JSON.stringify({
        isVariant: true,
        blindspotId: blind.id,
        blindspotTitle: blind.title,
        question: data.question,
        ...(concept || { title: blind.concept })
      }));
      navigate("coach");
      showToast(`开始复测「${blind.concept}」，通过后会自动消除盲区`);
    } catch (error) {
      showToast(error.message);
    }
  };

  return (
    <div className="blindspots-page">
      <PageHeading
        eyebrow="哪里不会补哪里"
        title="盲区与复测"
        description="基于已选练习资料：每个被问住的地方，都是下一次能力提升最短的路径。"
      />

      <div className="blind-stats">
        <StatCard icon={CircleAlert} label="待补漏" value={blindspots.filter((x) => x.status === "open").length} tone="red" variant="dashboard" />
        <StatCard icon={Clock3} label="待复测" value={blindspots.filter((x) => x.status === "review").length} tone="blue" variant="dashboard" />
        <StatCard icon={Check} label="已掌握" value={blindspots.filter((x) => x.status === "done").length} tone="green" variant="dashboard" />
      </div>

      <div className="filter-tabs pills blind-filter-tabs">
        {[["all", "全部"], ["open", "待补漏"], ["review", "待复测"], ["done", "已掌握"]].map(([id, label]) => (
          <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)} type="button">{label}</button>
        ))}
      </div>

      <div className="blind-list">
        {visible.map((blind) => (
          <article className={`blind-card ${blind.status}`} key={blind.id}>
            <div className="blind-card-grid">
              <div className="blind-col-topic">
                <span className="blind-concept-tag">{blind.concept}</span>
                <h3>{blind.title}</h3>
              </div>

              <div className="blind-col-status">
                <StatusTag status={blind.status} />
              </div>

              <div className="blind-col-detail">
                <div className="diagnosis">
                  <strong>诊断</strong>
                  <p>{blind.problem}</p>
                </div>
                <div className="repair">
                  <strong>最小补漏动作</strong>
                  <p>{blind.action}</p>
                </div>
              </div>

              <div className="blind-col-actions">
                <button className="source-link" type="button">
                  <FileText size={14} /> 回原文 <ExternalLink size={12} />
                </button>
                {blind.status === "open" && (
                  <button className="primary-btn blind-action-btn" type="button" onClick={() => setStatus(blind.id, "review")}>
                    我已看懂，安排复测 <ArrowRight size={16} />
                  </button>
                )}
                {blind.status === "review" && (
                  <button className="primary-btn blind-action-btn review" type="button" onClick={() => startRetest(blind)}>
                    <RotateCcw size={16} /> 开始变式复测
                  </button>
                )}
                {blind.status === "done" && (
                  <span className="mastered-note"><Check size={15} /> 已通过迁移测试</span>
                )}
              </div>
            </div>
          </article>
        ))}

        {!visible.length && (
          <div className="empty-state dashed">
            <div><Target size={28} /></div>
            <p>继续费曼对练，AI 会把真正的认知漏洞带回来</p>
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <div className="blind-footer-cta empty-state dashed">
          <div><Target size={28} /></div>
          <p>继续费曼对练，AI 会把真正的认知漏洞带回来</p>
        </div>
      )}
    </div>
  );
}
