function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function buildRerankerRequest(config, query, documents, topN) {
  const baseUrl = trimUrl(config.baseUrl);
  const model = String(config.model || "").trim();
  const legacyProtocol = /(?:qwen3-vl-rerank|gte-rerank-v2)$/i.test(model)
    || baseUrl.includes("/services/rerank/text-rerank/text-rerank");

  if (legacyProtocol) {
    const endpoint = baseUrl.includes("/services/rerank/text-rerank/text-rerank")
      ? baseUrl
      : `${baseUrl}/services/rerank/text-rerank/text-rerank`;
    return {
      endpoint,
      body: {
        model,
        input: { query, documents },
        parameters: { top_n: topN, return_documents: false }
      },
      parseResults: (payload) => payload?.output?.results || []
    };
  }

  const endpoint = /\/reranks$/i.test(baseUrl) ? baseUrl : `${baseUrl}/reranks`;
  return {
    endpoint,
    body: { model, query, documents, top_n: topN },
    parseResults: (payload) => payload?.results || []
  };
}
