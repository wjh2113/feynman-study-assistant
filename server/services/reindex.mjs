import { chunkSources } from "../chunking.mjs";
import { embedTexts, embeddingStatus } from "../embedding.mjs";
import { getEmbeddingConfig } from "../model-config.mjs";
import { parseFile } from "../document-parser.mjs";
import { getObject } from "../object-storage.mjs";
import {
  getProject,
  listDocumentsForProject,
  recordEvent,
  replaceDocumentIndex,
  saveProject
} from "../storage.mjs";

export async function reindexProject(projectId, userId, onProgress = () => {}) {
    const project = await getProject(projectId, userId);
    if (!project) throw new Error("学习项目不存在");
    const documents = await listDocumentsForProject(projectId, userId);
    if (!documents.length) throw new Error("当前项目没有可以重建索引的资料");
    let totalChunks = 0; let totalParents = 0;
    const updatedSources = new Map();
    const embeddingConfig = await getEmbeddingConfig(userId);
    for (const [documentIndex, document] of documents.entries()) {
      onProgress(Math.round(documentIndex / documents.length * 90));
      const buffer = await getObject({ key: document.stored_name, storagePath: document.storage_path });
      const source = await parseFile({
        originalname: document.filename,
        mimetype: document.mime_type,
        size: Number(document.byte_size || buffer.length),
        buffer
      }, userId);
      source.documentKey = document.id;
      source.parsedPreview = source.pages.map((page) => `第 ${page.page} 页\n${page.text}`).join("\n\n").slice(0, 30000);
      const hierarchy = chunkSources([source]);
      const embeddings = await embedTexts(hierarchy.chunks.map((chunk) => chunk.content), embeddingConfig.embedding);
      await replaceDocumentIndex({
        projectId,
        userId,
        document,
        source,
        chunks: hierarchy.chunks,
        embeddings
      });
      totalChunks += hierarchy.chunks.length;
      totalParents += hierarchy.parents.length;
      updatedSources.set(document.id, {
        chunks: hierarchy.chunks.length,
        pages: source.pages.length,
        parseReport: source.parseReport,
        parsedPreview: source.parsedPreview
      });
    }

  const nextProject = {
    ...project,
    userId,
      analysis: {
        ...(project.analysis || {}),
        sources: (project.analysis?.sources || []).map((source) => (
          updatedSources.has(source.id) ? { ...source, ...updatedSources.get(source.id) } : source
        )),
        retrieval: {
          chunks: totalChunks,
          parents: totalParents,
          embedding: embeddingStatus(embeddingConfig.embedding),
          strategy: "BGE-M3 + PostgreSQL关键词召回 + RRF + BGE Reranker",
          indexedAt: new Date().toISOString()
        }
      }
    };
    await saveProject(nextProject);
    await recordEvent(userId, projectId, "documents_reindexed", { documents: documents.length, chunks: totalChunks, parents: totalParents });
    onProgress(100);
    return { project: nextProject, documents: documents.length, chunks: totalChunks, parents: totalParents };
}
