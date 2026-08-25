import React from "react";
import { ArrowRight, BrainCircuit } from "./icons.jsx";
import { resolveMapAvailability } from "../lib/map-availability.js";

export function NoAnalysis({ project, navigate, needsResummarize = false }) {
  const state = project
    ? resolveMapAvailability(project)
    : {
      kind: needsResummarize ? "needs-resummarize" : "no-sources",
      title: needsResummarize ? "知识地图已清空，待重新总结" : "知识地图还没有生成",
      description: needsResummarize
        ? "删除资料后，学科知识地图会一并清空。可在「学习资料」中点「重新总结」，或再上传资料后自动重建。"
        : "先上传学习资料，AI 才能根据你的内容建立知识骨架。",
      actionLabel: needsResummarize ? "去重新总结" : "去上传资料",
      actionView: "sources"
    };

  return (
    <div className="empty-state large">
      <div><BrainCircuit size={32} /></div>
      <h2>{state.title}</h2>
      <p>{state.description}</p>
      <button className="primary-btn" onClick={() => navigate(state.actionView || "sources")}>
        {state.actionLabel} <ArrowRight size={16} />
      </button>
    </div>
  );
}
