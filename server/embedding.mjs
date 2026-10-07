import { createHash } from "node:crypto";
import { keywordTokens } from "./chunking.mjs";
import { embeddingDimensions } from "./constants.mjs";
import { gatewayConfig, gatewayEmbeddings, gatewayRerank, isGatewayEnabled } from "./gateway-client.mjs";
import { resolveEmbeddingConfig, resolveRerankerConfig } from "./model-config.mjs";
import { buildRerankerRequest } from "./reranker-client.mjs";

export { embeddingDimensions };

export const relevanceThreshold = Math.max(0, Math.min(1, Number(process.env.RAG_RELEVANCE_THRESHOLD || 0.28)));
/** Hybrid may recall 20; only send the best N to paid gateway rerank. */
export const RERANK_CANDIDATE_LIMIT = Math.max(3, Math.min(20, Number(process.env.RERANK_CANDIDATE_LIMIT || 8)));
/** Cross-encoders rarely need full chunk text; clipping cuts token bill. */
export const RERANK_DOC_CHARS = Math.max(160, Math.min(2_000, Number(process.env.RERANK_DOC_CHARS || 480)));
/** Skip gateway rerank when fusion already has a clear winner (0–1 fusionRerankScore scale). */
export const RERANK_SKIP_MIN_SCORE = Math.max(0.3, Math.min(0.95, Number(process.env.RERANK_SKIP_MIN_SCORE || 0.55)));
export const RERANK_SKIP_MARGIN = Math.max(0.05, Math.min(0.5, Number(process.env.RERANK_SKIP_MARGIN || 0.18)));

function fusionRerankScore(candidate) {
  const vector = Number(candidate.vectorScore || 0);
  const keyword = Number(candidate.keywordScore || 0);
  const fusion = Number(candidate.fusionScore || 0);
  return Math.max(vector, keyword * 1.5, Math.min(0.99, fusion * 30));
}

/** Best-first pool for gateway rerank (by hybrid fusion signal). */
export function selectRerankPool(candidates = [], limit = RERANK_CANDIDATE_LIMIT) {
  if (!candidates.length) return [];
  const capped = Math.max(1, Math.min(candidates.length, Number(limit) || RERANK_CANDIDATE_LIMIT));
  return [...candidates]
    .sort((a, b) => fusionRerankScore(b) - fusionRerankScore(a)
      || Number(b.fusionScore || 0) - Number(a.fusionScore || 0))
    .slice(0, capped);
}

/**
 * When #1 is strong and clearly ahead of #2, fusion ranking is enough — skip paid rerank.
 */
export function shouldSkipGatewayRerank(candidates = []) {
  if (!candidates.length) return true;
  if (candidates.length === 1) return hasStrongRetrievalSignal(candidates[0]);
  const ranked = selectRerankPool(candidates, 2);
  const top = ranked[0];
  const second = ranked[1];
  if (!hasStrongRetrievalSignal(top)) return false;
  const topScore = fusionRerankScore(top);
  const secondScore = fusionRerankScore(second);
  if (topScore < RERANK_SKIP_MIN_SCORE) return false;
  return (topScore - secondScore) >= RERANK_SKIP_MARGIN;
}

export function formatRerankDocument(item, maxChars = RERANK_DOC_CHARS) {
  const heading = item?.headingPath ? `章节：${item.headingPath}\n` : "";
  const body = String(item?.content || "").trim();
  const budget = Math.max(80, Number(maxChars) || RERANK_DOC_CHARS);
  const clipped = body.length <= budget ? body : `${body.slice(0, budget)}…`;
  return `${heading}${clipped}`;
}

function hasStrongRetrievalSignal(candidate) {
  if (!candidate) return false;
  const vector = Number(candidate.vectorScore || 0);
  const keyword = Number(candidate.keywordScore || 0);
  const fusion = Number(candidate.fusionScore || 0);
  const matched = Array.isArray(candidate.matchedKeywords) ? candidate.matchedKeywords.length : 0;
  // fusionScore is RRF (typically ~0.01–0.03), not a 0–1 relevance score.
  return vector >= 0.24
    || keyword >= 0.03
    || fusion >= 0.011
    || matched >= 1;
}

function isClearlyIrrelevant(candidates, reranked) {
  const top = candidates[0];
  if (!top || !reranked.length) return false;
  const rerankTop = Number(reranked[0]?.rerankScore || 0);
  const matched = Array.isArray(top.matchedKeywords) ? top.matchedKeywords.length : 0;
  const keyword = Number(top.keywordScore || 0);
  const vector = Number(top.vectorScore || 0);
  if (matched >= 1 || keyword >= 0.03) return false;
  if (vector >= 0.38 && rerankTop >= 0.06) return false;
  if (process.env.RAG_TEST_MODE === "true") return rerankTop < 0.22;
  return rerankTop < 0.18;
}

function envEmbeddingConfig() {
  return resolveEmbeddingConfig({});
}

function envRerankerConfig(embeddingConfig) {
  return resolveRerankerConfig({}, embeddingConfig);
}

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function testEmbedding(text) {
  const vector = new Array(embeddingDimensions).fill(0);
  for (const feature of keywordTokens(text)) {
    const digest = createHash("sha256").update(feature).digest();
    vector[digest.readUInt32BE(0) % embeddingDimensions] += 1;
  }
  return normalize(vector);
}

function authHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function postJson(url, payload, apiKey, timeoutMs = Number(process.env.RETRIEVAL_TIMEOUT_MS || 30_000)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`模型服务 ${response.status}：${detail.slice(0, 240)}`);
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`模型服务处理超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedTexts(texts, config) {
  const values = texts.map((item) => String(item || ""));
  if (!values.length) return [];
  if (process.env.RAG_TEST_MODE === "true") return values.map(testEmbedding);

  const { baseUrl, apiKey, model, dimensions } = config || envEmbeddingConfig();
  const effectiveDimensions = dimensions || embeddingDimensions;
  const output = [];
  for (let index = 0; index < values.length; index += 8) {
    const batch = values.slice(index, index + 8);
    const payload = isGatewayEnabled()
      ? await gatewayEmbeddings({ input: batch, dimensions: effectiveDimensions })
      : await postJson(`${baseUrl}/embeddings`, { model, input: batch, dimensions: effectiveDimensions }, apiKey);
    const rows = [...(payload.data || [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new Error("Embedding 服务返回的向量数量不正确");
    output.push(...rows.map((row) => {
      if (!Array.isArray(row.embedding) || row.embedding.length !== effectiveDimensions) {
        throw new Error(`Embedding 向量维度必须为 ${effectiveDimensions}`);
      }
      return normalize(row.embedding.map(Number));
    }));
  }
  return output;
}

export async function rerankCandidates(query, candidates, topK = 5, config) {
  if (!candidates.length) return [];
  const pool = selectRerankPool(candidates, Math.max(topK, RERANK_CANDIDATE_LIMIT));
  if (process.env.RAG_TEST_MODE === "true") {
    const queryTokens = new Set(keywordTokens(query));
    return pool
      .map((candidate) => {
        const tokens = keywordTokens(candidate.content);
        const overlap = tokens.filter((token) => queryTokens.has(token)).length;
        return { ...candidate, rerankScore: Math.min(0.99, 0.2 + overlap * 0.12) };
      })
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);
  }

  const documents = pool.map((item) => formatRerankDocument(item));
  if (isGatewayEnabled()) {
    const payload = await gatewayRerank({ query, documents, topN: topK });
    if (payload?.results?.length) {
      return payload.results.slice(0, topK).map((result) => ({
        ...pool[result.index],
        rerankScore: Number(result.relevance_score ?? result.score ?? 0)
      }));
    }
  }

  const { baseUrl, apiKey, model } = config || envRerankerConfig();
  const request = buildRerankerRequest(
    { baseUrl, model },
    query,
    documents,
    topK
  );
  const payload = await postJson(request.endpoint, request.body, apiKey);
  return request.parseResults(payload).slice(0, topK).map((result) => ({
    ...pool[result.index],
    rerankScore: Number(result.relevance_score || 0)
  }));
}

export function fallbackRankCandidates(candidates, topK = 5) {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      rerankScore: fusionRerankScore(candidate)
    }))
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

export function pickAnswerSources(candidates, reranked, threshold = relevanceThreshold) {
  if (isClearlyIrrelevant(candidates, reranked)) {
    return { sources: [], insufficient: true, warning: null };
  }

  const top = reranked[0];
  if (top && top.rerankScore >= threshold) {
    return { sources: reranked, insufficient: false, warning: null };
  }

  const fusionRanked = fallbackRankCandidates(candidates, 5);
  const fusionTop = fusionRanked[0];
  if (fusionTop && fusionTop.rerankScore >= threshold) {
    return {
      sources: fusionRanked,
      insufficient: false,
      warning: top ? "精排分数偏低，已改用混合检索排序" : null
    };
  }

  if (top && top.rerankScore >= 0.08 && hasStrongRetrievalSignal(candidates[0])) {
    return {
      sources: reranked.slice(0, 5),
      insufficient: false,
      warning: "检索相关度偏低，以下回答可能不完整"
    };
  }

  if (hasStrongRetrievalSignal(candidates[0])) {
    return {
      sources: fusionRanked.length ? fusionRanked : reranked,
      insufficient: false,
      warning: "检索相关度偏低，以下回答可能不完整"
    };
  }

  return { sources: [], insufficient: true, warning: null };
}

export function embeddingStatus(config) {
  if (process.env.RAG_TEST_MODE === "true") {
    return {
      provider: "test",
      model: "BAAI/bge-m3",
      dimensions: embeddingDimensions,
      baseUrl: "",
      rerankerModel: "BAAI/bge-reranker-v2-m3",
      rerankerBaseUrl: "",
      threshold: relevanceThreshold
    };
  }
  if (isGatewayEnabled()) {
    const { baseUrl } = gatewayConfig();
    return {
      provider: "gateway",
      model: "embedding",
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS || embeddingDimensions),
      baseUrl,
      rerankerModel: "rerank",
      rerankerBaseUrl: baseUrl,
      threshold: relevanceThreshold
    };
  }
  const embedding = config?.embedding || envEmbeddingConfig();
  const reranker = config?.reranker || envRerankerConfig(embedding);
  return {
    provider: embedding.provider,
    model: embedding.model,
    dimensions: embedding.dimensions || embeddingDimensions,
    baseUrl: embedding.baseUrl,
    rerankerModel: reranker.model,
    rerankerBaseUrl: reranker.baseUrl,
    threshold: relevanceThreshold
  };
}

export async function retrievalServiceHealth(config) {
  if (process.env.RAG_TEST_MODE === "true") return { ok: true, test: true };
  if (isGatewayEnabled()) {
    const { gatewayHealth } = await import("./gateway-client.mjs");
    return gatewayHealth();
  }
  const embedding = config?.embedding || envEmbeddingConfig();
  try {
    const response = await fetch(`${embedding.baseUrl.replace(/\/v1$/, "")}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return response.json();
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
