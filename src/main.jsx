import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BookMarked,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  House,
  Lightbulb,
  Menu,
  MessageCircleQuestion,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  UploadCloud,
  X,
  Zap
} from "./icons.jsx";
import "./styles.css";

const demoProject = {
  id: "demo-ai-pm",
  title: "AI 产品经理快速入门",
  description: "建立 AI 产品经理的知识骨架，并完成一次真实场景应用。",
  mode: "course",
  goal: "工作应用",
  level: "刚刚入门",
  createdAt: Date.now(),
  progress: 62,
  analysis: {
    summary: "AI 产品的核心不是给旧功能加上模型，而是围绕模型能力、数据反馈和用户任务重新设计价值闭环。",
    highValue: ["先定义真实任务，再决定是否使用 AI", "把不确定性设计进产品体验", "用反馈数据持续改善模型与产品"],
    modules: [
      {
        id: "m1",
        title: "理解 AI 产品",
        description: "辨别 AI 产品与传统软件在能力边界和交互方式上的差异。",
        concepts: [
          {
            id: "c1",
            title: "AI-Native 思维",
            explanation: "不是给旧产品加一个聊天框，而是从模型能完成什么任务重新设计整个体验。",
            importance: "核心",
            mastery: 3,
            sourceRefs: [{ file: "AI产品方法论课件.pdf", page: 12, quote: "从模型能力出发，重构用户任务链路。" }]
          },
          {
            id: "c2",
            title: "能力边界",
            explanation: "清楚模型在哪些情况下可靠，哪些情况下需要人来确认或兜底。",
            importance: "高价值",
            mastery: 2,
            sourceRefs: [{ file: "课堂录音转写.docx", page: 1, quote: "不要掩盖不确定性，要设计处理不确定性的体验。" }]
          }
        ]
      },
      {
        id: "m2",
        title: "构建数据飞轮",
        description: "让真实使用产生的数据持续改善产品表现。",
        concepts: [
          {
            id: "c3",
            title: "数据飞轮",
            explanation: "用户使用产生反馈，反馈改善模型，模型变好又吸引更多有效使用。",
            importance: "核心",
            mastery: 2,
            sourceRefs: [{ file: "AI产品方法论课件.pdf", page: 24, quote: "产品使用、反馈数据与模型迭代形成循环。" }]
          },
          {
            id: "c4",
            title: "反馈信号",
            explanation: "把用户的修改、接受、放弃等行为转化为可以学习的信号。",
            importance: "高价值",
            mastery: 1,
            sourceRefs: [{ file: "课堂录音转写.docx", page: 1, quote: "点赞不是唯一反馈，用户的修改往往更有价值。" }]
          }
        ]
      },
      {
        id: "m3",
        title: "验证与落地",
        description: "用最低成本验证 AI 是否真的改善了用户结果。",
        concepts: [
          {
            id: "c5",
            title: "价值验证",
            explanation: "先证明用户结果变好了，再讨论模型参数或功能数量。",
            importance: "核心",
            mastery: 1,
            sourceRefs: [{ file: "个人学习笔记.md", page: 1, quote: "价值指标必须对应用户任务的最终结果。" }]
          }
        ]
      }
    ],
    tacitKnowledge: [
      {
        title: "不要隐藏模型的不确定性",
        type: "踩坑经验",
        detail: "讲师提到，一味追求像传统软件一样确定，会让产品在模型出错时失去用户信任。",
        sourceRef: { file: "课堂录音转写.docx", page: 1 }
      },
      {
        title: "用户修改是高价值反馈",
        type: "反直觉观点",
        detail: "比起简单点赞，用户如何修改模型输出，更能说明真实偏好和质量差距。",
        sourceRef: { file: "课堂录音转写.docx", page: 1 }
      }
    ],
    scenarios: [
      {
        id: "s1",
        title: "给客服团队设计 AI 助手",
        context: "一家电商公司的客服响应很慢，希望引入 AI。",
        constraint: "历史数据杂乱，错误回答会造成客诉，开发周期只有四周。",
        goal: "设计首个可验证版本，并说明如何处理模型不确定性。",
        concepts: ["能力边界", "价值验证"]
      },
      {
        id: "s2",
        title: "反馈很多，模型却没有变好",
        context: "产品每天收集数千个点赞和点踩，但生成质量没有明显提高。",
        constraint: "标注预算有限。",
        goal: "重新设计反馈机制，让数据可以真正推动产品迭代。",
        concepts: ["数据飞轮", "反馈信号"]
      }
    ],
    sources: [
      { id: "src1", name: "AI产品方法论课件.pdf", type: "课件 · PDF", pages: 38, status: "ready", size: "4.8 MB" },
      { id: "src2", name: "课堂录音转写.docx", type: "转写 · DOCX", pages: 1, status: "ready", size: "186 KB" },
      { id: "src3", name: "个人学习笔记.md", type: "笔记 · MD", pages: 1, status: "ready", size: "24 KB" }
    ]
  },
  blindspots: [
    {
      id: "b1",
      title: "数据飞轮的成立条件",
      concept: "数据飞轮",
      problem: "能够解释循环过程，但没有说明哪些反馈数据真正有效。",
      action: "补充反馈信号的质量标准，并给出一个无效反馈的反例。",
      source: "课堂录音转写.docx",
      status: "review"
    },
    {
      id: "b2",
      title: "模型出错时的产品兜底",
      concept: "能力边界",
      problem: "方案依赖人工审核，但没有说明何时触发人工介入。",
      action: "根据错误成本设计三级置信度与介入规则。",
      source: "AI产品方法论课件.pdf · 第 18 页",
      status: "open"
    }
  ],
  sessions: [
    { id: "ss1", concept: "AI-Native 思维", score: 82, date: "今天 10:32", status: "通过" },
    { id: "ss2", concept: "数据飞轮", score: 67, date: "昨天 21:18", status: "需补漏" }
  ],
  onePager: null
};

const navItems = [
  { id: "overview", label: "学习概览", icon: House },
  { id: "sources", label: "学习资料", icon: FolderOpen },
  { id: "map", label: "知识地图", icon: BrainCircuit },
  { id: "rag", label: "资料问答", icon: Search },
  { id: "coach", label: "费曼对练", icon: MessageCircleQuestion },
  { id: "blindspots", label: "盲区与复测", icon: Target },
  { id: "output", label: "学习成果", icon: BookMarked }
];

const stageLabels = ["资料就绪", "掌握骨架", "费曼输出", "定向补漏", "成果沉淀"];

function questionsForProject(project) {
  if (project.analysis?.questions?.length) return project.analysis.questions;
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts || []) || [];
  const templates = [
    (title) => `请不用专业术语，向一个12岁孩子解释“${title}”是什么，以及它为什么重要。`,
    (title) => `请用一个真实例子说明“${title}”是如何发挥作用的。`,
    (title) => `“${title}”在什么情况下会失效？请给出一个反例。`
  ];
  return concepts.map((concept, index) => ({
    id: `legacy-q-${concept.id || index}`,
    question: templates[index % templates.length](concept.title),
    conceptId: concept.id,
    concept: concept.title,
    why: "检验是否真正理解资料中的核心逻辑",
    sourceRefs: concept.sourceRefs || []
  }));
}

function App() {
  const [projects, setProjects] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("zhifan-projects"));
      return saved?.length ? saved : [demoProject];
    } catch {
      return [demoProject];
    }
  });
  const [activeProjectId, setActiveProjectId] = useState(() => {
    const saved = localStorage.getItem("zhifan-active-project");
    return projects.some((item) => item.id === saved) ? saved : projects[0].id;
  });
  const [activeView, setActiveView] = useState("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [persistenceReady, setPersistenceReady] = useState(false);

  const project = projects.find((item) => item.id === activeProjectId) || projects[0];

  useEffect(() => {
    localStorage.setItem("zhifan-projects", JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await fetch("/api/projects");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法读取持久化项目");
        if (cancelled) return;
        if (data.projects?.length) {
          setProjects(data.projects);
          setActiveProjectId((current) =>
            data.projects.some((item) => item.id === current) ? current : data.projects[0].id
          );
        } else {
          await Promise.all(
            projects.map((item) =>
              fetch(`/api/projects/${encodeURIComponent(item.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
              })
            )
          );
        }
        if (!cancelled) setPersistenceReady(true);
      } catch (error) {
        if (!cancelled) showToast(`持久化连接失败：${error.message}`);
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!persistenceReady) return undefined;
    const timer = window.setTimeout(() => {
      projects.forEach((item) => {
        fetch(`/api/projects/${encodeURIComponent(item.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        }).catch(() => showToast("项目暂时只保存在本机浏览器，数据库同步失败"));
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [projects, persistenceReady]);

  useEffect(() => {
    localStorage.setItem("zhifan-active-project", activeProjectId);
  }, [activeProjectId]);

  const updateProject = (patch) => {
    setProjects((items) =>
      items.map((item) => (item.id === activeProjectId ? { ...item, ...patch } : item))
    );
  };

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2800);
  };

  const changeView = (id) => {
    setActiveView(id);
    setSidebarOpen(false);
  };

  const handleCreate = (newProject) => {
    setProjects((items) => [newProject, ...items]);
    setActiveProjectId(newProject.id);
    setActiveView("sources");
    setCreateOpen(false);
    showToast("学习项目已创建，上传资料开始第一步");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span>知</span></div>
          <div>
            <strong>知返</strong>
            <small>费曼学习助手</small>
          </div>
          <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单"><X size={19} /></button>
        </div>

        <button className="new-project-btn" onClick={() => setCreateOpen(true)}>
          <Plus size={17} /> 新建学习项目
        </button>

        <div className="sidebar-label">当前项目</div>
        <div className="project-switcher">
          <div className="project-glyph">{project.title.slice(0, 1)}</div>
          <div className="project-switcher-copy">
            <strong>{project.title}</strong>
            <span>{project.mode === "course" ? "课程精学" : "主题速学"} · {project.progress || 8}%</span>
          </div>
          <ChevronDown size={15} />
          <select
            className="project-native-select"
            aria-label="切换学习项目"
            value={activeProjectId}
            onChange={(event) => {
              setActiveProjectId(event.target.value);
              setActiveView("overview");
            }}
          >
            {projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
          </select>
        </div>

        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeView === id ? "active" : ""} onClick={() => changeView(id)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {id === "blindspots" && project.blindspots?.filter((x) => x.status !== "done").length > 0 && (
                <em>{project.blindspots.filter((x) => x.status !== "done").length}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="model-chip"><Sparkles size={14} /> DeepSeek V4 Pro</div>
          <button><Settings size={17} /> 设置</button>
          <div className="profile">
            <div className="avatar">W</div>
            <div><strong>我的学习空间</strong><span>仅自己可见</span></div>
            <MoreHorizontal size={17} />
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs">
            <span>学习项目</span><ChevronRight size={14} /><strong>{project.title}</strong>
          </div>
          <div className="topbar-actions">
            <button className="search-pill" onClick={() => changeView("rag")}><Search size={16} /><span>询问资料库</span><kbd>RAG</kbd></button>
            <button className="icon-btn"><CircleAlert size={18} /></button>
          </div>
        </header>

        <div className="page-wrap">
          {activeView === "overview" && <Overview project={project} navigate={changeView} />}
          {activeView === "sources" && <Sources project={project} updateProject={updateProject} navigate={changeView} showToast={showToast} />}
          {activeView === "map" && <KnowledgeMap project={project} navigate={changeView} />}
          {activeView === "rag" && <RagAssistant project={project} navigate={changeView} showToast={showToast} />}
          {activeView === "coach" && <Coach project={project} updateProject={updateProject} showToast={showToast} navigate={changeView} />}
          {activeView === "blindspots" && <Blindspots project={project} updateProject={updateProject} showToast={showToast} navigate={changeView} />}
          {activeView === "output" && <OutputStudio project={project} updateProject={updateProject} showToast={showToast} />}
        </div>
      </main>

      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Overview({ project, navigate }) {
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const mastered = concepts.filter((item) => item.mastery >= 3).length;
  const inProgress = concepts.filter((item) => item.mastery === 2).length;
  const blindCount = project.blindspots?.filter((item) => item.status !== "done").length || 0;
  const currentStage = project.progress >= 80 ? 4 : project.progress >= 60 ? 3 : project.progress >= 35 ? 2 : project.progress >= 15 ? 1 : 0;
  const nextConcept = concepts.find((item) => item.mastery < 3) || concepts[0];

  return (
    <>
      <PageHeading eyebrow="下午好，继续保持思考" title={project.title} description={project.description} />

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

function Sources({ project, updateProject, navigate, showToast }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef();
  const sources = project.analysis?.sources || [];

  const addFiles = (list) => {
    const accepted = Array.from(list).filter((file) => /\.(pdf|docx|txt|md|markdown)$/i.test(file.name));
    setFiles((current) => [...current, ...accepted].slice(0, 12));
    if (accepted.length !== list.length) showToast("首版支持 PDF、DOCX、TXT 和 Markdown");
  };

  const analyze = async () => {
    if (!files.length && sources.length) {
      navigate("map");
      return;
    }
    if (!files.length) return showToast("请先添加至少一份学习资料");
    setLoading(true);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      body.append("projectId", project.id);
      body.append("title", project.title);
      body.append("mode", project.mode);
      const response = await fetch("/api/analyze", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "分析失败");
      updateProject({
        analysis: data,
        progress: 22,
        description: data.summary,
        blindspots: [],
        sessions: []
      });
      showToast(data.demo ? "知识骨架已生成（当前为演示模式）" : "DeepSeek 已完成资料分析");
      navigate("map");
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="第一步 · 构建专属语料库"
        title="学习资料"
        description="把课件、笔记和课堂转写放在一起，AI 会交叉提炼知识骨架与隐性经验。"
        action={<button className="primary-btn" onClick={analyze} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={17} />}{loading ? "正在提炼…" : files.length ? `分析 ${files.length} 份新资料` : "查看知识地图"}</button>}
      />

      <div
        className="upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
      >
        <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown" onChange={(event) => addFiles(event.target.files)} />
        <div className="upload-icon"><UploadCloud size={28} /></div>
        <h3>拖入学习资料，或点击选择文件</h3>
        <p>支持 PDF、DOCX、TXT、Markdown · 单个文件不超过 30 MB</p>
        <div className="upload-hint"><Zap size={14} /> 课件与转写一起上传，才能发现讲师没有写下来的经验</div>
      </div>

      {files.length > 0 && (
        <section className="panel file-panel pending-files">
          <div className="panel-head"><div><span className="section-kicker">等待分析</span><h3>{files.length} 份新资料</h3></div></div>
          {files.map((file, index) => (
            <div className="file-row" key={`${file.name}-${index}`}>
              <FileTypeIcon name={file.name} />
              <div className="file-copy"><strong>{file.name}</strong><span>{formatSize(file.size)} · 将参与本次分析</span></div>
              <select aria-label="资料类型"><option>自动识别</option><option>课件</option><option>录音转写</option><option>教材</option><option>个人笔记</option></select>
              <button className="icon-btn" onClick={(event) => { event.stopPropagation(); setFiles((items) => items.filter((_, i) => i !== index)); }}><X size={17} /></button>
            </div>
          ))}
        </section>
      )}

      <section className="panel file-panel">
        <div className="panel-head">
          <div><span className="section-kicker">已入库</span><h3>{sources.length} 份资料</h3></div>
          <button className="filter-btn">全部类型 <ChevronDown size={14} /></button>
        </div>
        {sources.map((source) => (
          <div className="file-row" key={source.id}>
            <FileTypeIcon name={source.name} />
            <div className="file-copy"><strong>{source.name}</strong><span>{source.type} · {source.pages || 1} 页 {source.chunks ? `· ${source.chunks} 个检索分块` : ""} {source.size ? `· ${typeof source.size === "number" ? formatSize(source.size) : source.size}` : ""}</span></div>
            <span className="ready-tag"><Check size={13} /> 已解析</span>
            {source.downloadUrl ? (
              <a className="icon-btn" href={source.downloadUrl} title="下载原始资料"><Download size={17} /></a>
            ) : <button className="icon-btn"><MoreHorizontal size={18} /></button>}
          </div>
        ))}
        {!sources.length && <EmptyMini text="还没有已解析的资料。" />}
      </section>
    </>
  );
}

function FileTypeIcon({ name }) {
  const ext = name.split(".").pop()?.toUpperCase();
  return <div className={`file-icon ${ext?.toLowerCase()}`}><FileText size={19} /><small>{ext}</small></div>;
}

function KnowledgeMap({ project, navigate }) {
  const [expanded, setExpanded] = useState(() => new Set(project.analysis?.modules?.map((module) => module.id) || []));
  const [selected, setSelected] = useState(project.analysis?.modules?.[0]?.concepts?.[0] || null);
  const modules = project.analysis?.modules || [];

  const toggle = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!modules.length) return <NoAnalysis navigate={navigate} />;

  return (
    <>
      <PageHeading
        eyebrow="第二步 · 先骨架，后细节"
        title="知识地图"
        description="先获得全局视角，再进入最值得掌握的 20% 高价值区。"
        action={<button className="primary-btn" onClick={() => navigate("coach")}><MessageCircleQuestion size={17} /> 开始费曼对练</button>}
      />

      <section className="insight-banner">
        <div className="insight-icon"><Sparkles size={19} /></div>
        <div><span>AI 一句话洞察</span><p>{project.analysis.summary}</p></div>
      </section>

      <div className="map-layout">
        <section className="panel map-tree">
          <div className="panel-head">
            <div><span className="section-kicker">知识骨架</span><h3>{modules.length} 个核心模块</h3></div>
            <span className="mece-tag">MECE</span>
          </div>
          {modules.map((module, moduleIndex) => (
            <div className="module-block" key={module.id}>
              <button className="module-head" onClick={() => toggle(module.id)}>
                <div className="module-index">0{moduleIndex + 1}</div>
                <div><strong>{module.title}</strong><span>{module.description}</span></div>
                {expanded.has(module.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              {expanded.has(module.id) && (
                <div className="concept-list">
                  {module.concepts.map((concept) => (
                    <button key={concept.id} className={selected?.id === concept.id ? "selected" : ""} onClick={() => setSelected(concept)}>
                      <MasteryDot level={concept.mastery} />
                      <span>{concept.title}</span>
                      <em>{concept.importance}</em>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>

        <aside className="concept-detail">
          {selected && (
            <>
              <div className="concept-meta"><span>{selected.importance}</span><span>掌握度 {selected.mastery}/4</span></div>
              <h2>{selected.title}</h2>
              <p className="plain-explain">{selected.explanation}</p>
              <div className="source-proof">
                <div><FileText size={16} /><strong>资料依据</strong></div>
                {selected.sourceRefs?.map((ref, index) => (
                  <button key={index}>
                    <span>{ref.file} · 第 {ref.page} 页</span>
                    <q>{ref.quote}</q>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              <button className="primary-btn full" onClick={() => {
                sessionStorage.setItem("zhifan-selected-concept", JSON.stringify(selected));
                navigate("coach");
              }}>检验我是否真的懂了 <ArrowRight size={17} /></button>
            </>
          )}
        </aside>
      </div>

      {project.analysis.tacitKnowledge?.length > 0 && (
        <section className="tacit-section">
          <div className="section-title-row"><div><span className="section-kicker">骨肉分离</span><h2>讲师没有写在课件里的经验</h2></div><span>{project.analysis.tacitKnowledge.length} 条隐性知识</span></div>
          <div className="tacit-grid">
            {project.analysis.tacitKnowledge.map((item, index) => (
              <article key={index}>
                <span className="soft-tag">{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <button className="source-link"><FileText size={14} /> {item.sourceRef.file} · 第 {item.sourceRef.page} 页</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function MasteryDot({ level }) {
  return <i className={`mastery-dot level-${level}`}>{level >= 3 && <Check size={10} />}</i>;
}

function RagAssistant({ project, navigate, showToast }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const hasSources = Boolean(project.analysis?.sources?.length);

  const ask = async () => {
    if (!query.trim() || loading) return;
    const question = query.trim();
    setQuery("");
    setLoading(true);
    try {
      const response = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, query: question })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "资料检索失败");
      setHistory((items) => [{ question, ...data }, ...items]);
    } catch (error) {
      setQuery(question);
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="基于资料 · 混合检索"
        title="资料问答"
        description="先用 pgvector 与全文关键词检索找到原文，再让 DeepSeek 严格依据证据回答。"
        action={<button className="secondary-btn" onClick={() => navigate("sources")}><UploadCloud size={16} /> 管理资料</button>}
      />
      <section className="panel rag-ask-panel">
        <div className="rag-status">
          <span><BrainCircuit size={16} /> PostgreSQL + pgvector</span>
          <span><Search size={16} /> 向量与关键词混合检索</span>
          <span><FileText size={16} /> 回答附原文引用</span>
        </div>
        <div className="rag-input-row">
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") ask();
            }}
            placeholder={hasSources ? "针对已上传的资料提问，例如：讲师认为这个方法落地时最大的风险是什么？" : "请先上传资料并完成解析"}
            disabled={!hasSources || loading}
          />
          <button className="primary-btn" onClick={ask} disabled={!hasSources || !query.trim() || loading}>
            {loading ? <Spinner /> : <Search size={17} />} 检索并回答
          </button>
        </div>
      </section>

      <div className="rag-history">
        {history.map((item, index) => (
          <article className="panel rag-answer-card" key={`${item.question}-${index}`}>
            <div className="rag-question"><span>问</span><h3>{item.question}</h3></div>
            <div className="rag-answer"><Sparkles size={18} /><p>{item.answer}</p></div>
            {item.sources?.length > 0 && (
              <div className="rag-sources">
                <span className="section-kicker">检索依据 · {item.sources.length} 个片段</span>
                {item.sources.map((source, sourceIndex) => (
                  <div className="rag-source" key={source.id}>
                    <strong>[{sourceIndex + 1}] {source.filename} · 第 {source.page} 页</strong>
                    <p>{source.quote}</p>
                    {source.documentId && <a href={`/api/documents/${source.documentId}/file`}>打开原始资料</a>}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
        {!history.length && (
          <div className="empty-state">
            <div><Search size={28} /></div>
            <h3>{hasSources ? "从你的资料开始提问" : "资料库还是空的"}</h3>
            <p>{hasSources ? "回答会显示命中的文件、页码和原文片段。" : "上传 PDF、DOCX、TXT 或 Markdown 后即可使用 RAG 问答。"}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Coach({ project, updateProject, showToast, navigate }) {
  const concepts = project.analysis?.modules?.flatMap((module) => module.concepts) || [];
  const questions = questionsForProject(project);
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem("zhifan-selected-concept")); } catch { return null; }
  })();
  const initialQuestion =
    questions.find((item) => item.id === stored?.questionId) ||
    questions.find((item) => item.conceptId === stored?.id || item.concept === stored?.title) ||
    questions[0];
  const [question, setQuestion] = useState(initialQuestion);
  const concept =
    concepts.find((item) => item.id === question?.conceptId || item.title === question?.concept) ||
    concepts[0];
  const [role, setRole] = useState("child");
  const [answer, setAnswer] = useState("");
  const [turn, setTurn] = useState(1);
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [messages, setMessages] = useState(() => [
    { from: "ai", text: initialQuestion?.question || "请先上传资料，让AI根据资料生成问题。" }
  ]);

  useEffect(() => {
    sessionStorage.removeItem("zhifan-selected-concept");
  }, []);

  if (!question || !concept) return <NoAnalysis navigate={navigate} />;

  const changeQuestion = (event) => {
    const next = questions.find((item) => item.id === event.target.value);
    setQuestion(next);
    setTurn(1);
    setRole("child");
    setEvaluation(null);
    setMessages([{ from: "ai", text: next.question }]);
  };

  const submit = async () => {
    if (!answer.trim() || loading) return;
    const userText = answer.trim();
    setAnswer("");
    setMessages((items) => [...items, { from: "user", text: userText }]);
    setLoading(true);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, question, concept, answer: userText, role, turn })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "教练无法回应");
      setMessages((items) => [...items, { from: "ai", text: data.reply }]);
      setEvaluation(data.evaluation);
      setRole(data.phase || role);
      setTurn((value) => value + 1);
      if (data.blindspot) {
        const exists = project.blindspots?.some((item) => item.title === data.blindspot.title);
        if (!exists) {
          updateProject({
            blindspots: [
              ...(project.blindspots || []),
              {
                id: `b-${Date.now()}`,
                ...data.blindspot,
                concept: concept.title,
                source: (question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file || "相关学习资料",
                status: "open"
              }
            ],
            progress: Math.max(project.progress || 0, 48)
          });
          showToast("发现一个新的认知盲区，已加入补漏清单");
        }
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    if (!evaluation) {
      showToast("请至少完成一轮解释和追问后再保存");
      return;
    }
    const avg = Math.round(Object.values(evaluation).reduce((a, b) => a + b, 0) / 4);
    const passed = avg >= 75;
    updateProject({
      sessions: [
        { id: `ss-${Date.now()}`, concept: concept.title, question: question.question, score: avg, date: "刚刚", status: passed ? "通过" : "需补漏" },
        ...(project.sessions || [])
      ],
      blindspots: (project.blindspots || []).map((item) =>
        passed && item.concept === concept.title && item.status === "review"
          ? { ...item, status: "done" }
          : item
      ),
      progress: Math.max(project.progress || 0, passed ? 76 : 60)
    });
    showToast(passed ? "对练已通过，相关待复测盲区已标记为掌握" : "对练已保存，相关盲区仍需继续练习");
  };

  return (
    <div className="coach-page">
      <PageHeading
        eyebrow="第三步 · 输出，暴露假懂"
        title="费曼对练"
        description="AI 不会替你完善答案，而会通过追问逼你把逻辑讲清楚。"
        action={<button className="secondary-btn" onClick={finish}><Check size={16} /> 结束并保存</button>}
      />
      <div className="coach-layout">
        <section className="coach-main">
          <div className="coach-toolbar">
            <div className="coach-question-select"><span>当前问题</span><select value={question.id} onChange={changeQuestion}>{questions.map((item) => <option value={item.id} key={item.id}>{item.question}</option>)}</select></div>
            <div className="role-switch">
              <button className={role === "child" ? "active" : ""} onClick={() => setRole("child")}>小白模式</button>
              <button className={role === "expert" ? "active" : ""} onClick={() => setRole("expert")}>专家模式</button>
            </div>
          </div>

          <div className="chat-area">
            <div className="coach-intro">
              <div className="coach-avatar"><GraduationCap size={23} /></div>
              <div><strong>{role === "child" ? "好奇的 12 岁小孩" : "严厉的行业专家"}</strong><span>{role === "child" ? "会在你说黑话时立刻追问" : "会挑战假设、边界与极端情况"}</span></div>
            </div>
            {messages.map((message, index) => (
              <div className={`message ${message.from}`} key={index}>
                {message.from === "ai" && <div className="mini-avatar"><Sparkles size={14} /></div>}
                <div>{message.text}</div>
              </div>
            ))}
            {loading && <div className="message ai"><div className="mini-avatar"><Sparkles size={14} /></div><div className="typing"><i /><i /><i /></div></div>}
          </div>

          <div className="answer-box">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
              }}
              placeholder="用你自己的话解释，不必追求完美……"
            />
            <div className="answer-foot"><span>⌘ Enter 发送</span><button onClick={submit} disabled={!answer.trim() || loading}><Send size={16} /> 发送解释</button></div>
          </div>
        </section>

        <aside className="coach-side">
          <div className="concept-note">
            <span className="section-kicker">问题依据 · {question.concept}</span>
            <h3>{concept.title}</h3>
            <p>{question.why || concept.explanation}</p>
            <button className="source-link"><FileText size={14} /> {(question.sourceRefs?.[0] || concept.sourceRefs?.[0])?.file}</button>
          </div>
          <div className="live-score">
            <span className="section-kicker">实时观察</span>
            {evaluation ? (
              <>
                <ScoreBar label="说人话" value={evaluation.clarity} />
                <ScoreBar label="逻辑闭环" value={evaluation.logic} />
                <ScoreBar label="举例能力" value={evaluation.example} />
                <ScoreBar label="边界意识" value={evaluation.boundary} />
                <p className="score-note"><Lightbulb size={14} /> 分数只是线索，能经得住追问才算真正掌握。</p>
              </>
            ) : <EmptyMini text="说出第一段解释后，AI 会观察你的表达。" />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  return <div className="score-bar"><div><span>{label}</span><b>{value}</b></div><div className="bar"><i style={{ width: `${value}%` }} /></div></div>;
}

function Blindspots({ project, updateProject, showToast, navigate }) {
  const blindspots = project.blindspots || [];
  const [filter, setFilter] = useState("all");
  const visible = blindspots.filter((item) => filter === "all" || item.status === filter);

  const setStatus = (id, status) => {
    updateProject({
      blindspots: blindspots.map((item) => item.id === id ? { ...item, status } : item),
      progress: status === "done" ? Math.max(project.progress || 0, 76) : project.progress
    });
    showToast(status === "done" ? "盲区已通过复测" : "已加入复测队列");
  };

  const startRetest = (blind) => {
    const concept = project.analysis?.modules
      ?.flatMap((module) => module.concepts)
      .find((item) => item.title === blind.concept);
    if (concept) sessionStorage.setItem("zhifan-selected-concept", JSON.stringify(concept));
    navigate("coach");
    showToast(`开始复测「${blind.concept}」，通过后会自动消除盲区`);
  };

  return (
    <>
      <PageHeading eyebrow="第四步 · 哪里不会补哪里" title="盲区与复测" description="每个被问住的地方，都是下一次能力提升最短的路径。" />
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

function StatCard({ icon: Icon, label, value, tone }) {
  return <div className={`stat-card ${tone}`}><div><Icon size={18} /></div><span>{label}</span><strong>{value}</strong></div>;
}

function StatusTag({ status }) {
  const map = { open: "待补漏", review: "待复测", done: "已掌握" };
  return <span className={`status-tag ${status}`}>{map[status]}</span>;
}

function OutputStudio({ project, updateProject, showToast }) {
  const [loading, setLoading] = useState(false);
  const [pager, setPager] = useState(project.onePager);

  const generate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/one-pager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败");
      setPager(data);
      updateProject({ onePager: data, progress: 100 });
      showToast(data.demo ? "一页纸已生成（当前为演示模式）" : "学习成果已生成");
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportMarkdown = () => {
    if (!pager) return;
    const markdown = `# ${pager.title}\n\n> ${pager.thesis}\n\n## 三个关键收获\n\n${pager.takeaways.map((item) => `- ${item}`).join("\n")}\n\n## 立即行动\n\n${pager.action}\n\n## 我的复盘\n\n${pager.reflection}\n`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pager.title || "学习一页纸"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Markdown 已导出");
  };

  return (
    <>
      <PageHeading
        eyebrow="第五步 · 把理解变成作品"
        title="学习成果"
        description="把资料、你的解释和修正后的思考，沉淀为一份真正属于你的成果。"
        action={pager ? <button className="secondary-btn" onClick={exportMarkdown}><Download size={16} /> 导出 Markdown</button> : null}
      />
      {!pager ? (
        <div className="output-empty">
          <div className="paper-stack">
            <div /><div /><div className="paper-front"><BookMarked size={31} /><span>ONE<br />PAGER</span></div>
          </div>
          <span className="section-kicker">你的学习即将留下痕迹</span>
          <h2>生成一页纸学习卡</h2>
          <p>AI 会综合资料骨架、费曼对练和认知盲区，提炼核心收获与下一步行动。内容可继续编辑，也可以导出保存。</p>
          <div className="output-source-chips">
            <span><FileText size={14} /> {project.analysis?.sources?.length || 0} 份资料</span>
            <span><MessageCircleQuestion size={14} /> {project.sessions?.length || 0} 次对练</span>
            <span><Target size={14} /> {project.blindspots?.length || 0} 个盲区</span>
          </div>
          <button className="primary-btn large" onClick={generate} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={18} />}{loading ? "正在整理你的思考…" : "生成我的一页纸"}</button>
        </div>
      ) : (
        <div className="one-pager-shell">
          <article className="one-pager">
            <header><span>LEARNING ONE-PAGER · {new Date().toLocaleDateString("zh-CN")}</span><h1>{pager.title}</h1><p>{pager.thesis}</p></header>
            <section><div className="pager-section-number">01</div><div><span className="section-kicker">关键收获</span>{pager.takeaways.map((item, index) => <div className="takeaway" key={index}><b>0{index + 1}</b><p contentEditable suppressContentEditableWarning>{item}</p></div>)}</div></section>
            <section><div className="pager-section-number">02</div><div><span className="section-kicker">立即行动</span><p className="pager-big-copy" contentEditable suppressContentEditableWarning>{pager.action}</p></div></section>
            <section><div className="pager-section-number">03</div><div><span className="section-kicker">我的复盘</span><p className="pager-big-copy" contentEditable suppressContentEditableWarning>{pager.reflection}</p></div></section>
            <footer><span>知返 · 费曼学习助手</span><span>资料 → 骨架 → 输出 → 能力</span></footer>
          </article>
          <aside className="output-side">
            <div className="concept-note"><span className="section-kicker">完成度</span><h3>学习闭环已完成</h3><p>你已经走过知识提炼、主动输出、盲区诊断和成果沉淀。</p><div className="complete-ring">100<small>%</small></div></div>
            <button className="primary-btn full" onClick={exportMarkdown}><Download size={16} /> 导出 Markdown</button>
            <button className="secondary-btn full" onClick={generate}><RotateCcw size={16} /> 重新生成</button>
          </aside>
        </div>
      )}
    </>
  );
}

function CreateProjectModal({ onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ title: "", mode: "course", goal: "工作应用", level: "刚刚入门", time: "60分钟" });

  const create = () => {
    onCreate({
      id: `project-${Date.now()}`,
      title: form.title || "新的学习项目",
      description: "上传资料后，AI 将为你生成专属学习路线。",
      ...form,
      createdAt: Date.now(),
      progress: 8,
      analysis: { summary: "", highValue: [], modules: [], tacitKnowledge: [], scenarios: [], sources: [] },
      blindspots: [],
      sessions: [],
      onePager: null
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span>创建学习项目</span><small>第 {step} 步，共 2 步</small></div><button className="icon-btn" onClick={onClose}><X size={19} /></button></div>
        <div className="modal-progress"><i style={{ width: `${step * 50}%` }} /></div>
        {step === 1 ? (
          <div className="modal-body">
            <div className="field"><label>这次想学什么？</label><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：大语言模型底层逻辑" /></div>
            <div className="field"><label>选择学习方式</label><div className="mode-cards">
              <button className={form.mode === "course" ? "selected" : ""} onClick={() => setForm({ ...form, mode: "course" })}>
                <div><GraduationCap size={22} /></div><strong>榨干一门课程</strong><span>课件 + 录音转写，提炼讲师的隐性经验</span><i>{form.mode === "course" && <Check size={13} />}</i>
              </button>
              <button className={form.mode === "topic" ? "selected" : ""} onClick={() => setForm({ ...form, mode: "topic" })}>
                <div><BrainCircuit size={22} /></div><strong>快速了解一个主题</strong><span>多份教材与笔记，建立领域知识骨架</span><i>{form.mode === "topic" && <Check size={13} />}</i>
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
          <button className="primary-btn" onClick={() => step === 1 ? setStep(2) : create()} disabled={step === 1 && !form.title.trim()}>{step === 1 ? "下一步" : "创建并上传资料"} <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function NoAnalysis({ navigate }) {
  return <div className="empty-state large"><div><BrainCircuit size={32} /></div><h2>知识地图还没有生成</h2><p>先上传学习资料，AI 才能根据你的内容建立知识骨架。</p><button className="primary-btn" onClick={() => navigate("sources")}>去上传资料 <ArrowRight size={16} /></button></div>;
}

function EmptyMini({ text }) {
  return <div className="empty-mini">{text}</div>;
}

function Spinner() {
  return <span className="spinner" />;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")).render(<App />);
