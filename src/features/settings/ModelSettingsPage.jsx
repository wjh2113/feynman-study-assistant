import React, { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog.jsx";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import {
  BrainCircuit,
  Check,
  CircleAlert,
  Download,
  FileText,
  Sparkles,
  UploadCloud,
  Zap
} from "../../components/icons.jsx";
import {
  exportModelConfig,
  getEmbeddingSettings,
  getHealth,
  getModelSettings,
  getVisionSettings,
  importModelConfig,
  putEmbeddingSettings,
  putModelSettings,
  putVisionSettings,
  testEmbeddingSettings,
  testModelSettings,
  testRerankerSettings,
  testVisionSettings
} from "../../api/settings.js";
import { EMBEDDING_PRESETS } from "./embeddingPresets.js";

export function ModelSettingsPage({ showToast, embedded = false }) {
  const [form, setForm] = useState({
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    apiKey: ""
  });
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [visionForm, setVisionForm] = useState({
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.5-ocr",
    apiKey: ""
  });
  const [visionSaved, setVisionSaved] = useState(null);
  const [visionLoading, setVisionLoading] = useState(true);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionTest, setVisionTest] = useState(null);

  const [retrievalSaved, setRetrievalSaved] = useState(null);
  const [retrievalLoading, setRetrievalLoading] = useState(true);
  const [retrievalSaving, setRetrievalSaving] = useState(false);
  const [embeddingTest, setEmbeddingTest] = useState(null);
  const [rerankerTest, setRerankerTest] = useState(null);
  const [embeddingTesting, setEmbeddingTesting] = useState(false);
  const [rerankerTesting, setRerankerTesting] = useState(false);
  const [retrievalForm, setRetrievalForm] = useState({
    provider: "remote",
    embeddingPreset: "dashscope",
    embeddingBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    embeddingModel: "text-embedding-v3",
    embeddingApiKey: "",
    embeddingDimensions: 1024,
    rerankerPreset: "dashscope",
    rerankerBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    rerankerModel: "gte-rerank",
    rerankerApiKey: ""
  });
  const [backupBusy, setBackupBusy] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const importInputRef = useRef(null);

  const pickPreset = (provider, baseUrl) => {
    if (provider === "local") return "local";
    const key = Object.keys(EMBEDDING_PRESETS).find((k) =>
      k !== "local" && k !== "custom" && baseUrl?.includes(EMBEDDING_PRESETS[k].baseUrl.replace(/^https?:\/\//, "").split("/")[0])
    );
    return key || "custom";
  };

  const applyModelPublic = (data) => {
    setSaved(data);
    setForm((current) => ({ ...current, baseUrl: data.baseUrl, model: data.model, apiKey: "" }));
  };

  const applyVisionPublic = (data) => {
    setVisionSaved(data);
    setVisionForm((current) => ({
      ...current,
      baseUrl: data.baseUrl === "https://api.openai.com/v1"
        ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
        : data.baseUrl,
      model: "qwen3.5-ocr",
      apiKey: ""
    }));
  };

  const applyEmbeddingPublic = (data) => {
    const embedding = data.embedding || {};
    const reranker = data.reranker || {};
    setRetrievalSaved((current) => ({ ...(current || {}), ...data }));
    setRetrievalForm((current) => ({
      ...current,
      provider: embedding.provider || "remote",
      embeddingPreset: pickPreset(embedding.provider, embedding.baseUrl),
      embeddingBaseUrl: embedding.baseUrl || current.embeddingBaseUrl,
      embeddingModel: embedding.model || current.embeddingModel,
      embeddingDimensions: embedding.dimensions || current.embeddingDimensions,
      embeddingApiKey: "",
      rerankerPreset: pickPreset(reranker.provider, reranker.baseUrl),
      rerankerBaseUrl: reranker.baseUrl || current.rerankerBaseUrl,
      rerankerModel: reranker.model || current.rerankerModel,
      rerankerApiKey: ""
    }));
  };

  const loadRetrievalHealth = () => {
    setRetrievalLoading(true);
    getHealth()
      .then((data) => {
        setRetrievalSaved((current) => ({
          ...(current || {}),
          healthEmbedding: data.embedding,
          service: data.retrievalService
        }));
      })
      .catch((error) => setRetrievalSaved({ error: error.message }))
      .finally(() => setRetrievalLoading(false));
  };

  useEffect(() => {
    getModelSettings()
      .then(applyModelPublic)
      .catch((error) => showToast(error.message))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    getVisionSettings()
      .then(applyVisionPublic)
      .catch((error) => showToast(error.message))
      .finally(() => setVisionLoading(false));
  }, [showToast]);

  useEffect(() => {
    getEmbeddingSettings()
      .then(applyEmbeddingPublic)
      .catch((error) => showToast(error.message))
      .finally(() => setRetrievalLoading(false));
    loadRetrievalHealth();
  }, [showToast]);

  const downloadConfigBackup = async () => {
    setConfirmExport(false);
    setBackupBusy(true);
    try {
      const { text, filename } = await exportModelConfig();
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("配置已导出");
    } catch (error) {
      showToast(error.message);
    } finally {
      setBackupBusy(false);
    }
  };

  const runImportConfigBackup = async (file) => {
    if (!file) return;
    setPendingImportFile(null);
    setBackupBusy(true);
    try {
      const payload = JSON.parse(await file.text());
      const result = await importModelConfig(payload);
      if (result.model) applyModelPublic(result.model);
      if (result.vision) applyVisionPublic(result.vision);
      if (result.embedding) applyEmbeddingPublic(result.embedding);
      setTestResult(null);
      setVisionTest(null);
      setEmbeddingTest(null);
      setRerankerTest(null);
      loadRetrievalHealth();
      const keys = (result.importedKeys || []).join("、") || "配置";
      showToast(`已导入 ${keys}`);
    } catch (error) {
      showToast(error.message || "导入失败");
    } finally {
      setBackupBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const applyPreset = (key, kind) => {
    const preset = EMBEDDING_PRESETS[key] || EMBEDDING_PRESETS.custom;
    setRetrievalForm((current) => ({
      ...current,
      [`${kind}Preset`]: key,
      [`${kind}BaseUrl`]: preset.baseUrl || current[`${kind}BaseUrl`],
      [`${kind}Model`]: preset[`${kind === "embedding" ? "embeddingModel" : "rerankerModel"}`] || current[`${kind}Model`]
    }));
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await testModelSettings(form);
      setTestResult({
        ok: true,
        message: data.modelAvailable === false
          ? `连接成功，但账号返回的模型列表中没有 ${form.model}`
          : `连接成功，${form.model} 可以使用`
      });
    } catch (error) {
      setTestResult({ ok: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await putModelSettings(form);
      setSaved(data);
      setForm((current) => ({ ...current, apiKey: "" }));
      showToast("模型配置已保存，无需重启即可生效");
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    try {
      const data = await putModelSettings({ ...form, apiKey: "", clearApiKey: true });
      setSaved(data);
      setTestResult(null);
      showToast("已清除保存的 API Key");
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  const testVision = async () => {
    setVisionBusy(true);
    setVisionTest(null);
    try {
      const data = await testVisionSettings(visionForm);
      setVisionTest({
        ok: true,
        message: data.modelAvailable === false
          ? `接口已连接，但模型列表中没有 ${visionForm.model}`
          : `接口已连接，${visionForm.model} 可用于 OCR`
      });
    } catch (error) {
      setVisionTest({ ok: false, message: error.message });
    } finally {
      setVisionBusy(false);
    }
  };

  const saveVision = async (clearApiKey = false) => {
    setVisionBusy(true);
    try {
      const data = await putVisionSettings({ ...visionForm, clearApiKey });
      setVisionSaved(data);
      setVisionForm((current) => ({ ...current, apiKey: "" }));
      if (clearApiKey) setVisionTest(null);
      showToast(clearApiKey ? "已清除 OCR 视觉模型密钥" : "OCR 视觉模型配置已保存");
    } catch (error) {
      showToast(error.message);
    } finally {
      setVisionBusy(false);
    }
  };

  const buildRetrievalPayload = (clearKeys = {}) => ({
    embedding: {
      provider: retrievalForm.provider,
      baseUrl: retrievalForm.embeddingBaseUrl,
      model: retrievalForm.embeddingModel,
      apiKey: retrievalForm.embeddingApiKey,
      dimensions: Number(retrievalForm.embeddingDimensions),
      clearApiKey: clearKeys.embedding
    },
    reranker: {
      provider: retrievalForm.provider,
      baseUrl: retrievalForm.rerankerBaseUrl,
      model: retrievalForm.rerankerModel,
      apiKey: retrievalForm.rerankerApiKey,
      clearApiKey: clearKeys.reranker
    }
  });

  const saveRetrieval = async (clearKeys = {}) => {
    setRetrievalSaving(true);
    try {
      const data = await putEmbeddingSettings(buildRetrievalPayload(clearKeys));
      setRetrievalSaved({ embedding: data.embedding, reranker: data.reranker });
      setRetrievalForm((current) => ({ ...current, embeddingApiKey: "", rerankerApiKey: "" }));
      showToast("检索模型配置已保存");
      loadRetrievalHealth();
    } catch (error) {
      showToast(error.message);
    } finally {
      setRetrievalSaving(false);
    }
  };

  const shareEmbeddingKeyWithReranker = async () => {
    if (!retrievalForm.embeddingApiKey && !retrievalSaved?.embedding?.configured) {
      showToast("请先填写并保存 Embedding API Key");
      return;
    }
    setRetrievalSaving(true);
    try {
      const data = await putEmbeddingSettings(buildRetrievalPayload({ reranker: true }));
      setRetrievalSaved({ embedding: data.embedding, reranker: data.reranker });
      setRetrievalForm((current) => ({ ...current, embeddingApiKey: "", rerankerApiKey: "" }));
      setRerankerTest(null);
      showToast("Reranker 已改为共用 Embedding API Key");
    } catch (error) {
      showToast(error.message);
    } finally {
      setRetrievalSaving(false);
    }
  };

  const testEmbeddingConnection = async () => {
    setEmbeddingTesting(true);
    setEmbeddingTest(null);
    try {
      const data = await testEmbeddingSettings(buildRetrievalPayload());
      setEmbeddingTest({
        ok: true,
        message: data.local ? data.message : `连接成功${data.provider ? `（${data.provider}）` : ""}`
      });
    } catch (error) {
      setEmbeddingTest({ ok: false, message: error.message });
    } finally {
      setEmbeddingTesting(false);
    }
  };

  const testRerankerConnection = async () => {
    setRerankerTesting(true);
    setRerankerTest(null);
    try {
      const data = await testRerankerSettings(buildRetrievalPayload());
      setRerankerTest({
        ok: true,
        message: data.local ? data.message : `连接成功${data.provider ? `（${data.provider}）` : ""}`
      });
    } catch (error) {
      setRerankerTest({ ok: false, message: error.message });
    } finally {
      setRerankerTesting(false);
    }
  };

  const retrievalConfigured = retrievalSaved?.embedding?.configured || retrievalForm.provider === "local";

  return (
    <>
      {!embedded && (
        <PageHeading
          eyebrow="应用设置 · 模型服务"
          title="模型设置"
          description="支持 DeepSeek、Kimi 等 OpenAI 兼容接口；Qwen3.5-OCR 负责识别 PDF 扫描页、文档截图和图片文字。"
        />
      )}
      <div className={`settings-layout ${embedded ? "settings-layout-embedded" : ""}`}>
        <div className="settings-main">
          <section className="panel settings-form">
          <div className="settings-head">
            <div className="settings-provider"><Sparkles size={20} /><div><strong>{saved?.provider || "文本模型"}</strong><span>OpenAI 兼容接口</span></div></div>
            <span className={`config-status ${saved?.configured ? "ready" : ""}`}>
              {saved?.configured ? <><Check size={13} /> 已配置</> : <><CircleAlert size={13} /> 未配置</>}
            </span>
          </div>

          {loading ? <div className="settings-loading"><Spinner /> 正在读取本地配置…</div> : (
            <div className="settings-fields">
              <label>
                <span>API 地址</span>
                <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.deepseek.com 或 https://api.moonshot.cn/v1" />
                <small>DeepSeek 官方地址通常不需要修改；Kimi 请填 https://api.moonshot.cn/v1</small>
              </label>
              <label>
                <span>模型名称</span>
                <select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>
                  <optgroup label="DeepSeek">
                    <option value="deepseek-v4-flash">deepseek-v4-flash（更快）</option>
                    <option value="deepseek-v4-pro">deepseek-v4-pro（更强）</option>
                  </optgroup>
                  <optgroup label="Kimi">
                    <option value="moonshot-v1-8k">moonshot-v1-8k</option>
                    <option value="moonshot-v1-32k">moonshot-v1-32k</option>
                    <option value="moonshot-v1-128k">moonshot-v1-128k</option>
                  </optgroup>
                </select>
                <small>默认使用 deepseek-v4-flash，响应更快；需要更强分析能力时切到 Pro。</small>
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={saved?.configured ? `已保存：${saved.apiKeyMasked}` : "输入 API Key"}
                />
                <small>{saved?.configured ? "留空会继续使用已保存的密钥。" : "密钥只发送到本机后端，不写入浏览器存储。"}</small>
              </label>
            </div>
          )}

          {testResult && (
            <div className={`connection-result ${testResult.ok ? "success" : "error"}`}>
              {testResult.ok ? <Check size={16} /> : <CircleAlert size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="settings-actions">
            {saved?.configured && <button className="text-btn danger-text" onClick={clearKey} disabled={saving}>清除密钥</button>}
            <button className="secondary-btn" onClick={testConnection} disabled={testing || loading}>
              {testing ? <Spinner /> : <Zap size={16} />} 测试连接
            </button>
            <button className="primary-btn" onClick={save} disabled={saving || loading || (!form.apiKey && !saved?.configured)}>
              {saving ? <Spinner /> : <Check size={16} />} 保存并启用
            </button>
          </div>
          </section>

          <section className="panel settings-form">
            <div className="settings-head">
              <div className="settings-provider"><FileText size={20} /><div><strong>Qwen3.5-OCR</strong><span>阿里云百炼 · 图片与扫描资料识别</span></div></div>
              <span className={`config-status ${visionSaved?.configured ? "ready" : ""}`}>
                {visionSaved?.configured ? <><Check size={13} /> 已配置</> : <><CircleAlert size={13} /> 未配置</>}
              </span>
            </div>

            {visionLoading ? <div className="settings-loading"><Spinner /> 正在读取 OCR 配置…</div> : (
              <div className="settings-fields">
                <label>
                  <span>API 地址</span>
                  <input value={visionForm.baseUrl} onChange={(event) => setVisionForm({ ...visionForm, baseUrl: event.target.value })} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
                  <small>默认使用阿里云百炼中国北京地址；使用专属工作空间时可以替换为对应地址。</small>
                </label>
                <label>
                  <span>OCR 模型</span>
                  <input value="qwen3.5-ocr" readOnly aria-readonly="true" />
                  <small>当前版本固定使用 Qwen3.5-OCR，模型名称无需修改。</small>
                </label>
                <label>
                  <span>API Key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={visionForm.apiKey}
                    onChange={(event) => setVisionForm({ ...visionForm, apiKey: event.target.value })}
                    placeholder={visionSaved?.configured ? `已保存：${visionSaved.apiKeyMasked}` : "输入阿里云百炼 API Key"}
                  />
                  <small>{visionSaved?.configured ? "留空会继续使用已保存的密钥。" : "API Key 仅保存在本机后端，不会返回浏览器或写入上传资料。"}</small>
                </label>
              </div>
            )}

            {visionTest && (
              <div className={`connection-result ${visionTest.ok ? "success" : "error"}`}>
                {visionTest.ok ? <Check size={16} /> : <CircleAlert size={16} />}
                <span>{visionTest.message}</span>
              </div>
            )}
            <div className="settings-actions">
              {visionSaved?.configured && <button className="text-btn danger-text" onClick={() => saveVision(true)} disabled={visionBusy}>清除密钥</button>}
              <button className="secondary-btn" onClick={testVision} disabled={visionBusy || visionLoading}>
                {visionBusy ? <Spinner /> : <Zap size={16} />} 测试连接
              </button>
              <button className="primary-btn" onClick={() => saveVision(false)} disabled={visionBusy || visionLoading || (!visionForm.apiKey && !visionSaved?.configured)}>
                {visionBusy ? <Spinner /> : <Check size={16} />} 保存 OCR 配置
              </button>
            </div>
          </section>

          <section className="panel settings-form">
            <div className="settings-head">
              <div className="settings-provider"><BrainCircuit size={20} /><div><strong>检索模型</strong><span>Embedding 召回 + Reranker 精排</span></div></div>
              <span className={`config-status ${retrievalConfigured ? "ready" : ""}`}>
                {retrievalConfigured ? <><Check size={13} /> 已配置</> : <><CircleAlert size={13} /> 未配置</>}
              </span>
            </div>

            {retrievalLoading ? <div className="settings-loading"><Spinner /> 正在读取检索配置…</div> : (
              <div className="settings-fields">
                <label>
                  <span>运行方式</span>
                  <select
                    value={retrievalForm.provider}
                    onChange={(event) => {
                      const provider = event.target.value;
                      setRetrievalForm((current) => ({
                        ...current,
                        provider,
                        embeddingPreset: provider === "local" ? "local" : "dashscope",
                        embeddingBaseUrl: provider === "local" ? "http://127.0.0.1:8001/v1" : EMBEDDING_PRESETS.dashscope.baseUrl,
                        embeddingModel: provider === "local" ? "BAAI/bge-m3" : EMBEDDING_PRESETS.dashscope.embeddingModel,
                        rerankerPreset: provider === "local" ? "local" : "dashscope",
                        rerankerBaseUrl: provider === "local" ? "http://127.0.0.1:8001/v1" : EMBEDDING_PRESETS.dashscope.baseUrl,
                        rerankerModel: provider === "local" ? "BAAI/bge-reranker-v2-m3" : EMBEDDING_PRESETS.dashscope.rerankerModel
                      }));
                    }}
                  >
                    <option value="local">本地 BGE-M3（离线运行，需要 .tools/python311 和 .data/models）</option>
                    <option value="remote">云端 API（默认阿里云百炼，可选其他）</option>
                  </select>
                  <small>默认使用阿里云百炼云端 Embedding/Reranker；选择本地会启动内置 Python 模型服务。</small>
                </label>

                <div className="settings-section-divider"><span>Embedding</span></div>
                {retrievalForm.provider === "remote" && (
                  <label>
                    <span>服务提供商</span>
                    <select value={retrievalForm.embeddingPreset} onChange={(event) => applyPreset(event.target.value, "embedding")}>
                      {Object.entries(EMBEDDING_PRESETS).filter(([k]) => k !== "local").map(([key, preset]) => (
                        <option value={key} key={key}>{preset.name}</option>
                      ))}
                    </select>
                    <small>选择后会自动填入推荐地址和模型名，仍可手动修改。</small>
                  </label>
                )}
                <label>
                  <span>API 地址</span>
                  <input
                    value={retrievalForm.embeddingBaseUrl}
                    onChange={(event) => setRetrievalForm((current) => ({ ...current, embeddingBaseUrl: event.target.value }))}
                    placeholder="https://api.siliconflow.cn/v1"
                    readOnly={retrievalForm.provider === "local"}
                  />
                </label>
                <label>
                  <span>模型名称</span>
                  <input
                    value={retrievalForm.embeddingModel}
                    onChange={(event) => setRetrievalForm((current) => ({ ...current, embeddingModel: event.target.value }))}
                    placeholder="BAAI/bge-m3"
                    readOnly={retrievalForm.provider === "local"}
                  />
                </label>
                <label>
                  <span>向量维度</span>
                  <input
                    type="number"
                    value={retrievalForm.embeddingDimensions}
                    onChange={(event) => setRetrievalForm((current) => ({ ...current, embeddingDimensions: event.target.value }))}
                    placeholder="1024"
                    readOnly={retrievalForm.provider === "local"}
                  />
                  <small>本地 BGE-M3 固定为 1024 维；云端模型请按服务商文档填写。</small>
                </label>
                {retrievalForm.provider === "remote" && (
                  <label>
                    <span>API Key</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={retrievalForm.embeddingApiKey}
                      onChange={(event) => setRetrievalForm((current) => ({ ...current, embeddingApiKey: event.target.value }))}
                      placeholder={retrievalSaved?.embedding?.configured
                        ? `已保存：${retrievalSaved.embedding.apiKeyMasked || "密钥"}，留空保持不变`
                        : "输入 Embedding API Key"}
                    />
                  </label>
                )}

                <div className="settings-section-divider"><span>Reranker</span></div>
                {retrievalForm.provider === "remote" && (
                  <label>
                    <span>服务提供商</span>
                    <select value={retrievalForm.rerankerPreset} onChange={(event) => applyPreset(event.target.value, "reranker")}>
                      {Object.entries(EMBEDDING_PRESETS).filter(([k]) => k !== "local").map(([key, preset]) => (
                        <option value={key} key={key}>{preset.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>API 地址</span>
                  <input
                    value={retrievalForm.rerankerBaseUrl}
                    onChange={(event) => setRetrievalForm((current) => ({ ...current, rerankerBaseUrl: event.target.value }))}
                    placeholder="https://api.siliconflow.cn/v1"
                    readOnly={retrievalForm.provider === "local"}
                  />
                </label>
                <label>
                  <span>模型名称</span>
                  <input
                    value={retrievalForm.rerankerModel}
                    onChange={(event) => setRetrievalForm((current) => ({ ...current, rerankerModel: event.target.value }))}
                    placeholder="BAAI/bge-reranker-v2-m3"
                    readOnly={retrievalForm.provider === "local"}
                  />
                </label>
                {retrievalForm.provider === "remote" && (
                  <label>
                    <span>API Key</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={retrievalForm.rerankerApiKey}
                      onChange={(event) => setRetrievalForm((current) => ({ ...current, rerankerApiKey: event.target.value }))}
                      placeholder={retrievalSaved?.reranker?.configured
                        ? `已保存：${retrievalSaved.reranker.apiKeyMasked || "密钥"}，留空保持不变`
                        : "输入 Reranker API Key"}
                    />
                  </label>
                )}
                {retrievalForm.provider === "remote" && retrievalSaved?.embedding?.configured && (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={shareEmbeddingKeyWithReranker}
                    disabled={retrievalSaving}
                  >
                    Reranker 共用 Embedding Key
                  </button>
                )}

                {retrievalForm.provider === "local" && retrievalSaved?.service?.error && (
                  <div className="connection-result error"><CircleAlert size={16} /><span>本地服务：{retrievalSaved.service.error}</span></div>
                )}
              </div>
            )}

            {embeddingTest && (
              <div className={`connection-result ${embeddingTest.ok ? "success" : "error"}`}>
                {embeddingTest.ok ? <Check size={16} /> : <CircleAlert size={16} />}
                <span>{embeddingTest.message}</span>
              </div>
            )}
            {rerankerTest && (
              <div className={`connection-result ${rerankerTest.ok ? "success" : "error"}`}>
                {rerankerTest.ok ? <Check size={16} /> : <CircleAlert size={16} />}
                <span>{rerankerTest.message}</span>
              </div>
            )}

            <div className="settings-actions">
              {retrievalForm.provider === "remote" && retrievalSaved?.embedding?.configured && (
                <button className="text-btn danger-text" onClick={() => saveRetrieval({ embedding: true, reranker: true })} disabled={retrievalSaving}>清除密钥</button>
              )}
              <button className="secondary-btn" onClick={testEmbeddingConnection} disabled={embeddingTesting || retrievalLoading || retrievalForm.provider === "local"}>
                {embeddingTesting ? <Spinner /> : <Zap size={16} />} 测试 Embedding
              </button>
              <button className="secondary-btn" onClick={testRerankerConnection} disabled={rerankerTesting || retrievalLoading || retrievalForm.provider === "local"}>
                {rerankerTesting ? <Spinner /> : <Zap size={16} />} 测试 Reranker
              </button>
              <button className="primary-btn" onClick={() => saveRetrieval()} disabled={retrievalSaving || retrievalLoading}>
                {retrievalSaving ? <Spinner /> : <Check size={16} />} 保存检索配置
              </button>
            </div>
          </section>

          <section className="panel settings-form">
            <div className="settings-head">
              <div className="settings-provider">
                <Download size={20} />
                <div>
                  <strong>配置备份</strong>
                  <span>导出 / 导入当前账号的模型、OCR、检索配置</span>
                </div>
              </div>
            </div>
            <div className="settings-fields">
              <p className="settings-backup-note">
                导出文件格式与命令行一致（zhifan-model-config/v1），可带到其他服务器后在此页导入，或使用
                {" "}
                <code>npm run config:import</code>
                。文件含明文 API Key，请离线保管。
              </p>
            </div>
            <div className="settings-actions">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setPendingImportFile(file);
                  else if (importInputRef.current) importInputRef.current.value = "";
                }}
              />
              <button
                className="secondary-btn"
                type="button"
                disabled={backupBusy}
                onClick={() => importInputRef.current?.click()}
              >
                {backupBusy ? <Spinner /> : <UploadCloud size={16} />} 导入配置
              </button>
              <button className="primary-btn" type="button" disabled={backupBusy} onClick={() => setConfirmExport(true)}>
                {backupBusy ? <Spinner /> : <Download size={16} />} 导出配置
              </button>
            </div>
          </section>
        </div>

        <aside className="settings-aside">
          <div className="concept-note">
            <span className="section-kicker">配置后会发生什么</span>
            <h3>先核对解析，再开始学习</h3>
            <p>每份资料会展示独立总结、关键点、解析原文预览和 OCR 统计，确认内容正确后再进入知识地图。</p>
          </div>
          <div className="concept-note">
            <span className="section-kicker">隐私说明</span>
            <h3>密钥不会返回前端</h3>
            <p>日常设置页只显示脱敏状态。仅在你主动导出备份时，才会下载含明文密钥的 JSON。</p>
          </div>
          <div className="concept-note">
            <span className="section-kicker">体积提示</span>
            <h3>云端模式可大幅瘦身</h3>
            <p>切换为云端 Embedding/Reranker 后，可删除 .data/models/bge-m3 和 .tools/python311，释放约 4GB 空间。</p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmExport}
        tone="warn"
        title="导出配置备份？"
        description="导出文件会包含解密后的 API Key，请妥善保管，不要上传到公开仓库。"
        confirmLabel="继续导出"
        cancelLabel="取消"
        onCancel={() => setConfirmExport(false)}
        onConfirm={downloadConfigBackup}
      />
      <ConfirmDialog
        open={Boolean(pendingImportFile)}
        tone="warn"
        title="导入并覆盖配置？"
        description="导入将覆盖当前账号已保存的模型、OCR 与检索配置。"
        confirmLabel="确认导入"
        cancelLabel="取消"
        onCancel={() => {
          setPendingImportFile(null);
          if (importInputRef.current) importInputRef.current.value = "";
        }}
        onConfirm={() => runImportConfigBackup(pendingImportFile)}
      />
    </>
  );
}
