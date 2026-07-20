export function scoreToMastery(score) {
  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score > 0) return 2;
  return 1;
}

export function recalculateMasteryAndProgress(project) {
  const sessions = project.sessions || [];
  const bestByConcept = new Map();
  for (const session of sessions) {
    if (!session.concept || !session.score) continue;
    const current = bestByConcept.get(session.concept) || 0;
    if (session.score > current) bestByConcept.set(session.concept, session.score);
  }

  const modules = (project.analysis?.modules || []).map((module) => ({
    ...module,
    concepts: (module.concepts || []).map((concept) => {
      const best = bestByConcept.get(concept.title) || 0;
      return { ...concept, mastery: best > 0 ? scoreToMastery(best) : concept.mastery || 1 };
    })
  }));

  const allConcepts = modules.flatMap((module) => module.concepts || []);
  const masteredCount = allConcepts.filter((concept) => concept.mastery >= 3).length;
  const totalConcepts = allConcepts.length || 1;

  const hasSources = (project.analysis?.sources || []).length > 0;
  const hasMap = modules.length > 0;
  const hasSessions = sessions.length > 0;
  const hasOpenBlindspots = (project.blindspots || []).some((item) => item.status !== "done");
  const hasOnePager = Boolean(project.onePager);

  let progress = 0;
  if (hasSources) progress += 12;
  if (hasMap) progress += 18;
  if (hasSessions) progress += 15;
  if (hasMap && !hasOpenBlindspots) progress += 15;
  progress += Math.round((masteredCount / totalConcepts) * 30);
  if (hasOnePager) progress += 20;
  progress = Math.min(100, progress);

  return {
    ...project,
    analysis: { ...(project.analysis || {}), modules },
    progress
  };
}
