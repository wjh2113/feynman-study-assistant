import React from "react";
import { ArrowRight, BrainCircuit } from "./icons.jsx";

export function NoAnalysis({ navigate, needsResummarize = false }) {
  return (
    <div className="empty-state large">
      <div><BrainCircuit size={32} /></div>
      <h2>{needsResummarize ? "知识地图已清空，待重新总结" : "知识地图还没有生成"}</h2>
      <p>
        {needsResummarize
          ? "删除资料后，学科知识地图会一并清空。可在「学习资料」中点「重新总结」，或再上传资料后自动重建。"
          : "先上传学习资料，AI 才能根据你的内容建立知识骨架。"}
      </p>
      <button className="primary-btn" onClick={() => navigate("sources")}>
        {needsResummarize ? "去重新总结" : "去上传资料"} <ArrowRight size={16} />
      </button>
    </div>
  );
}
