import { demoProject } from "./demoProject.js";

export function withCurrentDemoContent(project) {
  if (project?.id !== demoProject.id) return project;
  const demoSources = new Map(demoProject.analysis.sources.map((source) => [source.name, source]));
  return {
    ...project,
    analysis: {
      ...project.analysis,
      sources: (project.analysis?.sources || []).map((source) =>
        source.summary ? source : { ...source, ...demoSources.get(source.name) }
      )
    }
  };
}
