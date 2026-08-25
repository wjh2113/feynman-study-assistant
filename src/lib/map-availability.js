export function resolveMapAvailability(project) {
  const analysis = project?.analysis || {};
  const modules = Array.isArray(analysis.modules) ? analysis.modules : [];
  const sources = Array.isArray(analysis.sources) ? analysis.sources : [];
  const status = analysis.contentAnalysisStatus || (modules.length ? "ready" : null);
  const hasModules = modules.some((module) => (module.concepts || []).length > 0);
  const hasSources = sources.length > 0;
  const hasIndexedSources = sources.some(
    (source) => Number(source.chunks || 0) > 0 || String(source.status || "").toLowerCase() === "ready"
  );

  if (status === "pending" || status === "running") {
    return {
      kind: "generating",
      title: "知识地图正在生成",
      description: "资料已入库，AI 正在根据内容重建学科骨架。完成后会自动刷新，也可在「学习资料」查看进度。",
      actionLabel: "查看学习资料",
      actionView: "sources"
    };
  }

  if (status === "failed") {
    return {
      kind: "failed",
      title: "知识地图生成失败",
      description:
        analysis.contentAnalysisError
        || "可在「学习资料」中点击「重新总结知识地图」重试。",
      actionLabel: "去重新总结",
      actionView: "sources"
    };
  }

  if (hasModules) {
    return { kind: "ready" };
  }

  if (analysis.needsResummarize) {
    return {
      kind: "needs-resummarize",
      title: "知识地图已清空，待重新总结",
      description: "删除资料后，学科知识地图会一并清空。可在「学习资料」中点「重新总结」，或再上传资料后自动重建。",
      actionLabel: "去重新总结",
      actionView: "sources"
    };
  }

  if (hasSources && hasIndexedSources) {
    return {
      kind: "sources-without-map",
      title: "资料已入库，知识地图待生成",
      description: "你已有资料大纲和检索索引，但学科知识地图尚未就绪。请在「学习资料」点击「重新总结知识地图」。",
      actionLabel: "去生成知识地图",
      actionView: "sources"
    };
  }

  return {
    kind: "no-sources",
    title: "知识地图还没有生成",
    description: "先上传学习资料，AI 才能根据你的内容建立知识骨架。",
    actionLabel: "去上传资料",
    actionView: "sources"
  };
}
