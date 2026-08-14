import React, { useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { ArrowRight, Check, ChevronRight, Clock3, Lightbulb, MessageCircleQuestion, RotateCcw } from "../../components/icons.jsx";
import { stageLabels } from "../../lib/nav.js";
import { generateLearningPlan } from "../../api/projects.js";

function overlapsSelection(item, selectedDocumentIds = []) {
  const ids = Array.isArray(item?.documentIds) ? item.documentIds : [];
  if (!ids.length) return true;
  if (!selectedDocumentIds.length) return false;
  return ids.some((id) => selectedDocumentIds.includes(id));
}

export function Overview({ project, selectedDocumentIds = [], navigate, updateProject, showToast }) {
  const [planBusy, setPlanBusy] = useState(false);
  const plan = project.learningPlan;
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const mastered = concepts.filter((item) => item.mastery >= 3).length;
  const inProgress = concepts.filter((item) => item.mastery === 2).length;
  const sessions = (project.sessions || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const blindspots = (project.blindspots || []).filter((item) => overlapsSelection(item, selectedDocumentIds));
  const blindCount = blindspots.filter((item) => item.status !== "done").length || 0;
  const currentStage = project.progress >= 80 ? 4 : project.progress >= 60 ? 3 : project.progress >= 35 ? 2 : project.progress >= 15 ? 1 : 0;
  const nextConcept = concepts.find((item) => item.mastery < 3) || concepts[0];
  const sourceCount = project.analysis?.sources?.length || 0;
  const selectedCount = selectedDocumentIds.length;

  const refreshPlan = async () => {
    if (planBusy) return;
    setPlanBusy(true);
    try {
      const data = await generateLearningPlan({
        title: project.title,
        goal: project.goal,
        level: project.level
      });
      updateProject?.({
        learningPlan: data.plan,
        description: data.plan?.summary || project.description
      });
      showToast?.(data.demo ? "已更新学习规划（演示模式）" : "学习规划已更新");
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
        description={project.description}
        demo={project.analysis?.demo || plan?.demo}
      />

      {plan && (
        <section className="panel learning-plan-card">
          <div className="panel-head">
            <div>
              <span className="section-kicker">AI 学习规划</span>
              <h3>
                {plan.suggestedHorizon || "建议周期"}
                {plan.weeklyCadence ? ` · ${plan.weeklyCadence}` : ""}
              </h3>
            </div>
            <button className="secondary-btn" type="button" onClick={refreshPlan} disabled={planBusy}>
              {planBusy ? <Spinner /> : <RotateCcw size={14} />}
              {planBusy ? "生成中…" : "重新规划"}
            </button>
          </div>
          <p className="learning-plan-summary">{plan.summary}</p>
          <div className="learning-plan-phases">
            {(plan.phases || []).map((phase) => (
              <div className="learning-plan-phase" key={`${phase.title}-${phase.duration}`}>
                <div>
                  <strong>{phase.title}</strong>
                  {phase.duration ? <span>{phase.duration}</span> : null}
                </div>
                {phase.focus ? <p>{phase.focus}</p> : null}
                <ul>
                  {(phase.actions || []).map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="learning-plan-columns">
            <div>
              <span className="section-kicker">资料建议</span>
              <ul>{(plan.materialAdvice || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <span className="section-kicker">练习建议</span>
              <ul>{(plan.practiceAdvice || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <span className="section-kicker">里程碑</span>
              <ul>{(plan.milestones || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          {(plan.warnings || []).length > 0 && (
            <div className="learning-plan-warnings">
              {(plan.warnings || []).map((item) => (
                <span key={item}><Lightbulb size={14} /> {item}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="journey-card">
        <div className="journey-top">
          <div>
            <span className="section-kicker">学习旅程</span>
            <h2>从资料到能力，你已走了 <b>{project.progress || 0}%</b></h2>
          </div>
          <span className="time-est">
            <Clock3 size={15} />
            {plan?.suggestedHorizon ? `建议周期 ${plan.suggestedHorizon}` : "上传资料后开始推进"}
          </span>
        </div>
        <div className="stage-track">
          {stageLabels.map((label, index) => (
            <div key={label} className={`stage ${index < currentStage ? "done" : index === currentStage ? "current" : ""}`}>
              <div className="stage-line" />
              <div className="stage-dot">{index < currentStage ? <Check size={14} /> : index + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="overview-grid">
        <section className="next-task-card">
          <div className="card-topline">
            <span className="section-kicker">下一步</span>
            <span className="soft-tag">为你推荐</span>
          </div>
          <div className="task-icon"><MessageCircleQuestion /></div>
          <h2>
            {sourceCount
              ? `勾选练习资料后，用自己的话解释「${nextConcept?.title || "核心概念"}」`
              : "先上传学习资料，再勾选要练习的材料"}
          </h2>
          <p>
            {selectedCount
              ? `当前已选 ${selectedCount} 份资料。关掉原文，向一个好奇的12岁小孩讲清楚它是什么、为什么重要，以及什么时候会失效。`
              : (plan?.materialAdvice?.[0]
                || "学科资料用于知识地图与问答；费曼对练、盲区与成果需要先在上方勾选一份或多份资料。")}
          </p>
          <button className="primary-btn" onClick={() => navigate(sourceCount ? "coach" : "sources")}>
            {sourceCount ? "开始费曼对练" : "去上传资料"} <ArrowRight size={17} />
          </button>
        </section>

        <section className="mastery-card">
          <div className="card-topline">
            <span className="section-kicker">掌握度</span>
            <button className="text-btn" onClick={() => navigate("map")}>查看地图 <ChevronRight size={15} /></button>
          </div>
          <div className="donut-row">
            <div className="donut" style={{ "--value": `${Math.round((mastered / Math.max(concepts.length, 1)) * 100)}%` }}>
              <div><strong>{mastered}</strong><span>已掌握</span></div>
            </div>
            <div className="mastery-legend">
              <div><i className="green" /><span>能解释</span><b>{mastered}</b></div>
              <div><i className="amber" /><span>学习中</span><b>{inProgress}</b></div>
              <div><i className="gray" /><span>待学习</span><b>{Math.max(concepts.length - mastered - inProgress, 0)}</b></div>
            </div>
          </div>
        </section>
      </div>

      <div className="overview-grid lower">
        <section className="panel recent-learning">
          <div className="panel-head"><div><span className="section-kicker">最近学习</span><h3>让每次输出都有迹可循</h3></div></div>
          {sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <div className={`session-score ${session.score >= 75 ? "good" : "warn"}`}>{session.score}</div>
              <div><strong>{session.concept}</strong><span>{session.date} · 费曼解释</span></div>
              <span className={`status-text ${session.score >= 75 ? "good" : "warn"}`}>{session.status}</span>
            </div>
          ))}
          {!sessions.length && <EmptyMini text="完成第一次费曼对练后，这里会出现学习记录。" />}
        </section>

        <section className="panel blind-preview">
          <div className="panel-head">
            <div><span className="section-kicker">需要留意</span><h3>{blindCount} 个认知盲区</h3></div>
            <button className="text-btn" onClick={() => navigate("blindspots")}>全部 <ChevronRight size={15} /></button>
          </div>
          {blindspots.slice(0, 2).map((blind) => (
            <button className="blind-mini" key={blind.id} onClick={() => navigate("blindspots")}>
              <div className="blind-bullet"><Lightbulb size={17} /></div>
              <div><strong>{blind.title}</strong><span>{blind.problem}</span></div>
              <ChevronRight size={17} />
            </button>
          ))}
          {!blindCount && <EmptyMini text="目前没有待处理盲区，继续对练来检验真实掌握度。" />}
        </section>
      </div>
    </>
  );
}
