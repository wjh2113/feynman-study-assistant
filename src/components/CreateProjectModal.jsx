import React, { useState } from "react";
import { ArrowRight, BrainCircuit, Check, GraduationCap, X } from "./icons.jsx";

export function CreateProjectModal({ onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "",
    mode: "course",
    goal: "工作应用",
    level: "刚刚入门",
    time: "60分钟"
  });

  const create = () => {
    onCreate({
      id: `project-${Date.now()}`,
      title: form.title || "新的学科",
      description: "上传学习资料后，AI 将生成学科知识地图；勾选资料后即可开始费曼对练。",
      mode: form.mode,
      goal: form.goal,
      level: form.level,
      time: form.time,
      createdAt: Date.now(),
      progress: 8,
      analysis: { summary: "", highValue: [], modules: [], tacitKnowledge: [], scenarios: [], sources: [] },
      blindspots: [],
      sessions: [],
      onePager: null,
      practiceDocumentIds: []
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span>新建学科</span><small>第 {step} 步，共 2 步</small></div><button className="icon-btn" onClick={onClose}><X size={19} /></button></div>
        <div className="modal-progress"><i style={{ width: `${step * 50}%` }} /></div>
        {step === 1 ? (
          <div className="modal-body">
            <div className="field"><label>学科名称</label><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：日语 / 产品经理" /></div>
            <div className="field"><label>学习方式</label><div className="mode-cards">
              <button className={form.mode === "course" ? "selected" : ""} onClick={() => setForm({ ...form, mode: "course" })}>
                <div><GraduationCap size={22} /></div><strong>榨干一门课程</strong><span>上传课件与转写，提炼讲师隐性经验</span><i>{form.mode === "course" && <Check size={13} />}</i>
              </button>
              <button className={form.mode === "topic" ? "selected" : ""} onClick={() => setForm({ ...form, mode: "topic" })}>
                <div><BrainCircuit size={22} /></div><strong>快速了解一个主题</strong><span>多份教材与笔记，建立学科知识骨架</span><i>{form.mode === "topic" && <Check size={13} />}</i>
              </button>
            </div></div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="field"><label>学习目标</label><div className="option-pills">{["工作应用", "准备面试", "考试复习", "兴趣探索"].map((item) => <button key={item} className={form.goal === item ? "selected" : ""} onClick={() => setForm({ ...form, goal: item })}>{item}</button>)}</div></div>
            <div className="field"><label>当前基础</label><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}><option>完全不了解</option><option>刚刚入门</option><option>有一些经验</option></select></div>
            <div className="field"><label>计划投入</label><div className="option-pills">{["30分钟", "60分钟", "3天", "7天"].map((item) => <button key={item} className={form.time === item ? "selected" : ""} onClick={() => setForm({ ...form, time: item })}>{item}</button>)}</div></div>
          </div>
        )}
        <div className="modal-foot">
          {step === 2 && <button className="text-btn" onClick={() => setStep(1)}>返回</button>}
          <button className="primary-btn" onClick={() => step === 1 ? setStep(2) : create()} disabled={step === 1 && !form.title.trim()}>{step === 1 ? "下一步" : "创建学科"} <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
