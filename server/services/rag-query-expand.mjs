import { normalizeRetrievalQuery } from "../chunking.mjs";
import { isLlmConfigured } from "../gateway-client.mjs";
import { fastJson } from "./llm.mjs";

const MAX_RETRIEVAL_QUERY_LEN = 480;

function uniqueTerms(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

export function composeRetrievalQuery(originalQuery, expansion = null) {
  const base = normalizeRetrievalQuery(originalQuery);
  if (!expansion) return base.slice(0, MAX_RETRIEVAL_QUERY_LEN);
  const extras = uniqueTerms([
    expansion.searchText,
    ...(expansion.keywords || []),
    ...(expansion.synonyms || [])
  ]);
  return [base, ...extras].join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_RETRIEVAL_QUERY_LEN);
}

export function parseQueryExpansionPayload(payload, originalQuery) {
  const base = normalizeRetrievalQuery(originalQuery);
  const keywords = uniqueTerms(Array.isArray(payload?.keywords) ? payload.keywords : [])
    .slice(0, 8);
  const synonyms = uniqueTerms(Array.isArray(payload?.synonyms) ? payload.synonyms : [])
    .slice(0, 6);
  const searchText = String(payload?.searchText || payload?.query || "").trim().slice(0, 120);
  const intent = String(payload?.intent || "").trim().slice(0, 160);
  const expansion = { intent, keywords, synonyms, searchText };
  return {
    intent,
    keywords,
    synonyms,
    searchText,
    retrievalQuery: composeRetrievalQuery(base, expansion),
    source: "llm"
  };
}

export async function expandRetrievalQuery(originalQuery, userId) {
  const query = String(originalQuery || "").trim();
  const fallback = {
    intent: "",
    keywords: [],
    synonyms: [],
    searchText: "",
    retrievalQuery: normalizeRetrievalQuery(query),
    source: "rules"
  };
  if (!query) return fallback;
  if (process.env.RAG_QUERY_EXPAND === "false") return fallback;
  if (!(await isLlmConfigured(userId))) return fallback;

  try {
    const payload = await fastJson(
      [
        {
          role: "system",
          content:
            "你是检索查询分析器。用户要在已上传的学习资料里检索，不要回答问题，不要补充资料外知识。请理解用户问题，给出用于混合检索（向量+关键词）的近似扩写。规则：1) keywords 输出 3-8 个可能在原资料中出现的词或短语，含同义说法、别称、常见缩写/数字写法（如 50音→五十音）；2) searchText 用 12-60 字浓缩检索意图，只含检索词；3) intent 用一句话说明用户在找什么；4) 可选 synonyms 输出 0-6 个近义检索词。只输出 JSON：{\"intent\":\"...\",\"keywords\":[\"...\"],\"synonyms\":[\"...\"],\"searchText\":\"...\"}"
        },
        {
          role: "user",
          content: `用户问题：${query}`
        }
      ],
      {
        temperature: 0.1,
        userId,
        timeoutMs: Number(process.env.RAG_QUERY_EXPAND_TIMEOUT_MS || 20_000),
        capability: "fast-chat"
      }
    );
    if (!payload || typeof payload !== "object") return fallback;
    return parseQueryExpansionPayload(payload, query);
  } catch {
    return fallback;
  }
}
