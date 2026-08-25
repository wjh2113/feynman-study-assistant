import { embedTexts, embeddingStatus } from "../embedding.mjs";
import { chunkSources } from "../chunking.mjs";
import { getEmbeddingConfig } from "../model-config.mjs";
import { isLlmConfigured } from "../gateway-client.mjs";
import { parseFile } from "../document-parser.mjs";
import { buildDocumentOutline } from "../document-outline.mjs";
import { getObject } from "../object-storage.mjs";
import { fastJson } from "./llm.mjs";
import {
  buildSourceSummary,
  contentAnalysisMessages,
  corpusFrom,
  demoAnalysis,
  normalizeDocumentSummaries,
  normalizeQuestions
} from "./analyze.mjs";
import {
  getProject,
  listDocumentsForProject,
  recordEvent,
  replaceDocumentIndex,
  saveProject,
  updateDocumentInsights
} from "../storage.mjs";

/**
 * Rebuild subject knowledge map from remaining uploaded files.
 * Replaces modules/summary (does not merge with the previous map).
 */
export async function resummarizeProject(projectId, userId, onProgress = () => {}) {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("学习项目不存在");
  const documents = await listDocumentsForProject(projectId, userId);
  if (!documents.length) {
    const cleared = {
      ...project,
      userId,
      description: project.learningPlan?.summary || "上传学习资料后，AI 将生成学科知识地图。",
      progress: Math.min(Number(project.progress || 0), 8),
      onePager: null,
      analysis: {
        ...(project.analysis || {}),
        summary: "",
        highValue: [],
        modules: [],
        tacitKnowledge: [],
        scenarios: [],
        questions: [],
        documentSummaries: [],
        sources: [],
        needsResummarize: false,
        retrieval: {
          ...(project.analysis?.retrieval || {}),
          chunks: 0,
          parents: 0
        }
      }
    };
    await saveProject(cleared);
    return { project: cleared, documents: 0, resummarized: false };
  }

  onProgress(5);
  const embeddingConfig = await getEmbeddingConfig(userId);
  const sources = [];
  const storedSources = [];
  let allChunks = [];
  let totalParents = 0;

  for (const [index, document] of documents.entries()) {
    onProgress(5 + Math.round((index / documents.length) * 50));
    const buffer = await getObject({ key: document.stored_name, storagePath: document.storage_path });
    const source = await parseFile({
      originalname: document.filename,
      mimetype: document.mime_type,
      size: Number(document.byte_size || buffer.length),
      buffer
    }, userId);
    source.documentKey = document.id;
    source.summary = buildSourceSummary(source);
    source.parsedPreview = source.pages
      .map((page) => `第 ${page.page} 页\n${page.text}`)
      .join("\n\n")
      .slice(0, 30000);
    source.outline = buildDocumentOutline(source);
    sources.push(source);

    const hierarchy = chunkSources([source]);
    const embeddings = await embedTexts(
      hierarchy.chunks.map((chunk) => chunk.content),
      embeddingConfig.embedding
    );
    await replaceDocumentIndex({
      projectId,
      userId,
      document,
      source,
      chunks: hierarchy.chunks,
      embeddings
    });
    allChunks = allChunks.concat(hierarchy.chunks);
    totalParents += hierarchy.parents.length;
    const outline = buildDocumentOutline(source, {
      chunkCount: hierarchy.chunks.length,
      indexedCharacters: hierarchy.chunks.reduce((sum, chunk) => sum + String(chunk.content || "").length, 0)
    });
    storedSources.push({
      id: document.id,
      name: source.filename,
      type: source.type,
      pages: source.pages.length,
      chunks: hierarchy.chunks.length,
      size: Number(document.byte_size || buffer.length),
      status: "ready",
      chapterId: document.chapter_id || null,
      downloadUrl: `/api/documents/${document.id}/file`,
      summary: source.summary,
      parseReport: source.parseReport,
      parsedPreview: source.parsedPreview,
      outline
    });
  }

  onProgress(70);
  const demo = demoAnalysis(project.title, sources);
  const modelConfigured = await isLlmConfigured(userId);
  let result = {};
  if (modelConfigured) {
    result = await fastJson(
      contentAnalysisMessages(project.title, corpusFrom(sources), { resummarize: true }),
      0.35,
      userId,
      Number(process.env.INGESTION_GENERATION_TIMEOUT_MS || 90_000)
    );
    if (!result || typeof result !== "object") throw new Error("文本模型没有返回有效的重新总结结果");
  } else {
    result = demo;
  }

  onProgress(90);
  const documentSummaries = normalizeDocumentSummaries(result.documentSummaries, sources);
  const enrichedSources = storedSources.map((stored, index) => ({
    ...stored,
    summary: documentSummaries[index] || stored.summary
  }));
  await Promise.all(
    enrichedSources.map((source) => updateDocumentInsights(source.id, source.summary, source.parseReport))
  );

  const analysis = {
    ...demo,
    ...result,
    documentSummaries,
    sources: enrichedSources,
    modules: result.modules || demo.modules || [],
    questions: normalizeQuestions(result.questions, { ...demo, ...result, sources: enrichedSources }),
    needsResummarize: false,
    contentAnalysisStatus: "ready",
    contentAnalysisError: null,
    projectId,
    retrieval: {
      chunks: allChunks.length,
      parents: totalParents,
      embedding: embeddingStatus(embeddingConfig.embedding),
      strategy: "BGE-M3 + PostgreSQL关键词召回 + RRF + BGE Reranker",
      indexedAt: new Date().toISOString()
    },
    demo: !modelConfigured
  };

  const nextProject = {
    ...project,
    userId,
    description: analysis.summary || project.description,
    progress: enrichedSources.length ? Math.max(Number(project.progress || 0), 22) : 0,
    onePager: null,
    analysis
  };
  await saveProject(nextProject);
  await recordEvent(userId, projectId, "project_resummarized", {
    documents: enrichedSources.length,
    chunks: allChunks.length
  });
  onProgress(100);
  return {
    project: nextProject,
    documents: enrichedSources.length,
    chunks: allChunks.length,
    resummarized: true,
    demo: !modelConfigured
  };
}
