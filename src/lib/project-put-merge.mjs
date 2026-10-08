/**
 * Prevent browser dirty-sync from clobbering a newer server-side knowledge map
 * (e.g. study-pack import) with a stale interim "running / empty modules" snapshot.
 */

function moduleCount(analysis = {}) {
  return Array.isArray(analysis?.modules) ? analysis.modules.length : 0;
}

function isWeakMapSnapshot(analysis = {}) {
  const status = String(analysis?.contentAnalysisStatus || "");
  return moduleCount(analysis) === 0 && (status === "pending" || status === "running");
}

function isStrongMapSnapshot(analysis = {}) {
  return moduleCount(analysis) > 0 && String(analysis?.contentAnalysisStatus || "") === "ready";
}

function preferRicherSources(existing = [], incoming = []) {
  const byId = new Map((existing || []).map((source) => [String(source?.id || ""), source]));
  return (incoming || []).map((source) => {
    const prev = byId.get(String(source?.id || ""));
    if (!prev) return source;
    const prevBank = Array.isArray(prev.questionBank) ? prev.questionBank.length : 0;
    const nextBank = Array.isArray(source.questionBank) ? source.questionBank.length : 0;
    const prevMeta = prev.questionBankMeta || {};
    const nextMeta = source.questionBankMeta || {};
    // Keep imported/finished banks over interim pendingLlm heuristic seeds.
    if (prevMeta.generated && !nextMeta.generated) {
      return {
        ...source,
        questionBank: prev.questionBank,
        questionBankMeta: prevMeta,
        summary: source.summary || prev.summary
      };
    }
    if (prevBank > nextBank) {
      return {
        ...source,
        questionBank: prev.questionBank,
        questionBankMeta: prevMeta.pendingLlm && !prevMeta.generated
          ? prevMeta
          : { ...prevMeta, pendingLlm: false }
      };
    }
    return source;
  });
}

export function mergeProjectPut(existing, incoming) {
  if (!existing?.analysis || !incoming) return incoming;
  const ex = existing.analysis || {};
  const inc = incoming.analysis || {};
  if (!isStrongMapSnapshot(ex) || !isWeakMapSnapshot(inc)) {
    return incoming;
  }

  return {
    ...incoming,
    description: ex.summary || incoming.description,
    analysis: {
      ...inc,
      summary: ex.summary,
      highValue: ex.highValue,
      modules: ex.modules,
      questions: ex.questions,
      tacitKnowledge: ex.tacitKnowledge,
      scenarios: ex.scenarios,
      documentSummaries: Array.isArray(ex.documentSummaries) && ex.documentSummaries.length
        ? ex.documentSummaries
        : inc.documentSummaries,
      contentAnalysisStatus: ex.contentAnalysisStatus,
      contentAnalysisError: ex.contentAnalysisError,
      needsResummarize: false,
      importedPack: ex.importedPack || inc.importedPack,
      sources: preferRicherSources(ex.sources, inc.sources)
    }
  };
}
