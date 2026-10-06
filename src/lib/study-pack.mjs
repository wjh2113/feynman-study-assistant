export const STUDY_PACK_SCHEMA = "zhifan-study-pack/v1";
export const MAX_PACK_FILES = 12;
export const MAX_INNER_FILE_BYTES = 100 * 1024 * 1024;

export function basenamePath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop() || "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeManifest(raw = {}) {
  const files = asArray(raw.files).map((item) => {
    const name = String(item?.name || basenamePath(item?.path) || "").trim();
    const path = String(item?.path || (name ? `files/${name}` : "")).replace(/\\/g, "/").replace(/^\/+/, "");
    return { name, path };
  }).filter((item) => item.name && item.path);
  return {
    schema: String(raw.schema || "").trim(),
    title: String(raw.title || "").trim(),
    files
  };
}

export function normalizePackSource(source = {}) {
  const name = String(source.name || source.filename || "").trim();
  const summary = source.summary && typeof source.summary === "object"
    ? {
      summary: String(source.summary.summary || "").trim(),
      keyPoints: asArray(source.summary.keyPoints).map((item) => String(item || "").trim()).filter(Boolean)
    }
    : { summary: String(source.summary || "").trim(), keyPoints: [] };
  const questionBank = asArray(source.questionBank)
    .map((question, index) => ({
      id: String(question?.id || `qb-import-${index + 1}`),
      question: String(question?.question || "").trim(),
      conceptId: question?.conceptId || "",
      concept: String(question?.concept || name || "资料理解").trim(),
      why: String(question?.why || "检验是否真正理解本资料中的核心逻辑").trim(),
      sourceRefs: asArray(question?.sourceRefs).length
        ? question.sourceRefs
        : (name ? [{ file: name, page: 1, quote: "" }] : [])
    }))
    .filter((question) => question.question);
  return { name, summary, questionBank };
}

export function normalizePackAnalysis(raw = {}) {
  return {
    summary: String(raw.summary || "").trim(),
    highValue: asArray(raw.highValue).map((item) => String(item || "").trim()).filter(Boolean),
    modules: asArray(raw.modules),
    questions: asArray(raw.questions),
    tacitKnowledge: asArray(raw.tacitKnowledge),
    scenarios: asArray(raw.scenarios),
    sources: asArray(raw.sources).map(normalizePackSource).filter((source) => source.name)
  };
}

export function importedQuestionBankMeta(targetCount = 0) {
  return {
    generated: true,
    pendingLlm: false,
    capability: "external-import",
    targetCount: Number(targetCount) || 0,
    generatedAt: Date.now()
  };
}

export function validateStudyPack({ manifest, pack, fileNames = [] } = {}) {
  const errors = [];
  if (manifest.schema !== STUDY_PACK_SCHEMA) {
    errors.push(`学科包版本须为 ${STUDY_PACK_SCHEMA}`);
  }
  if (!manifest.files.length) {
    errors.push("完整包必须包含原文");
  }
  if (manifest.files.length > MAX_PACK_FILES) {
    errors.push(`一次最多导入 ${MAX_PACK_FILES} 份原文`);
  }
  const listed = new Set(fileNames.map((name) => basenamePath(name)));
  for (const entry of manifest.files) {
    if (!listed.has(basenamePath(entry.path)) && !listed.has(entry.name)) {
      errors.push(`缺少原文文件：${entry.name}`);
    }
  }
  const packNames = new Set(pack.sources.map((source) => source.name));
  for (const entry of manifest.files) {
    if (!packNames.has(entry.name)) {
      errors.push(`pack.json 中缺少与「${entry.name}」对应的资料条目`);
    }
  }
  if (!pack.modules.length) {
    errors.push("pack.json 缺少知识地图 modules");
  }
  const banks = pack.sources.reduce((sum, source) => sum + source.questionBank.length, 0);
  if (!banks && !pack.questions.length) {
    errors.push("学科包需要至少一份题库或项目级费曼题");
  }
  return errors;
}

export function buildManifestFromProject(project, fileEntries = []) {
  return {
    schema: STUDY_PACK_SCHEMA,
    title: String(project?.title || "").trim(),
    files: fileEntries.map((item) => ({
      name: item.name,
      path: item.path || `files/${item.name}`
    }))
  };
}

export function buildPackFromProject(project = {}) {
  const analysis = project.analysis || {};
  return {
    summary: analysis.summary || project.description || "",
    highValue: asArray(analysis.highValue),
    modules: asArray(analysis.modules),
    questions: asArray(analysis.questions),
    tacitKnowledge: asArray(analysis.tacitKnowledge),
    scenarios: asArray(analysis.scenarios),
    sources: asArray(analysis.sources).map((source) => ({
      name: source.name,
      summary: source.summary || {},
      questionBank: asArray(source.questionBank)
    }))
  };
}

export function shouldApplyImportedTitle(currentTitle = "") {
  const title = String(currentTitle || "").trim();
  return !title || title === "新的学习项目";
}
