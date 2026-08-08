import React from "react";
import { ArrowRight, BrainCircuit } from "./icons.jsx";

export function NoAnalysis({ navigate }) {
  return <div className="empty-state large"><div><BrainCircuit size={32} /></div><h2>知识地图还没有生成</h2><p>先上传学习资料，AI 才能根据你的内容建立知识骨架。</p><button className="primary-btn" onClick={() => navigate("sources")}>去上传资料 <ArrowRight size={16} /></button></div>;
}
