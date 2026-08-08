export const EMBEDDING_PRESETS = {
  dashscope: { name: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", embeddingModel: "text-embedding-v3", rerankerModel: "qwen3-rerank" },
  siliconflow: { name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", embeddingModel: "BAAI/bge-m3", rerankerModel: "BAAI/bge-reranker-v2-m3" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", embeddingModel: "text-embedding-3-large", rerankerModel: "" },
  custom: { name: "自定义", baseUrl: "", embeddingModel: "", rerankerModel: "" }
};
