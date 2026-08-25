import React, { useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  Calendar,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Info,
  Lightbulb,
  Play,
  RotateCcw
} from "../../components/icons.jsx";
import { stageLabels } from "../../lib/nav.js";
import { generateLearningPlan } from "../../api/projects.js";

const STAGE_CAPTIONS = [
  "上传并梳理学科资料",
  "建立 MECE 知识框架",
  "AI 追问直到说清",
  "针对盲区变式题",
  "生成一页纸作品"
];

function overlapsSelection(item, selectedDocumentIds = []) {
  const ids = Array.isArray(item?.documentIds) ? item.documentIds : [];
  if (!ids.length) return true;
  if (!selectedDocumentIds.length) return false;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

function sessionGrade(score) {
  if (score >= 90) return { label: "优秀", tone: "excellent" };
  if (score >= 75) return { label: "良好", tone: "good" };
  if (score >= 60) return { label: "中等", tone: "mid" };
  return { label: "需补漏", tone: "warn" };
}

function priorityClass(priority = "") {
  if (priority.includes("高")) return "high";
  if (priority.includes("中")) return "mid";
  return "low";
}

export function Overview({ project, selectedDocumentIds = [], navigate, updateProject, saveProjectPatch, refreshProject, showToast }) {
  const [planBusy, setPlanBusy] = useState(false);
  const plan = project.learningPlan;
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const mastered = concepts.filter((item) => item.mastery >= 3).length;
  const inProgress = concepts.filter((item) => item.mastery === 2).length;
  const sessions = (project.sessions || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const blindspots = (project.blindspots || []).filter((item) => overlapsSelection(item, selectedDocumentIds) && item.status !== "done");
  const currentStage = project.progress >= 80 ? 4 : project.progress >= 60 ? 3 : project.progress >= 35 ? 2 : project.progress >= 15 ? 1 : 0;
  const sourceCount = project.analysis?.sources?.length || 0;
  const computedMastery = Math.round((mastered / Math.max(concepts.length, 1)) * 100);
  const computedLearn = Math.round((inProgress / Math.max(concepts.length, 1)) * 100);
  const masteryPct = computedMastery || Number(project.progress || 0);
  const learnPct = computedLearn;
  const waitPct = Math.max(0, 100 - masteryPct - learnPct);
  const planSummary = plan?.moduleCount
    ? `${plan.phases?.length || 3} 阶段 · ${plan.moduleCount} 个核心模块`
    : `${plan?.phases?.length || 3} 阶段 · ${concepts.length || 8} 个核心模块`;

  const refreshPlan = async () => {
    if (planBusy) return;
    setPlanBusy(true);
    try {
      const data = await generateLearningPlan({
        title: project.title,
        goal: project.goal,
        level: project.level
      });
      const patch = {
        learningPlan: data.plan,
        description: data.plan?.summary || project.description
      };
      if (saveProjectPatch) {
        await saveProjectPatch(patch);
      } else {
        updateProject?.(patch);
      }
      await refreshProject?.(project.id);
      showToast?.("学习规划已更新");
    } catch (error) {
      showToast?.(error.message || "更新规划失败");
    } finally {
      setPlanBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={[project.goal, project.level].filter(Boolean).join(" · ") || "学习概览"}
        title={project.title}
        description={project.description || plan?.summary}
        action={(
          <button className="secondary-btn" type="button" onClick={refreshPlan} disabled={planBusy}>
            {planBusy ? <Spinner /> : <RotateCcw size={14} />}
            {planBusy ? "生成中…" : "重新规划"}
          </button>
        )}
      />

      {plan && (
        <section className="panel learning-plan-card">
          <div className="panel-head">
            <div>
              <span className="section-kicker">AI 学习规划</span>
              <h3>{plan.suggestedHorizon || "6 周"}掌握核心框架</h3>
            </div>
          </div>
          <div className="plan-metrics">
            <div><Calendar size={16} /><div><span>学习周期</span><b>{plan.suggestedHorizon || "6 周"}</b></div></div>
            <div><Clock3 size={16} /><div><span>学习节奏</span><b>{plan.weeklyCadence || "每周 5-7 小时"}</b></div></div>
            <div><FileText size={16} /><div><span>规划摘要</span><b>{planSummary}</b></div></div>
          </div>
          <div className="learning-plan-phases timeline">
            {(plan.phases || []).map((phase, index) => (
              <div className="learning-plan-phase" key={`${phase.title}-${phase.duration}`}>
                <em>0{index + 1}</em>
                <div>
                  <strong>{phase.title}{phase.duration ? `（${phase.duration}）` : ""}</strong>
                  {phase.focus ? <p>{phase.focus}</p> : null}
                </div>
              </div>
            ))}
          </div>
          {(plan.warnings || []).length > 0 && (
            <div className="learning-plan-warnings banner">
              {(plan.warnings || []).map((item) => (
                <span key={item}><Lightbulb size={14} /> {item}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="overview-grid">
        <section className="panel journey-card">
          <div className="journey-top">
            <div>
              <span className="section-kicker">学习旅程</span>
              <h2>从资料到能力，你已走了 <b>{project.progress || 0}%</b></h2>
            </div>
          </div>
          <div className="stage-track">
            {stageLabels.map((label, index) => (
              <div key={label} className={`stage ${index < currentStage ? "done" : index === currentStage ? "current" : ""}`}>
                <div className="stage-line" />
                <div className="stage-dot">{index < currentStage ? <Check size={14} /> : index + 1}</div>
                <strong>{label}</strong>
                <span>{STAGE_CAPTIONS[index]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel mastery-card">
          <div className="card-topline">
            <h3 className="mastery-title">掌握度</h3>
            <button className="text-btn" type="button" onClick={() => navigate("map")}>查看地图 <ChevronRight size={15} /></button>
          </div>
          <div className="donut-row">
            <div className="donut blue" style={{ "--value": `${masteryPct}%`, "--mid": `${masteryPct + learnPct}%` }}>
              <div>
                <strong>{project.progress || masteryPct}%</strong>
                <span>总体掌握度</span>
              </div>
            </div>
            <ul className="mastery-legend">
              <li><i className="blue" /><span>能解释</span><b>{masteryPct}%</b><em>（已掌握）</em></li>
              <li><i className="cyan" /><span>学习中</span><b>{learnPct}%</b><em>（进行中）</em></li>
              <li><i className="gray" /><span>待学习</span><b>{waitPct}%</b><em>（未开始）</em></li>
            </ul>
          </div>
        </section>
      </div>

      <div className="overview-grid lower">
        <div className="overview-stack">
          <section className="next-task-card">
            <span className="section-kicker">下一步</span>
            <h2>{sourceCount ? "下一步：开始费曼对练" : "先上传学习资料"}</h2>
            <p>{sourceCount ? "向一个好奇的 12 岁小孩讲清楚" : "学科资料用于知识地图与问答；上传后即可开始对练。"}</p>
            <button className="primary-btn" type="button" onClick={() => navigate(sourceCount ? "coach" : "sources")}>
              <Play size={15} /> {sourceCount ? "开始费曼对练" : "去上传资料"}
            </button>
          </section>

          <section className="panel recent-learning">
            <div className="panel-head">
              <div><span className="section-kicker">最近对练记录</span><h3>让每次输出都有迹可循</h3></div>
              <button className="text-btn" type="button" onClick={() => navigate("coach")}>查看全部 <ChevronRight size={15} /></button>
            </div>
            <div className="session-list">
              {sessions.slice(0, 3).map((session) => {
                const grade = sessionGrade(session.score);
                return (
                  <button className="session-row" type="button" key={session.id} onClick={() => navigate("coach")}>
                    <span className="session-icon"><FileText size={16} /></span>
                    <div className="session-copy">
                      <strong>{session.concept}</strong>
                      <span>{session.date}</span>
                    </div>
                    <span className={`grade-pill ${grade.tone}`}>{session.status || grade.label}</span>
                    <b>{session.score} 分</b>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>
            {!sessions.length && <EmptyMini text="完成第一次费曼对练后，这里会出现学习记录。" />}
          </section>
        </div>

        <section className="panel blind-preview">
          <div className="panel-head blind-preview-head">
            <div className="blind-preview-title">
              <h3>知识盲区预览</h3>
              <span>基于最近学习与对练</span>
            </div>
            <button className="text-btn" type="button" onClick={() => navigate("blindspots")}>查看全部 <ChevronRight size={15} /></button>
          </div>
          <div className="blind-preview-list">
            {blindspots.slice(0, 3).map((blind) => {
              const tone = priorityClass(blind.priority);
              const accuracy = Number(blind.accuracy || 50);
              return (
                <button className={`blind-progress-row ${tone}`} type="button" key={blind.id} onClick={() => navigate("blindspots")}>
                  <span className={`blind-warn-icon ${tone}`} aria-hidden="true">
                    {tone === "low" ? <Info size={14} /> : <CircleAlert size={14} />}
                  </span>
                  <div className="blind-progress-copy">
                    <strong>{blind.title}</strong>
                    <span>正确率 {accuracy}%</span>
                    <div className="mini-bar"><i style={{ width: `${accuracy}%` }} className={tone} /></div>
                  </div>
                  <em className={tone}>{blind.priority || "待处理"}</em>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
          {!blindspots.length && <EmptyMini text="目前没有待处理盲区，继续对练来检验真实掌握度。" />}
        </section>
      </div>
    </>
  );
}
