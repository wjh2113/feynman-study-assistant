import { Router } from "express";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import { getObject } from "../object-storage.mjs";
import {
  deleteChapter,
  deleteDocument,
  deleteProject,
  ensureDefaultChapter,
  getChapter,
  getDocument,
  getProject,
  listChapters,
  listDocumentsForProject,
  listProjects,
  projectBelongsToUser,
  recordEvent,
  saveChapter,
  saveProject
} from "../storage.mjs";

const router = Router();

router.get("/api/projects/:projectId/export", async (req, res) => {
  const project = await getProject(req.params.projectId, req.userId);
  if (!project) return res.status(404).json({ error: "学习项目不存在" });
  const format = String(req.query.format || "markdown");
  const markdown = `# ${project.title}\n\n${project.analysis?.summary || project.description || ""}\n\n## 核心知识\n${(project.analysis?.modules || []).flatMap((module) => module.concepts || []).map((concept) => `- **${concept.title}**：${concept.explanation || ""}`).join("\n")}\n\n## 盲区\n${(project.blindspots || []).map((item) => `- ${item.title}：${item.problem || ""}`).join("\n")}`;
  if (format === "json") return res.attachment(`${project.id}.json`).type("application/json").send(JSON.stringify(project, null, 2));
  if (format === "zip") { const zip = new JSZip(); zip.file("README.md", markdown); zip.file("project.json", JSON.stringify(project, null, 2)); return res.attachment(`${project.id}.zip`).type("application/zip").send(await zip.generateAsync({ type: "nodebuffer" })); }
  res.attachment(`${project.id}.md`).type("text/markdown; charset=utf-8").send(markdown);
});

router.get("/api/projects", async (req, res) => {
  try {
    const projects = await listProjects(req.userId);
    res.json({
      projects: await Promise.all(projects.map(async (project) => ({
        ...project,
        documentCount: (await listDocumentsForProject(project.id, req.userId)).length
      })))
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "读取项目失败" });
  }
});

router.get("/api/projects/:projectId", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId, req.userId);
    if (!project) return res.status(404).json({ error: "学习项目不存在" });
    res.json({ project: { ...project, documentCount: (await listDocumentsForProject(project.id, req.userId)).length } });
  } catch (error) {
    res.status(500).json({ error: error.message || "读取项目失败" });
  }
});

router.put("/api/projects/:projectId", async (req, res) => {
  try {
    const project = { ...(req.body || {}), id: req.params.projectId, userId: req.userId };
    await saveProject(project);
    await ensureDefaultChapter(req.params.projectId, req.userId);
    res.json({ project });
  } catch (error) {
    res.status(400).json({ error: error.message || "保存项目失败" });
  }
});

router.delete("/api/projects/:projectId", async (req, res) => {
  try {
    await deleteProject(req.params.projectId, req.userId);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message || "删除项目失败" });
  }
});

router.get("/api/projects/:projectId/chapters", async (req, res) => {
  try {
    if (!(await projectBelongsToUser(req.params.projectId, req.userId))) {
      return res.status(404).json({ error: "学习项目不存在" });
    }
    const chapters = await listChapters(req.params.projectId, req.userId);
    res.json({ chapters });
  } catch (error) {
    res.status(500).json({ error: error.message || "读取章节失败" });
  }
});

router.post("/api/projects/:projectId/chapters", async (req, res) => {
  try {
    if (!(await projectBelongsToUser(req.params.projectId, req.userId))) {
      return res.status(404).json({ error: "学习项目不存在" });
    }
    const title = String(req.body?.title || "").trim() || "未命名章节";
    const existing = await listChapters(req.params.projectId, req.userId);
    const sortOrder = existing.length
      ? Math.max(...existing.map((item) => Number(item.sortOrder || 0))) + 1
      : 0;
    const now = Date.now();
    const chapter = await saveChapter({
      id: randomUUID(),
      projectId: req.params.projectId,
      userId: req.userId,
      title,
      sortOrder,
      blindspots: [],
      sessions: [],
      onePager: null,
      analysis: {},
      createdAt: now
    });
    res.status(201).json({ chapter });
  } catch (error) {
    res.status(400).json({ error: error.message || "创建章节失败" });
  }
});

router.put("/api/projects/:projectId/chapters/:chapterId", async (req, res) => {
  try {
    const existing = await getChapter(req.params.chapterId, req.userId);
    if (!existing || existing.projectId !== req.params.projectId) {
      return res.status(404).json({ error: "章节不存在" });
    }
    const body = req.body || {};
    const next = {
      ...existing,
      ...body,
      id: existing.id,
      projectId: existing.projectId,
      userId: req.userId,
      title: body.title !== undefined ? String(body.title || "").trim() || existing.title : existing.title,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder
    };
    if (body.state && typeof body.state === "object") {
      Object.assign(next, body.state);
    }
    const chapter = await saveChapter(next);
    res.json({ chapter });
  } catch (error) {
    res.status(400).json({ error: error.message || "保存章节失败" });
  }
});

router.delete("/api/projects/:projectId/chapters/:chapterId", async (req, res) => {
  try {
    const existing = await getChapter(req.params.chapterId, req.userId);
    if (!existing || existing.projectId !== req.params.projectId) {
      return res.status(404).json({ error: "章节不存在" });
    }
    await deleteChapter(req.params.chapterId, req.userId);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message || "删除章节失败" });
  }
});

router.delete("/api/projects/:projectId/documents/:documentId", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId, req.userId);
    if (!project) return res.status(404).json({ error: "学习项目不存在" });

    const sources = project.analysis?.sources || [];
    const source = sources.find((item) => item.id === req.params.documentId);
    if (!source) return res.status(404).json({ error: "资料不存在或不属于当前项目" });

    await deleteDocument(req.params.projectId, req.params.documentId);
    const remainingSources = sources.filter((item) => item.id !== req.params.documentId);
    const removeRefs = (refs) =>
      (refs || []).filter((ref) => String(ref.file || "") !== String(source.name || ""));
    const analysis = {
      ...(project.analysis || {}),
      sources: remainingSources,
      modules: (project.analysis?.modules || []).map((module) => ({
        ...module,
        concepts: (module.concepts || []).map((concept) => ({
          ...concept,
          sourceRefs: removeRefs(concept.sourceRefs)
        }))
      })),
      questions: (project.analysis?.questions || []).map((question) => ({
        ...question,
        sourceRefs: removeRefs(question.sourceRefs)
      })),
      tacitKnowledge: (project.analysis?.tacitKnowledge || []).map((item) => ({
        ...item,
        sourceRef: item.sourceRef?.file === source.name ? null : item.sourceRef
      })),
      documentSummaries: (project.analysis?.documentSummaries || []).filter(
        (item) => String(item.filename || item.name || "") !== String(source.name || "")
      ),
      retrieval: {
        ...(project.analysis?.retrieval || {}),
        chunks: Math.max(
          0,
          Number(project.analysis?.retrieval?.chunks || 0) - Number(source.chunks || 0)
        )
      }
    };
    const nextProject = {
      ...project,
      userId: req.userId,
      analysis,
      blindspots: (project.blindspots || []).filter(
        (item) => !String(item.source || "").startsWith(String(source.name || ""))
      )
    };
    await saveProject(nextProject);
    await recordEvent(req.userId, req.params.projectId, "document_deleted", {
      documentId: req.params.documentId,
      filename: source.name
    });
    res.json({ project: nextProject, deleted: { id: source.id, name: source.name } });
  } catch (error) {
    res.status(400).json({ error: error.message || "删除资料失败" });
  }
});

router.get("/api/documents/:documentId/file", async (req, res) => {
  try {
    const document = await getDocument(req.params.documentId, req.userId);
    if (!document) return res.status(404).json({ error: "资料不存在" });
    res.attachment(document.filename);
    res.type(document.mime_type || "application/octet-stream");
    res.send(await getObject({ key: document.stored_name, storagePath: document.storage_path }));
  } catch (error) {
    res.status(404).json({ error: error.message || "资料文件不存在" });
  }
});

export default router;
