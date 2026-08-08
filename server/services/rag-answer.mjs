import { embedTexts, embeddingStatus, fallbackRankCandidates, relevanceThreshold, rerankCandidates } from "../embedding.mjs";
import { getEmbeddingConfig, getModelConfig } from "../model-config.mjs";
import { hybridSearch, recordEvent } from "../storage.mjs";
import { deepseek } from "./llm.mjs";

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
          answer: "资料中没有找到相关内容。",
          sources: [],
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
          debug,
          retrieval: "bge-m3-hybrid-rerank",
          insufficient: true,
          demo: !(await getModelConfig(userId)).apiKey
        }
      };
    }

    let answer;
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
    if (modelConfigured) {
      stage = "生成资料回答";
      const result = await deepseek([
        {
          role: "system",
          content:
            "你是基于个人资料库回答问题的学习助手。只能依据通过BGE精排的证据回答，禁止使用资料外知识补全。引用结论时标注[1][2]序号；证据不能支持问题时回答资料中没有找到。只输出合法JSON。"
        },
        {
          role: "user",
          content: `问题：${query}
检索片段：
${sources.map((source, index) => `[${index + 1}] ${source.filename} 第${source.page}${source.pageEnd > source.page ? `-${source.pageEnd}` : ""}页 · ${source.headingPath || "未识别章节"}\n命中子块：${source.content}\n章节父块：${source.parentContent || source.content}`).join("\n\n")}
返回 {"answer":"基于资料的回答，包含[1]式引用"}`
        }
      ], 0.25, userId);
      if (!result?.answer) throw new Error("文本模型没有返回有效的资料回答");
      answer = result.answer;
    } else {
      answer = `（演示模式）这是资料中最相关的片段，来自《${sources[0].filename}》第 ${sources[0].page} 页：\n\n“${sources[0].content.slice(0, 240)}${sources[0].content.length > 240 ? "……" : ""}”\n\n配置 DeepSeek API Key 后，我会基于这些证据给出完整回答。`;
    }
    await recordEvent(userId, projectId, "rag_query", { query, sourceIds: sources.map((source) => source.id) });
    return {
      body: {
        answer,
        sources: sources.map(({ id, documentId, filename, page, pageEnd, headingPath, content, rerankScore, matchedKeywords }) => ({
          id,
          documentId,
          filename,
          page,
          pageEnd,
          headingPath,
          quote: content.slice(0, 360),
          score: rerankScore,
          matchedKeywords
        })),
        debug,
        retrieval: "bge-m3-hybrid-rerank",
        insufficient: false,
        warning: degraded,
        demo: !modelConfigured
      }
    };
  } catch (error) {
    return { status: 500, body: { error: `${stage}失败：${error.message || "资料检索失败"}`, stage } };
  }
}
