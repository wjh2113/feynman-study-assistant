import { dedupeAnalysisSources } from "../../src/lib/analysis-sources.mjs";
import { deleteDocument, getProject, listDocumentsForProject, saveProject } from "../storage.mjs";

/**
 * Keep one persisted document per filename (best chunk count / readiness wins).
 * Removes duplicate rows and their vectors when removeDuplicates is true.
 */
export async function dedupeProjectDocuments(projectId, userId, { removeDuplicates = true } = {}) {
  const documents = await listDocumentsForProject(projectId, userId);
  if (documents.length <= 1) return documents;

  const ranked = dedupeAnalysisSources(
    documents.map((doc) => ({
      id: doc.id,
      name: doc.filename,
      chunks: Number(doc.chunk_count || 0),
      status: "ready"
    }))
  );
  const keepIds = new Set(ranked.map((item) => item.id));
  const duplicates = documents.filter((doc) => !keepIds.has(doc.id));

  if (removeDuplicates && duplicates.length) {
    for (const doc of duplicates) {
      await deleteDocument(projectId, doc.id);
    }
  }

  return documents.filter((doc) => keepIds.has(doc.id));
}

export async function syncProjectSourcesFromDocuments(projectId, userId) {
  const project = await getProject(projectId, userId);
  if (!project) return null;

  const documents = await dedupeProjectDocuments(projectId, userId);
  const docIds = new Set(documents.map((doc) => doc.id));
  const existing = (project.analysis?.sources || []).filter((source) => docIds.has(source.id));
  const merged = dedupeAnalysisSources(existing);

  if (merged.length === existing.length && merged.length === (project.analysis?.sources || []).length) {
    return project;
  }

  const nextProject = {
    ...project,
    userId,
    analysis: {
      ...(project.analysis || {}),
      sources: merged
    }
  };
  await saveProject(nextProject);
  return nextProject;
}
