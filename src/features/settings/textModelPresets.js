export const TEXT_MODEL_PRESETS = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "deepseek-v4-flash（更快）" },
      { id: "deepseek-v4-pro", label: "deepseek-v4-pro（更强）" }
    ]
  },
  kimi: {
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
      { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k" }
    ]
  },
  cherryin: {
    name: "CherryIN",
    baseUrl: "https://open.cherryin.net/v1",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "anthropic/claude-sonnet-4.5" },
      { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
      { id: "openai/gpt-5-chat", label: "openai/gpt-5-chat" },
      { id: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat" }
    ]
  },
  custom: {
    name: "自定义 OpenAI 兼容",
    baseUrl: "",
    models: []
  }
};

export function pickTextPreset(baseUrl) {
  const host = String(baseUrl || "").toLowerCase();
  if (host.includes("cherryin")) return "cherryin";
  if (host.includes("moonshot") || host.includes("kimi")) return "kimi";
  if (host.includes("deepseek")) return "deepseek";
  return "custom";
}
