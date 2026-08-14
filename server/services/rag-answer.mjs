import { embedTexts, embeddingStatus, fallbackRankCandidates, relevanceThreshold, rerankCandidates } from "../embedding.mjs";
import { getEmbeddingConfig, getModelConfig } from "../model-config.mjs";
import { hybridSearch, recordEvent } from "../storage.mjs";
import { deepseek } from "./llm.mjs";

const NO_EVIDENCE = "资料中没有找到相关内容。";

function toCitation(source, index) {
  const content = String(source.content || source.quote || "").trim();
  return {
    id: source.id,
    index: index + 1,
    documentId: source.documentId || null,
    filename: source.filename || "未命名资料",
    page: source.page,
    pageEnd: source.pageEnd,
    headingPath: source.headingPath || "",
    quote: content,
    content,
    parentContent: source.parentContent && source.parentContent !== content ? source.parentContent : null,
    score: source.rerankScore,
    matchedKeywords: source.matchedKeywords || []
  };
}

function citedIndexes(answer, max) {
  const found = new Set();
  const text = String(answer || "");
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= max) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

function isRefusal(answer) {
  const text = String(answer || "").trim();
  return !text || /资料中没有找到/.test(text);
}

/**
 * Answer a RAG query. Returns either `{ status, body }` for HTTP response
 * or throws. status defaults to 200 when omitted by caller convention —
 * callers should use status ?? 200.
 */
export async function answerRagQuery({ userId, projectId, query }) {
  let stage = "校验输入";
  try {
    if (!projectId) return { status: 400, body: { error: "缺少学习项目" } };
    if (!query?.trim()) return { status: 400, body: { error: "请输入问题" } };
    stage = "生成问题向量";
    const retrievalConfig = await getEmbeddingConfig(userId);
    const [queryEmbedding] = await embedTexts([query], retrievalConfig.embedding);
    stage = "召回资料片段";
    const candidates = await hybridSearch(projectId, userId, query, queryEmbedding, 20);
    if (!candidates.length) {
      return {
        body: {
          answer: NO_EVIDENCE,
          sources: [],
          citations: [],
          debug: { candidateCount: 0, threshold: relevanceThreshold, candidates: [] },
          demo: !(await getModelConfig(userId)).apiKey
        }
      };
    }
    stage = "精排候选片段";
    let degraded = null;
    let sources;
    try {
      sources = await rerankCandidates(query, candidates, 5, retrievalConfig.reranker);
    } catch (error) {
      degraded = `Reranker 不可用，已降级为向量与关键词融合排序：${error.message}`;
      sources = fallbackRankCandidates(candidates, 5);
    }
    const rerankById = new Map(sources.map((item) => [item.id, item.rerankScore]));
    const debug = {
      candidateCount: candidates.length,
      threshold: relevanceThreshold,
      embedding: embeddingStatus(retrievalConfig.embedding),
      degraded,
      candidates: candidates.map((item, index) => ({
        rank: index + 1,
        id: item.id,
        documentId: item.documentId,
        filename: item.filename,
        page: item.page,
        pageEnd: item.pageEnd,
        headingPath: item.headingPath,
        vectorScore: Number(item.vectorScore.toFixed(4)),
        keywordScore: Number(item.keywordScore.toFixed(4)),
        fusionScore: item.fusionScore,
        rerankScore: rerankById.has(item.id) ? Number(rerankById.get(item.id).toFixed(4)) : null,
        matchedKeywords: item.matchedKeywords,
        content: item.content,
        parentContent: item.parentContent
      }))
    };
    if (!sources.length || sources[0].rerankScore < relevanceThreshold) {
      await recordEvent(userId, projectId, "rag_query_insufficient", { query, topScore: sources[0]?.rerankScore || 0 });
      return {
        body: {
          answer: "资料中没有找到足够相关的内容。你可以换一种问法，或检查资料是否已经重新建立索引。",
          sources: [],
          citations: [],
          debug,
          retrieval: "bge-m3-hybrid-rerank",
          insufficient: true,
          demo: !(await getModelConfig(userId)).apiKey
        }
      };
    }

    const evidenceBlock = sources.map((source, index) => `[${index + 1}] 资料文件名：${source.filename}
页码：第${source.page}${source.pageEnd > source.page ? `-${source.pageEnd}` : ""}页
位置：${source.headingPath || "未识别小节"}
引用原文：${source.content}${source.parentContent && source.parentContent !== source.content ? `\n上下文：${source.parentContent}` : ""}`).join("\n\n");

    let answer;
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
    if (modelConfigured) {
      stage = "生成资料回答";
      const result = await deepseek([
        {
          role: "system",
          content:
            "你是严格的资料问答助手。规则：1) 只能依据用户消息中的「引用原文」作答；2) 禁止使用资料外知识、禁止补充、禁止举例发挥、禁止答非所问；3) 问题与原文无关或证据不足时，answer 必须恰好为「资料中没有找到相关内容。」；4) 有依据时，每个关键句末标注 [编号]，编号必须对应证据列表；5) 不要复述与问题无关的原文。只输出合法 JSON：{\"answer\":\"...\"}"
        },
        {
          role: "user",
          content: `用户问题：${query}

===== 唯一允许使用的证据（共 ${sources.length} 条）=====
${evidenceBlock}
===== 证据结束 =====

请只根据上述证据回答用户问题。`
        }
      ], 0.05, userId);
      if (!result?.answer) throw new Error("文本模型没有返回有效的资料回答");
      answer = String(result.answer).trim();

      // 模型若给出回答却未标注引用，且不是拒答，则强制改为拒答，避免无依据扩展
      if (!isRefusal(answer) && citedIndexes(answer, sources.length).length === 0) {
        answer = NO_EVIDENCE;
      }
    } else {
      answer = `（演示模式）以下为检索到的原文，未调用模型扩展：\n\n来自《${sources[0].filename}》第 ${sources[0].page} 页：\n“${sources[0].content.slice(0, 500)}${sources[0].content.length > 500 ? "……" : ""}”`;
    }

    const citations = sources.map((source, index) => toCitation(source, index));
    const used = citedIndexes(answer, sources.length);
    let visible;
    if (used.length) {
      visible = used.map((n) => citations[n - 1]).filter(Boolean);
    } else if (!isRefusal(answer)) {
      // 演示模式或未标号但未拒答：展示全部用于生成的证据
      visible = citations;
    } else {
      visible = [];
    }

    await recordEvent(userId, projectId, "rag_query", { query, sourceIds: sources.map((source) => source.id) });
    return {
      body: {
        answer,
        sources: visible,
        citations: visible,
        debug,
        retrieval: "bge-m3-hybrid-rerank",
        insufficient: false,
        grounded: !isRefusal(answer),
        warning: degraded,
        demo: !modelConfigured
      }
    };
  } catch (error) {
    return { status: 500, body: { error: `${stage}失败：${error.message || "资料检索失败"}`, stage } };
  }
}
