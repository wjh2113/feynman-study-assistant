import { registerTaskHandler } from "./task-queue.mjs";
import { runAnalysisJob, runContentEnrichmentJob } from "./services/analyze.mjs";
import { runDocumentQuestionBankJob } from "./services/document-question-bank.mjs";
import { completeDocumentDelete } from "./services/document-delete.mjs";
import { reindexProject } from "./services/reindex.mjs";
import { resummarizeProject } from "./services/resummarize.mjs";

/** Register BullMQ handlers at boot so restarted workers can pick up queued jobs. */
export function bootstrapTaskHandlers() {
  registerTaskHandler("analyze", runAnalysisJob);
  registerTaskHandler("content-enrichment", runContentEnrichmentJob);
  registerTaskHandler("document-question-banks", runDocumentQuestionBankJob);
  registerTaskHandler("document-delete", (payload, progress) => completeDocumentDelete(payload, progress));
  registerTaskHandler("reindex", ({ projectId, userId }, progress) => reindexProject(projectId, userId, progress));
  registerTaskHandler("resummarize", ({ projectId, userId }, progress) => resummarizeProject(projectId, userId, progress));
}
