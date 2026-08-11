import React, { useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { StatCard } from "../../components/StatCard.jsx";
import { StatusTag } from "../../components/StatusTag.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  Lightbulb,
  RotateCcw,
  Target
} from "../../components/icons.jsx";
import { variantQuestion } from "../../api/projects.js";

function overlapsSelection(item, selectedDocumentIds = []) {
  const ids = Array.isArray(item?.documentIds) ? item.documentIds : [];
  if (!ids.length) return true;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

export function Blindspots({ project, selectedDocumentIds = [], updateProject, showToast, navigate }) {
  const blindspots = (project.blindspots || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const [filter, setFilter] = useState("all");
  const visible = blindspots.filter((item) => filter === "all" || item.status === filter);

  if (!selectedDocumentIds.length) return <EmptyMini text="请先在上方勾选要练习的资料" />;

  const setStatus = (id, status) => {
    updateProject({
      blindspots: (project.blindspots || []).map((item) => item.id === id ? { ...item, status } : item)
    });
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
    <>
      <PageHeading
        eyebrow="第四步 · 哪里不会补哪里"
        title="盲区与复测"
        description="基于已选练习资料：每个被问住的地方，都是下一次能力提升最短的路径。"
      />
      <div className="blind-stats">
        <StatCard icon={CircleAlert} label="待补漏" value={blindspots.filter((x) => x.status === "open").length} tone="red" />
        <StatCard icon={RotateCcw} label="待复测" value={blindspots.filter((x) => x.status === "review").length} tone="amber" />
        <StatCard icon={Check} label="已掌握" value={blindspots.filter((x) => x.status === "done").length} tone="green" />
      </div>
      <div className="filter-tabs">
        {[["all", "全部"], ["open", "待补漏"], ["review", "待复测"], ["done", "已掌握"]].map(([id, label]) => (
          <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="blind-list">
        {visible.map((blind) => (
          <article className={`blind-card ${blind.status}`} key={blind.id}>
            <div className="blind-card-icon"><Lightbulb size={20} /></div>
            <div className="blind-card-main">
              <div className="blind-card-top"><div><span>{blind.concept}</span><h3>{blind.title}</h3></div><StatusTag status={blind.status} /></div>
              <div className="diagnosis"><strong>诊断</strong><p>{blind.problem}</p></div>
              <div className="repair"><strong>最小补漏动作</strong><p>{blind.action}</p></div>
              <button className="source-link"><FileText size={14} /> 回到原文：{blind.source}</button>
              <div className="blind-actions">
                {blind.status === "open" && <button className="secondary-btn" onClick={() => setStatus(blind.id, "review")}>我已看懂，安排复测 <ArrowRight size={16} /></button>}
                {blind.status === "review" && <button className="primary-btn" onClick={() => startRetest(blind)}><RotateCcw size={16} /> 开始变式复测</button>}
                {blind.status === "done" && <span className="mastered-note"><Check size={15} /> 已通过迁移测试</span>}
              </div>
            </div>
          </article>
        ))}
        {!visible.length && <div className="empty-state"><div><Target size={28} /></div><h3>这里暂时是空的</h3><p>继续费曼对练，AI 会把真正的认知漏洞带回来。</p></div>}
      </div>
    </>
  );
}
