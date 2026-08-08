import React, { useCallback, useEffect, useRef, useState } from "react";
import { CreateProjectModal } from "../components/CreateProjectModal.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  X
} from "../components/icons.jsx";
import { demoProject } from "../lib/demoProject.js";
import { withCurrentDemoContent } from "../lib/demoHelpers.js";
import { navItems } from "../lib/nav.js";
import { recalculateMasteryAndProgress } from "../lib/progress.mjs";
import { getProject, listProjects, putProject } from "../api/projects.js";
import { getIngestion, listIngestions, retryIngestion as retryIngestionApi } from "../api/ingest.js";
import { useAuth } from "../features/auth/useAuth.js";
import { AuthPage } from "../features/auth/AuthPage.jsx";
import { Overview } from "../features/overview/Overview.jsx";
import { Sources } from "../features/sources/Sources.jsx";
import { KnowledgeMap } from "../features/map/KnowledgeMap.jsx";
import { RagAssistant } from "../features/rag/RagAssistant.jsx";
import { Coach } from "../features/coach/Coach.jsx";
import { Blindspots } from "../features/blindspots/Blindspots.jsx";
import { OutputStudio } from "../features/output/OutputStudio.jsx";
import { ModelSettingsPage } from "../features/settings/ModelSettingsPage.jsx";

export function App() {
  const { user, loading: authLoading, login, register, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [analysisTasks, setAnalysisTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const dirtyProjectIdsRef = useRef(new Set());
  const projectsRef = useRef(projects);
  const analysisTasksRef = useRef(analysisTasks);
  const pollInFlightRef = useRef(false);
  const finalizedTaskIdsRef = useRef(new Set());
  const toastTimerRef = useRef(0);

  projectsRef.current = projects;
  analysisTasksRef.current = analysisTasks;

  const project = projects.find((item) => item.id === activeProjectId) || projects[0];

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  const notify = useCallback((message, type = "success", action = null) => {
    setNotifications((items) => [
      { id: `${Date.now()}-${Math.random()}`, message, type, action, createdAt: Date.now() },
      ...items
    ].slice(0, 20));
    showToast(message);
  }, [showToast]);

  const markDirty = useCallback((projectId) => {
    if (projectId) dirtyProjectIdsRef.current.add(projectId);
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setActiveProjectId(null);
      setPersistenceReady(false);
      dirtyProjectIdsRef.current.clear();
      finalizedTaskIdsRef.current.clear();
      return undefined;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const data = await listProjects();
        if (cancelled) return;
        if (data.projects?.length) {
          setProjects(data.projects.map(withCurrentDemoContent));
          setActiveProjectId((current) =>
            data.projects.some((item) => item.id === current) ? current : data.projects[0].id
          );
        } else {
          const demo = { ...demoProject, id: `demo-${user.id}` };
          await putProject(demo.id, demo);
          if (!cancelled) {
            setProjects([demo]);
            setActiveProjectId(demo.id);
          }
        }
        dirtyProjectIdsRef.current.clear();
        if (!cancelled) setPersistenceReady(true);
      } catch (error) {
        if (!cancelled) showToast(`持久化连接失败：${error.message}`);
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [user, showToast]);

  useEffect(() => {
    if (!persistenceReady || !user) return undefined;
    const timer = window.setTimeout(() => {
      const dirtyIds = [...dirtyProjectIdsRef.current];
      if (!dirtyIds.length) return;
      const snapshot = projectsRef.current;
      dirtyIds.forEach((id) => {
        const item = snapshot.find((projectItem) => projectItem.id === id);
        if (!item) {
          dirtyProjectIdsRef.current.delete(id);
          return;
        }
        putProject(item.id, item)
          .then(() => {
            dirtyProjectIdsRef.current.delete(id);
          })
          .catch(() => showToast("项目暂时只保存在本机浏览器，数据库同步失败"));
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [projects, persistenceReady, user, showToast]);

  const updateProject = (patch) => {
    setProjects((items) =>
      items.map((item) => {
        if (item.id !== activeProjectId) return item;
        markDirty(item.id);
        const merged = { ...item, ...patch };
        return recalculateMasteryAndProgress(merged);
      })
    );
  };

  const trackAnalysisTask = (task, projectId, filenames, ingestionId) => {
    finalizedTaskIdsRef.current.delete(task.id);
    setAnalysisTasks((items) => [
      ...items.filter((item) => item.id !== task.id),
      { id: task.id, ingestionId, projectId, filenames, status: task.status || "waiting", progress: 0, stage: "queued", label: "等待后台任务开始" }
    ]);
  };

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    listIngestions("waiting,active")
      .then((data) => {
        if (!cancelled) setAnalysisTasks((data.ingestions || []).map((item) => ({
          id: item.id,
          ingestionId: item.id,
          projectId: item.projectId,
          filenames: item.filenames || [],
          status: item.status,
          progress: item.progress || 0,
          stage: item.stage || "queued",
          label: "正在恢复后台解析任务"
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    const poll = async () => {
      const tasks = analysisTasksRef.current;
      if (!tasks.length || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const updates = await Promise.all(tasks.map(async (tracked) => {
          try {
            const data = await getIngestion(tracked.ingestionId);
            return { tracked, task: data.ingestion };
          } catch (error) {
            return { tracked, error };
          }
        }));
        if (cancelled) return;

        for (const { tracked, task, error } of updates) {
          if (error) continue;
          if (finalizedTaskIdsRef.current.has(tracked.id)) continue;

          if (task.status === "completed" || task.status === "failed") {
            finalizedTaskIdsRef.current.add(tracked.id);
            setAnalysisTasks((items) => items.filter((item) => item.id !== tracked.id));
            if (task.status === "completed") {
              try {
                const data = await getProject(tracked.projectId);
                if (data.project) {
                  dirtyProjectIdsRef.current.delete(tracked.projectId);
                  setProjects((items) => items.map((item) => (
                    item.id === tracked.projectId ? withCurrentDemoContent(data.project) : item
                  )));
                }
              } catch {
                // keep previous project state if refresh fails
              }
              notify(`资料解析完成：${tracked.filenames.join("、")}`);
            } else {
              notify(`资料解析失败：${task.error || "请检查模型配置后重试"}`, "error", {
                ingestionId: tracked.ingestionId,
                projectId: tracked.projectId,
                filenames: tracked.filenames
              });
            }
            continue;
          }

          const progress = typeof task.progress === "object" ? task.progress : { percent: Number(task.progress || 0), stage: task.stage };
          const stageLabels = {
            queued: "等待后台任务开始",
            ocr: "正在解析文档与识别图片",
            embedding: "正在生成 Embedding 向量",
            content: "正在生成内容分析",
            storage: "正在写入资料与索引"
          };
          setAnalysisTasks((items) => items.map((item) => item.id === tracked.id
            ? {
              ...item,
              status: task.status,
              progress: Number(progress.percent || 0),
              stage: progress.stage || item.stage,
              label: progress.label || stageLabels[progress.stage] || item.label
            }
            : item));
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    if (analysisTasks.length) {
      poll();
      const timer = window.setInterval(poll, 1800);
      return () => { cancelled = true; window.clearInterval(timer); };
    }
    return () => { cancelled = true; };
  }, [analysisTasks.length, user, notify]);

  const retryIngestion = async (notification) => {
    const action = notification.action;
    if (!action?.ingestionId) return;
    try {
      const data = await retryIngestionApi(action.ingestionId);
      trackAnalysisTask(data.task, action.projectId, action.filenames, data.ingestionId);
      setNotifications((items) => items.filter((item) => item.id !== notification.id));
      showToast(`已从“${data.resumedFrom || "失败阶段"}”继续解析`);
    } catch (error) {
      showToast(error.message);
    }
  };

  const changeView = (id) => {
    setActiveView(id);
    setSidebarOpen(false);
  };

  const handleCreate = (newProject) => {
    markDirty(newProject.id);
    setProjects((items) => [newProject, ...items]);
    setActiveProjectId(newProject.id);
    setActiveView("sources");
    setCreateOpen(false);
    showToast("学习项目已创建，上传资料开始第一步");
  };

  const handleLogout = async () => {
    await logout();
    showToast("已退出登录");
  };

  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark"><span>知</span></div>
            <div><strong>知返</strong><small>费曼学习助手</small></div>
          </div>
          <div className="settings-loading"><Spinner /> 正在检查登录状态…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={{ login, register }} />;
  }

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
          <div className="project-glyph">{project?.title?.slice(0, 1) || "?"}</div>
          <div className="project-switcher-copy">
            <strong>{project?.title || "加载中…"}</strong>
            <span>{project?.mode === "course" ? "课程精学" : "主题速学"} · {project?.progress || 8}%</span>
          </div>
          <ChevronDown size={15} />
          <select
            className="project-native-select"
            aria-label="切换学习项目"
            value={activeProjectId || ""}
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
              {id === "blindspots" && project?.blindspots?.filter((x) => x.status !== "done").length > 0 && (
                <em>{project.blindspots.filter((x) => x.status !== "done").length}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="model-chip"><Sparkles size={14} /> DeepSeek V4 Pro</div>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => changeView("settings")}><Settings size={17} /> 模型设置</button>
          <div className="profile">
            <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
            <div><strong>{user.username}</strong><span>{user.id.slice(0, 8)}</span></div>
            <button className="icon-btn" onClick={handleLogout} title="退出登录"><X size={17} /></button>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs">
            <span>学习项目</span><ChevronRight size={14} /><strong>{project?.title || ""}</strong>
          </div>
          <div className="topbar-actions">
            <button className="search-pill" onClick={() => changeView("rag")}><Search size={16} /><span>询问资料库</span><kbd>RAG</kbd></button>
            <button className="model-settings-shortcut" onClick={() => changeView("settings")}><Settings size={16} /><span>模型配置</span></button>
            <div className="notification-shell">
              <button className="icon-btn notification-button" aria-label="任务通知" onClick={() => setNotificationsOpen((value) => !value)}>
                <CircleAlert size={18} />
                {!!notifications.length && <em>{Math.min(notifications.length, 9)}</em>}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <header><strong>任务通知</strong><button onClick={() => setNotifications([])}>清空</button></header>
                  {notifications.length ? notifications.map((item) => (
                    <div className={`notification-item ${item.type}`} key={item.id}>
                      <span>{item.message}</span>
                      {item.action?.ingestionId && <button onClick={() => retryIngestion(item)}>继续重试</button>}
                    </div>
                  )) : <p>暂无任务通知</p>}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-wrap">
          {project ? (
            <>
              {activeView === "overview" && <Overview project={project} navigate={changeView} />}
              {activeView === "sources" && <Sources project={project} updateProject={updateProject} navigate={changeView} showToast={showToast} onTaskStarted={trackAnalysisTask} analysisTask={analysisTasks.find((task) => task.projectId === project.id)} />}
              {activeView === "map" && <KnowledgeMap project={project} navigate={changeView} />}
              {activeView === "rag" && <RagAssistant project={project} navigate={changeView} showToast={showToast} />}
              {activeView === "coach" && <Coach project={project} updateProject={updateProject} showToast={showToast} navigate={changeView} />}
              {activeView === "blindspots" && <Blindspots project={project} updateProject={updateProject} showToast={showToast} navigate={changeView} />}
              {activeView === "output" && <OutputStudio project={project} updateProject={updateProject} showToast={showToast} />}
              {activeView === "settings" && <ModelSettingsPage showToast={showToast} />}
            </>
          ) : (
            <div className="empty-state large">
              <div><BrainCircuit size={32} /></div>
              <h2>还没有学习项目</h2>
              <p>点击左侧“新建学习项目”开始。</p>
            </div>
          )}
        </div>
      </main>

      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}
