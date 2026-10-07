import { embedTexts, embeddingStatus, pickAnswerSources, relevanceThreshold, rerankCandidates } from "../embedding.mjs";
import { getEmbeddingConfig } from "../model-config.mjs";
import { isLlmConfigured } from "../gateway-client.mjs";
import { hybridSearch, recordEvent } from "../storage.mjs";
import { deepseek, fastJson } from "./llm.mjs";
import { expandRetrievalQuery } from "./rag-query-expand.mjs";

const NO_EVIDENCE = "资料中没有找到相关内容。";
const RAG_EVIDENCE_LIMIT = 3;
const RAG_QUOTE_CHARS = 280;
const RAG_PARENT_CHARS = 160;
const RAG_FAST_MAX_TOKENS = 700;
const RAG_QUALITY_MAX_TOKENS = 1100;

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

function clipText(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Hard questions keep quality-chat; most Q&A stays on fast-chat. */
export function isHardRagQuery(query = "", sources = []) {
  const q = String(query || "").trim();
  if (q.length >= 80) return true;
  if (/[?？].*[?？]/.test(q)) return true;
  if (/比较|对比|区别|差异|优缺点|为什么|如何证明|请详细|系统地|分别说明|综合分析|推理/.test(q)) return true;
  const top = Number(sources[0]?.rerankScore);
  if (Number.isFinite(top) && top > 0 && top < 0.35) return true;
  return false;
}

function buildEvidenceBlock(sources = []) {
  return sources.map((source, index) => {
    const quote = clipText(source.content, RAG_QUOTE_CHARS);
    const parent = source.parentContent && source.parentContent !== source.content
      ? clipText(source.parentContent, RAG_PARENT_CHARS)
      : "";
    return `[${index + 1}] 资料：${source.filename}
页码：第${source.page}${source.pageEnd > source.page ? `-${source.pageEnd}` : ""}页
位置：${clipText(source.headingPath || "未识别小节", 80)}
引用原文：${quote}${parent ? `\n上下文：${parent}` : ""}`;
  }).join("\n\n");
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
    stage = "理解检索意图";
    const queryExpansion = await expandRetrievalQuery(query, userId);
    stage = "生成问题向量";
    const retrievalConfig = await getEmbeddingConfig(userId);
    const retrievalQuery = queryExpansion.retrievalQuery;
    const [queryEmbedding] = await embedTexts([retrievalQuery], retrievalConfig.embedding);
    stage = "召回资料片段";
    const candidates = await hybridSearch(projectId, userId, retrievalQuery, queryEmbedding, 20);
    if (!candidates.length) {
      return {
        body: {
          answer: NO_EVIDENCE,
          sources: [],
          citations: [],
          debug: { candidateCount: 0, threshold: relevanceThreshold, queryExpansion, candidates: [] },
          demo: !(await isLlmConfigured(userId))
        }
      };
    }
    stage = "精排候选片段";
    let degraded = null;
    let reranked = [];
    try {
      reranked = await rerankCandidates(query, candidates, 5, retrievalConfig.reranker);
    } catch (error) {
      degraded = `Reranker 不可用，已降级为向量与关键词融合排序：${error.message}`;
    }
    const picked = pickAnswerSources(candidates, reranked, relevanceThreshold);
    if (picked.warning && !degraded) degraded = picked.warning;
    const sources = (picked.sources || []).slice(0, RAG_EVIDENCE_LIMIT);
    const rerankById = new Map(reranked.map((item) => [item.id, item.rerankScore]));
    for (const item of sources) {
      if (!rerankById.has(item.id)) rerankById.set(item.id, item.rerankScore);
    }
    const debug = {
      candidateCount: candidates.length,
      threshold: relevanceThreshold,
      queryExpansion,
      embedding: embeddingStatus(retrievalConfig.embedding),
      degraded,
      evidenceLimit: RAG_EVIDENCE_LIMIT,
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
    if (picked.insufficient || !sources.length) {
      await recordEvent(userId, projectId, "rag_query_insufficient", { query, topScore: sources[0]?.rerankScore || 0 });
      return {
        body: {
          answer: "资料中没有找到足够相关的内容。你可以换一种问法，或检查资料是否已经重新建立索引。",
          sources: [],
          citations: [],
          debug,
          retrieval: "bge-m3-hybrid-rerank",
          insufficient: true,
          demo: !(await isLlmConfigured(userId))
        }
      };
    }

    const evidenceBlock = buildEvidenceBlock(sources);
    const hard = isHardRagQuery(query, sources);

    let answer;
    const modelConfigured = await isLlmConfigured(userId);
    if (modelConfigured) {
      stage = "生成资料回答";
      const messages = [
        {
          role: "system",
          content:
            "你是严格的资料问答助手。规则：1) 只能依据用户消息中的「引用原文」作答；2) 禁止使用资料外知识、禁止补充、禁止举例发挥、禁止答非所问；3) 问题与原文无关或证据不足时，answer 必须恰好为「资料中没有找到相关内容。」；4) 有依据时，每个关键句末标注 [编号]，编号必须对应证据列表；5) 回答尽量短，通常不超过 120 字。只输出合法 JSON：{\"answer\":\"...\"}"
        },
        {
          role: "user",
          content: `用户问题：${String(query).slice(0, 400)}

===== 唯一允许使用的证据（共 ${sources.length} 条）=====
${evidenceBlock}
===== 证据结束 =====

请只根据上述证据回答用户问题。`
        }
      ];
      const result = hard
        ? await deepseek(messages, 0.05, userId, Number(process.env.GENERATION_TIMEOUT_MS || 90_000), RAG_QUALITY_MAX_TOKENS)
        : await fastJson(messages, 0.05, userId, Number(process.env.GENERATION_TIMEOUT_MS || 90_000), RAG_FAST_MAX_TOKENS);
      if (!result?.answer) throw new Error("文本模型没有返回有效的资料回答");
      answer = String(result.answer).trim();
      debug.answerCapability = hard ? "quality-chat" : "fast-chat";

      // 模型若给出回答却未标注引用，且不是拒答，则强制改为拒答，避免无依据扩展
      if (!isRefusal(answer) && citedIndexes(answer, sources.length).length === 0) {
        answer = NO_EVIDENCE;
      }
    } else {
      answer = `（演示模式）以下为检索到的原文，未调用模型扩展：\n\n来自《${sources[0].filename}》第 ${sources[0].page} 页：\n“${sources[0].content.slice(0, 500)}${sources[0].content.length > 500 ? "……" : ""}”`;
      debug.answerCapability = "demo";
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

    await recordEvent(userId, projectId, "rag_query", {
      query,
      sourceIds: sources.map((source) => source.id),
      answerCapability: debug.answerCapability
    });
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
