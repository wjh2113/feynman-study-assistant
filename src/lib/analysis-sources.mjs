export function sourceDisplayName(source) {
  return String(source?.name || source?.filename || "").trim().toLowerCase();
}

function sourceReadiness(source) {
  const status = String(source?.status || "").toLowerCase();
  if (status === "ready") return 3;
  if (status === "processing" || status === "indexing") return 2;
  if (status === "failed" || status === "error") return 0;
  return 1;
}

export function preferAnalysisSource(next, prev) {
  if (!prev) return true;
  const nextReady = sourceReadiness(next);
  const prevReady = sourceReadiness(prev);
  if (nextReady !== prevReady) return nextReady > prevReady;

  const nextChunks = Number(next?.chunks ?? next?.chunkCount ?? 0);
  const prevChunks = Number(prev?.chunks ?? prev?.chunkCount ?? 0);
  if (nextChunks !== prevChunks) return nextChunks > prevChunks;

  const nextUpdated = Date.parse(next?.updatedAt || next?.indexedAt || "") || 0;
  const prevUpdated = Date.parse(prev?.updatedAt || prev?.indexedAt || "") || 0;
  if (nextUpdated !== prevUpdated) return nextUpdated > prevUpdated;

  return String(next.id) > String(prev.id);
}

/** Keep one entry per display name; unnamed sources stay unique by id. */
export function dedupeAnalysisSources(sources = []) {
  const named = new Map();
  const unnamed = [];

  for (const source of sources || []) {
    if (!source?.id) continue;
    const nameKey = sourceDisplayName(source);
    if (!nameKey) {
      unnamed.push(source);
      continue;
    }
    const prev = named.get(nameKey);
    named.set(nameKey, prev && !preferAnalysisSource(source, prev) ? prev : source);
  }

  const keptIds = new Set([...named.values()].map((item) => item.id));
  return [...named.values(), ...unnamed.filter((item) => !keptIds.has(item.id))];
}

export function mapDocumentIdsToDeduped(selectedIds = [], sources = []) {
  const deduped = dedupeAnalysisSources(sources);
  const preferredByName = new Map(
    deduped.map((source) => [sourceDisplayName(source) || source.id, source.id])
  );
  const nameById = new Map(
    (sources || []).map((source) => [source.id, sourceDisplayName(source) || source.id])
  );
  const seen = new Set();
  const mapped = [];
  for (const id of selectedIds || []) {
    const key = nameById.get(id) || id;
    const preferred = preferredByName.get(key) || id;
    if (seen.has(preferred)) continue;
    seen.add(preferred);
    mapped.push(preferred);
  }
  return mapped;
}
