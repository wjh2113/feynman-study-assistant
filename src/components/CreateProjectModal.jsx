import React, { useState } from "react";
import { ArrowRight, X } from "./icons.jsx";
import { Spinner } from "./Spinner.jsx";
import { generateLearningPlan } from "../api/projects.js";

function localFallbackPlan({ title, goal, level }) {
  const subject = String(title || "").trim() || "该学科";
  return {
    summary: `围绕「${subject}」、目标「${goal}」、基础「${level}」，建议先建知识骨架，再通过费曼对练与真实任务验收。`,
    suggestedHorizon: level === "完全不了解" ? "6–8 周" : level === "有一些经验" ? "3–4 周" : "4–6 周",
    weeklyCadence: "每周 3–4 次，每次 30–45 分钟",
    phases: [
      {
        title: "搭骨架",
        duration: "第 1 阶段",
        focus: "弄清核心问题与最小必懂概念",
        actions: ["上传核心资料", "标出 5–8 个核心概念", "写下可检验的学习终点"]
      },
      {
        title: "费曼消化",
        duration: "第 2 阶段",
        focus: "用不看原文的方式解释，暴露盲区",
        actions: ["勾选练习资料做费曼对练", "整理盲区并复测", "每周至少 2 次完整对练"]
      },
      {
        title: "迁移验收",
        duration: "第 3 阶段",
        focus: "在目标场景中证明学以致用",
        actions: ["做一个真实小任务或模拟题", "生成一页纸复盘", "标出仍需回炉的概念"]
      }
    ],
    materialAdvice: ["优先上传能讲清原理的资料", "笔记与教材对照上传"],
    practiceAdvice: ["先解释是什么与为什么，再给失效边界", "对练时尽量关掉原文"],
    milestones: [`能讲清「${subject}」的核心问题`, "完成至少 3 次费曼对练"],
    warnings: ["先锁高价值概念，不要追求一次覆盖全部"],
    demo: true
  };
}

export function CreateProjectModal({ onClose, onCreate, showToast }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    goal: "工作应用",
    level: "刚刚入门"
  });

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let plan = null;
      try {
        const planResponse = await generateLearningPlan({
          title: form.title,
          goal: form.goal,
          level: form.level
        });
        plan = planResponse.plan;
      } catch (error) {
        plan = localFallbackPlan(form);
        showToast?.(error.message || "规划服务暂不可用，已使用本地建议规划");
      }
      await onCreate({
        id: `project-${Date.now()}`,
        title: form.title.trim() || "新的学科",
        description: plan?.summary || "上传学习资料后，AI 将生成学科知识地图；勾选资料后即可开始费曼对练。",
        mode: "subject",
        goal: form.goal,
        level: form.level,
        createdAt: Date.now(),
        progress: 0,
        analysis: { summary: "", highValue: [], modules: [], tacitKnowledge: [], scenarios: [], sources: [] },
        blindspots: [],
        sessions: [],
        onePager: null,
        learningPlan: plan || null,
        practiceDocumentIds: []
      });
    } catch (error) {
      showToast?.(error.message || "创建学科失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span>新建学科</span>
            <small>{busy ? "正在生成学习规划…" : `第 ${step} 步，共 2 步`}</small>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy}><X size={19} /></button>
        </div>
        <div className="modal-progress"><i style={{ width: busy ? "100%" : `${step * 50}%` }} /></div>
        {busy ? (
          <div className="modal-body">
            <div className="settings-loading"><Spinner /> 正在根据你的目标与基础生成学习规划与建议…</div>
          </div>
        ) : step === 1 ? (
          <div className="modal-body">
            <div className="field">
              <label>学科名称</label>
              <input
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：日语 / 产品经理"
              />
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="field">
              <label>学习目标</label>
              <div className="option-pills">
                {["工作应用", "准备面试", "考试复习", "兴趣探索"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={form.goal === item ? "selected" : ""}
                    onClick={() => setForm({ ...form, goal: item })}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>当前基础</label>
              <select
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
              >
                <option>完全不了解</option>
                <option>刚刚入门</option>
                <option>有一些经验</option>
              </select>
            </div>
            <p className="field-hint">创建后会由 AI 根据目标与基础推断周期、节奏与阶段安排，无需你再选投入时长。</p>
          </div>
        )}
        <div className="modal-foot">
          {step === 2 && !busy && (
            <button className="text-btn" type="button" onClick={() => setStep(1)}>返回</button>
          )}
          <button
            className="primary-btn"
            type="button"
            onClick={() => (step === 1 ? setStep(2) : create())}
            disabled={busy || (step === 1 && !form.title.trim())}
          >
            {busy ? <><Spinner /> 生成规划中</> : step === 1 ? <>下一步 <ArrowRight size={16} /></> : <>创建并生成规划 <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
