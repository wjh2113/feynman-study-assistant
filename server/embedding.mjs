import { createHash } from "node:crypto";
import { keywordTokens } from "./chunking.mjs";
import { resolveEmbeddingConfig, resolveRerankerConfig } from "./model-config.mjs";
import { buildRerankerRequest } from "./reranker-client.mjs";

export const embeddingDimensions = 1024;

export const relevanceThreshold = Math.max(0, Math.min(1, Number(process.env.RAG_RELEVANCE_THRESHOLD || 0.35)));

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
    const payload = await postJson(`${baseUrl}/embeddings`, { model, input: batch, dimensions: effectiveDimensions }, apiKey);
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
  if (process.env.RAG_TEST_MODE === "true") {
    const queryTokens = new Set(keywordTokens(query));
    return candidates
      .map((candidate) => {
        const tokens = keywordTokens(candidate.content);
        const overlap = tokens.filter((token) => queryTokens.has(token)).length;
        return { ...candidate, rerankScore: Math.min(0.99, 0.2 + overlap * 0.12) };
      })
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);
  }

  const { baseUrl, apiKey, model } = config || envRerankerConfig();
  const request = buildRerankerRequest(
    { baseUrl, model },
    query,
    candidates.map((item) => `${item.headingPath ? `章节：${item.headingPath}\n` : ""}${item.content}`),
    topK
  );
  const payload = await postJson(request.endpoint, request.body, apiKey);
  return request.parseResults(payload).slice(0, topK).map((result) => ({
    ...candidates[result.index],
    rerankScore: Number(result.relevance_score || 0)
  }));
}

export function fallbackRankCandidates(candidates, topK = 5) {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      rerankScore: Math.max(Number(candidate.vectorScore || 0), Math.min(0.99, Number(candidate.fusionScore || 0) * 20))
    }))
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
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
  const embedding = config?.embedding || envEmbeddingConfig();
  try {
    const response = await fetch(`${embedding.baseUrl.replace(/\/v1$/, "")}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return response.json();
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
