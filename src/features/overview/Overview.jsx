import React from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { EmptyMini } from "../../components/EmptyMini.jsx";
import { ArrowRight, Check, ChevronRight, Clock3, Lightbulb, MessageCircleQuestion } from "../../components/icons.jsx";
import { stageLabels } from "../../lib/nav.js";

export function Overview({ project, navigate }) {
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const mastered = concepts.filter((item) => item.mastery >= 3).length;
  const inProgress = concepts.filter((item) => item.mastery === 2).length;
  const blindCount = project.blindspots?.filter((item) => item.status !== "done").length || 0;
  const currentStage = project.progress >= 80 ? 4 : project.progress >= 60 ? 3 : project.progress >= 35 ? 2 : project.progress >= 15 ? 1 : 0;
  const nextConcept = concepts.find((item) => item.mastery < 3) || concepts[0];

  return (
    <>
      <PageHeading eyebrow="下午好，继续保持思考" title={project.title} description={project.description} demo={project.analysis?.demo} />

      <section className="journey-card">
        <div className="journey-top">
          <div>
            <span className="section-kicker">学习旅程</span>
            <h2>从资料到能力，你已走了 <b>{project.progress || 8}%</b></h2>
          </div>
          <span className="time-est"><Clock3 size={15} /> 预计还需 42 分钟</span>
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
            <span className="section-kicker">下一步 · 约 8 分钟</span>
            <span className="soft-tag">为你推荐</span>
          </div>
          <div className="task-icon"><MessageCircleQuestion /></div>
          <h2>用自己的话解释「{nextConcept?.title || "核心概念"}」</h2>
          <p>关掉资料，向一个好奇的12岁小孩讲清楚它是什么、为什么重要，以及什么时候会失效。</p>
          <button className="primary-btn" onClick={() => navigate("coach")}>开始费曼对练 <ArrowRight size={17} /></button>
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
          {(project.sessions || []).map((session) => (
            <div className="session-row" key={session.id}>
              <div className={`session-score ${session.score >= 75 ? "good" : "warn"}`}>{session.score}</div>
              <div><strong>{session.concept}</strong><span>{session.date} · 费曼解释</span></div>
              <span className={`status-text ${session.score >= 75 ? "good" : "warn"}`}>{session.status}</span>
            </div>
          ))}
          {!project.sessions?.length && <EmptyMini text="完成第一次费曼对练后，这里会出现学习记录。" />}
        </section>

        <section className="panel blind-preview">
          <div className="panel-head">
            <div><span className="section-kicker">需要留意</span><h3>{blindCount} 个认知盲区</h3></div>
            <button className="text-btn" onClick={() => navigate("blindspots")}>全部 <ChevronRight size={15} /></button>
          </div>
          {project.blindspots?.slice(0, 2).map((blind) => (
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
