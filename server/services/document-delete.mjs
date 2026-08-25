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
 */
export async function completeDocumentDelete(
  {
    projectId,
    userId,
    sourceId,
    sourceName,
    storedId = null,
    filename = null
  },
  onProgress = () => {}
) {
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

  if (remainingDocuments.length) {
    onProgress(45);
    const mapOnly = remainingChunks > 0;
    resummarize = await resummarizeProject(projectId, userId, (value) => {
      onProgress(45 + Math.round(Number(value || 0) * 0.55));
    }, { mapOnly });
  } else {
    const project = await getProject(projectId, userId);
    if (project) {
      await saveProject({
        ...project,
        userId,
        analysis: {
          ...(project.analysis || {}),
          retrieval: {
            ...(project.analysis?.retrieval || {}),
            chunks: 0,
            parents: 0
          }
        }
      });
    }
  }

  await recordEvent(userId, projectId, "document_delete_completed", {
    sourceId,
    filename: sourceName || filename,
    chunksDeleted,
    mapOnly: Boolean(resummarize?.mapOnly)
  });
  onProgress(100);

  return {
    chunksDeleted,
    resummarize,
    remainingDocuments: remainingDocuments.length
  };
}
