import { createHash } from "node:crypto";
import { keywordTokens } from "./chunking.mjs";

export const embeddingDimensions = 1024;
const baseUrl = (process.env.EMBEDDING_BASE_URL || "http://127.0.0.1:8001/v1").replace(/\/$/, "");
const apiKey = process.env.EMBEDDING_API_KEY || "";
const model = process.env.EMBEDDING_MODEL || "BAAI/bge-m3";
const rerankerUrl = (process.env.RERANKER_BASE_URL || baseUrl).replace(/\/$/, "");
const rerankerModel = process.env.RERANKER_MODEL || "BAAI/bge-reranker-v2-m3";
export const relevanceThreshold = Math.max(0, Math.min(1, Number(process.env.RAG_RELEVANCE_THRESHOLD || 0.35)));

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

function authHeaders() {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function postJson(url, payload, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`BGE 服务 ${response.status}：${detail.slice(0, 240)}`);
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("BGE 模型处理超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedTexts(texts) {
  const values = texts.map((item) => String(item || ""));
  if (!values.length) return [];
  if (process.env.RAG_TEST_MODE === "true") return values.map(testEmbedding);

  const output = [];
  for (let index = 0; index < values.length; index += 8) {
    const batch = values.slice(index, index + 8);
    const payload = await postJson(`${baseUrl}/embeddings`, { model, input: batch });
    const rows = [...(payload.data || [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new Error("BGE-M3 返回的向量数量不正确");
    output.push(...rows.map((row) => {
      if (!Array.isArray(row.embedding) || row.embedding.length !== embeddingDimensions) {
        throw new Error(`BGE-M3 向量维度必须为 ${embeddingDimensions}`);
      }
      return normalize(row.embedding.map(Number));
    }));
  }
  return output;
}

export async function rerankCandidates(query, candidates, topK = 5) {
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

  const payload = await postJson(`${rerankerUrl}/rerank`, {
    model: rerankerModel,
    query,
    documents: candidates.map((item) => `${item.headingPath ? `章节：${item.headingPath}\n` : ""}${item.content}`)
  });
  return (payload.results || []).slice(0, topK).map((result) => ({
    ...candidates[result.index],
    rerankScore: Number(result.relevance_score || 0)
  }));
}

export function embeddingStatus() {
  return {
    provider: process.env.RAG_TEST_MODE === "true" ? "test" : "local-bge",
    model,
    dimensions: embeddingDimensions,
    baseUrl,
    rerankerModel,
    threshold: relevanceThreshold
  };
}

export async function retrievalServiceHealth() {
  if (process.env.RAG_TEST_MODE === "true") return { ok: true, test: true };
  try {
    const response = await fetch(`${baseUrl.replace(/\/v1$/, "")}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return response.json();
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
