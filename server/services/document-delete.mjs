import { isImportedStudyPack } from "../../src/lib/study-pack.mjs";
import {
  countDocumentChunks,
  deleteChunksByFilename,
  deleteDocument,
  findProjectDocument,
  getProject,
  listDocumentsForProject,
  recordEvent,
  saveProject
} from "../storage.mjs";
import { resummarizeProject } from "./resummarize.mjs";

/**
 * Physical cleanup + optional map rebuild after the project record was already updated.
 * External study-pack imports skip auto LLM re-summarize (map/banks already came from the pack).
 */
export async function completeDocumentDelete(
  {
    projectId,
    userId,
    sourceId,
    sourceName,
    storedId = null,
    filename = null,
    skipLlmRebuild = false
  },
  onProgress = () => {}
) {
  try {
    onProgress(5);
    let chunksDeleted = 0;

    if (storedId) {
      const removal = await deleteDocument(projectId, storedId);
      if (removal.deleted) chunksDeleted += Number(removal.chunksDeleted || 0);
    } else if (filename) {
      const stored = await findProjectDocument(projectId, userId, { documentId: sourceId, filename });
      if (stored?.id) {
        const removal = await deleteDocument(projectId, stored.id);
        if (removal.deleted) chunksDeleted += Number(removal.chunksDeleted || 0);
      }
    }

    chunksDeleted += await deleteChunksByFilename(projectId, sourceName || filename);
    onProgress(35);

    const remainingDocuments = await listDocumentsForProject(projectId, userId);
    const remainingChunks = await countDocumentChunks(projectId);
    let resummarize = null;
    const project = await getProject(projectId, userId);
    const preserveImported = skipLlmRebuild || isImportedStudyPack(project);

    if (remainingDocuments.length && !preserveImported) {
      onProgress(45);
      const mapOnly = remainingChunks > 0;
      resummarize = await resummarizeProject(projectId, userId, (value) => {
        onProgress(45 + Math.round(Number(value || 0) * 0.55));
      }, { mapOnly });
    } else if (project) {
      await saveProject({
        ...project,
        userId,
        analysis: {
          ...(project.analysis || {}),
          contentAnalysisStatus: "ready",
          contentAnalysisError: null,
          needsResummarize: false,
          retrieval: {
            ...(project.analysis?.retrieval || {}),
            chunks: remainingChunks,
            ...(remainingDocuments.length
              ? {}
              : { parents: 0 })
          }
        }
      });
    }

    await recordEvent(userId, projectId, "document_delete_completed", {
      sourceId,
      filename: sourceName || filename,
      chunksDeleted,
      mapOnly: Boolean(resummarize?.mapOnly),
      skippedLlmRebuild: Boolean(preserveImported)
    });
    onProgress(100);

    return {
      chunksDeleted,
      resummarize,
      remainingDocuments: remainingDocuments.length,
      skippedLlmRebuild: Boolean(preserveImported)
    };
  } catch (error) {
    const project = await getProject(projectId, userId);
    if (project) {
      await saveProject({
        ...project,
        userId,
        analysis: {
          ...(project.analysis || {}),
          contentAnalysisStatus: "failed",
          contentAnalysisError: error.message || "资料删除后重建知识地图失败",
          needsResummarize: !isImportedStudyPack(project)
        }
      });
    }
    throw error;
  }
}
