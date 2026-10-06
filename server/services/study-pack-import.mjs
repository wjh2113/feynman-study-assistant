import { getObject } from "../object-storage.mjs";
import { enqueueTask } from "../task-queue.mjs";
import { importedQuestionBankMeta, shouldApplyImportedTitle } from "../../src/lib/study-pack.mjs";
import { normalizeBankQuestion } from "../../src/lib/document-question-bank.mjs";
import { analyzeFiles } from "./analyze.mjs";
import {
  deleteDocument,
  getIngestionJob,
  getProject,
  listDocumentsForProject,
  recordEvent,
  saveProject,
  updateIngestionJob
} from "../storage.mjs";

function sourceName(source) {
  return String(source?.name || source?.filename || "").trim();
}

function overlayImportedAnalysis({ project, pack, storedSources, embeddingMeta = {} }) {
  const packByName = new Map((pack.sources || []).map((source) => [source.name, source]));
  const incoming = storedSources.map((stored) => {
    const packed = packByName.get(sourceName(stored));
    const questionBank = (packed?.questionBank || []).map((question, index) =>
      normalizeBankQuestion(question, stored, index)
    );
    return {
      ...stored,
      summary: packed?.summary?.summary
        ? { ...stored.summary, ...packed.summary }
        : stored.summary,
      questionBank,
      questionBankMeta: importedQuestionBankMeta(questionBank.length)
    };
  });
  const incomingNames = new Set(incoming.map(sourceName));
  const kept = (project.analysis?.sources || []).filter((source) => !incomingNames.has(sourceName(source)));
  const documentSummaries = incoming.map((source) => ({
    filename: source.name,
    summary: source.summary?.summary || "",
    keyPoints: source.summary?.keyPoints || [],
    confidence: source.summary?.confidence || "high",
    verificationNote: "由外部学科包导入"
  }));

  return {
    ...(project.analysis || {}),
    summary: pack.summary || project.analysis?.summary || "",
    highValue: pack.highValue || [],
    modules: pack.modules || [],
    questions: pack.questions || [],
    tacitKnowledge: pack.tacitKnowledge || [],
    scenarios: pack.scenarios || [],
    documentSummaries,
    sources: [...kept, ...incoming],
    needsResummarize: false,
    contentAnalysisStatus: "ready",
    contentAnalysisError: null,
    importedPack: {
      schema: "zhifan-study-pack/v1",
      importedAt: Date.now()
    },
    retrieval: {
      ...(project.analysis?.retrieval || {}),
      ...embeddingMeta,
      strategy: project.analysis?.retrieval?.strategy
        || "BGE-M3 + PostgreSQL关键词召回 + RRF + BGE Reranker"
    },
    demo: false
  };
}

async function removeSameNamedDocuments(projectId, userId, filenames) {
  const wanted = new Set(filenames.map((name) => String(name || "").trim()));
  const documents = await listDocumentsForProject(projectId, userId);
  for (const document of documents) {
    if (!wanted.has(String(document.filename || "").trim())) continue;
    await deleteDocument(projectId, document.id);
  }
  const project = await getProject(projectId, userId);
  if (!project) return;
  const remainingSources = (project.analysis?.sources || []).filter(
    (source) => !wanted.has(sourceName(source))
  );
  await saveProject({
    ...project,
    userId,
    analysis: {
      ...(project.analysis || {}),
      sources: remainingSources
    }
  });
}

export async function importStudyPack({
  files,
  userId,
  title,
  mode,
  projectId,
  pack,
  storedFiles = [],
  checkpoint = {},
  onCheckpoint = async () => {},
  onProgress = () => {}
}) {
  const existing = await getProject(projectId, userId);
  if (!existing) throw new Error("学习项目不存在");
  await onProgress({ percent: 4, stage: "ocr", label: "正在导入学科包" });
  await removeSameNamedDocuments(projectId, userId, files.map((file) => file.originalname));

  const indexed = await analyzeFiles({
    files,
    userId,
    title: shouldApplyImportedTitle(existing.title) && title ? title : existing.title,
    mode: mode || existing.mode,
    projectId,
    storedFiles,
    checkpoint,
    onCheckpoint,
    onProgress,
    skipLlm: true
  });

  const latest = await getProject(projectId, userId);
  const analysis = overlayImportedAnalysis({
    project: latest,
    pack,
    storedSources: indexed.storedSources || [],
    embeddingMeta: indexed.embeddingMeta || {}
  });
  const nextTitle = shouldApplyImportedTitle(latest.title) && title ? title : latest.title;
  await saveProject({
    ...latest,
    userId,
    title: nextTitle,
    description: analysis.summary || latest.description,
    progress: Math.max(Number(latest.progress || 0), 80),
    analysis
  });
  await recordEvent(userId, projectId, "study_pack_imported", {
    files: files.map((file) => file.originalname),
    modules: (analysis.modules || []).length,
    questions: (analysis.sources || []).reduce((sum, source) => sum + (source.questionBank || []).length, 0)
  });
  await onProgress({ percent: 100, stage: "completed", label: "学科包已导入" });
  return analysis;
}

export async function runStudyPackImportJob(payload, progress = () => {}) {
  const ingestion = await getIngestionJob(payload.ingestionId, payload.userId);
  if (!ingestion) throw new Error("后台导入记录不存在");
  let currentStage = ingestion.stage || "queued";
  const reportProgress = async (value) => {
    const info = typeof value === "object" ? value : { percent: Number(value || 0) };
    currentStage = info.stage || currentStage;
    await updateIngestionJob(payload.ingestionId, payload.userId, {
      status: info.stage === "completed" ? "completed" : "active",
      stage: currentStage,
      progress: Number(info.percent || 0),
      error: null
    });
    progress(info);
  };
  try {
    await updateIngestionJob(payload.ingestionId, payload.userId, { status: "active", error: null });
    const hydratedFiles = await Promise.all(payload.files.map(async (file) => ({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: await getObject({ key: file.stored.storedName, storagePath: file.stored.storagePath })
    })));
    const analysis = await importStudyPack({
      ...payload,
      files: hydratedFiles,
      storedFiles: payload.files.map((file) => ({ ...file.stored, documentKey: file.documentKey })),
      checkpoint: ingestion.checkpoint,
      onCheckpoint: (patch) => updateIngestionJob(payload.ingestionId, payload.userId, { checkpoint: patch }),
      onProgress: reportProgress
    });
    await updateIngestionJob(payload.ingestionId, payload.userId, {
      status: "completed",
      stage: "completed",
      progress: 100,
      error: null
    });
    return { projectId: payload.projectId, ingestionId: payload.ingestionId, analysis };
  } catch (error) {
    await updateIngestionJob(payload.ingestionId, payload.userId, {
      status: "failed",
      stage: currentStage,
      error: error.message
    });
    throw error;
  }
}

export function enqueueStudyPackImport(payload) {
  return enqueueTask("import-pack", payload, runStudyPackImportJob);
}
