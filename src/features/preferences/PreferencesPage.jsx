import React, { useEffect, useState } from "react";
import { PageHeading } from "../../components/PageHeading.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { Check, FileText, GraduationCap, Sparkles } from "../../components/icons.jsx";
import { getPreferences, putPreferences } from "../../api/settings.js";
import { ModelSettingsPage } from "../settings/ModelSettingsPage.jsx";

const DEFAULTS = {
  coachMaxTurns: 3,
  coachPassScore: 75,
  coachRoleMode: "auto",
  coachShowEvidence: true,
  coachBlindspotThreshold: 60,
  ocrEnabled: true,
  ocrMaxImages: 40
};

export function PreferencesPage({ showToast, user, initialTab = "learning" }) {
  const [tab, setTab] = useState(initialTab === "models" ? "models" : "learning");
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTab(initialTab === "models" ? "models" : "learning");
  }, [initialTab]);

  useEffect(() => {
    getPreferences()
      .then((data) => setForm({ ...DEFAULTS, ...data }))
      .catch((error) => showToast(error.message))
      .finally(() => setLoading(false));
  }, [showToast]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await putPreferences(form);
      setForm({ ...DEFAULTS, ...data });
      showToast("个人设置已保存");
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="账号 · 个人中心"
        title="个人设置"
        description="统一管理学习节奏与模型服务。密钥与配置备份也在这里完成。"
        action={tab === "learning" ? (
          <button className="primary-btn" type="button" disabled={saving || loading} onClick={save}>
            {saving ? <Spinner /> : <Check size={16} />} 保存学习偏好
          </button>
        ) : null}
      />

      <div className="prefs-tabs">
        <button
          type="button"
          className={tab === "learning" ? "active" : ""}
          onClick={() => setTab("learning")}
        >
          <GraduationCap size={16} /> 学习偏好
        </button>
        <button
          type="button"
          className={tab === "models" ? "active" : ""}
          onClick={() => setTab("models")}
        >
          <Sparkles size={16} /> 模型服务
        </button>
      </div>

      {tab === "models" ? (
        <ModelSettingsPage showToast={showToast} embedded />
      ) : (
        <div className="settings-layout">
          <div className="settings-main">
            {loading ? (
              <section className="panel settings-form">
                <div className="settings-loading"><Spinner /> 正在读取个人设置…</div>
              </section>
            ) : (
              <>
                <section className="panel settings-form">
                  <div className="settings-head">
                    <div className="settings-provider">
                      <GraduationCap size={20} />
                      <div>
                        <strong>费曼对练</strong>
                        <span>轮次、角色策略、评分与盲区阈值</span>
                      </div>
                    </div>
                  </div>

                  <div className="settings-fields">
                    <label>
                      <span>追问轮次（含初始问题）</span>
                      <select
                        value={form.coachMaxTurns}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          coachMaxTurns: Number(event.target.value)
                        }))}
                      >
                        {[2, 3, 4, 5, 6].map((value) => (
                          <option value={value} key={value}>{value} 轮</option>
                        ))}
                      </select>
                      <small>默认 3 轮。改大更深入，改小更适合快速过一遍。</small>
                    </label>

                    <label>
                      <span>通过分数线</span>
                      <input
                        type="number"
                        min={60}
                        max={95}
                        value={form.coachPassScore}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          coachPassScore: Number(event.target.value)
                        }))}
                      />
                      <small>结束并保存时，四维均分达到该分数视为通过。</small>
                    </label>

                    <label>
                      <span>角色策略</span>
                      <select
                        value={form.coachRoleMode}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          coachRoleMode: event.target.value
                        }))}
                      >
                        <option value="auto">自动：前几轮小白，末轮专家</option>
                        <option value="child">固定小白模式</option>
                        <option value="expert">固定专家模式</option>
                      </select>
                    </label>

                    <label>
                      <span>盲区触发阈值</span>
                      <input
                        type="number"
                        min={40}
                        max={80}
                        value={form.coachBlindspotThreshold}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          coachBlindspotThreshold: Number(event.target.value)
                        }))}
                      />
                      <small>任一分项低于该分数，或最后一轮结束时，强制生成盲区。</small>
                    </label>

                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(form.coachShowEvidence)}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          coachShowEvidence: event.target.checked
                        }))}
                      />
                      <span>对练时显示资料依据</span>
                    </label>
                  </div>
                </section>

                <section className="panel settings-form">
                  <div className="settings-head">
                    <div className="settings-provider">
                      <FileText size={20} />
                      <div>
                        <strong>图片 OCR</strong>
                        <span>上传扫描 PDF、DOCX 截图或图片时是否识别文字</span>
                      </div>
                    </div>
                  </div>

                  <div className="settings-fields">
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(form.ocrEnabled)}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          ocrEnabled: event.target.checked
                        }))}
                      />
                      <span>开启图片 OCR 识别</span>
                    </label>

                    <label>
                      <span>单份资料最多识别张数</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        disabled={!form.ocrEnabled}
                        value={form.ocrMaxImages}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          ocrMaxImages: Number(event.target.value)
                        }))}
                      />
                      <small>
                        范围 1–200。图片多时提高张数可识别更多内容，也会更慢、更耗额度。密钥在「模型服务」中配置。
                      </small>
                    </label>
                  </div>

                  <div className="settings-actions">
                    <button className="secondary-btn" type="button" onClick={() => setTab("models")}>
                      <Sparkles size={16} /> 去配置 OCR 密钥
                    </button>
                    <button className="primary-btn" type="button" disabled={saving || loading} onClick={save}>
                      {saving ? <Spinner /> : <Check size={16} />} 保存学习偏好
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="settings-aside">
            <div className="concept-note">
              <span className="section-kicker">当前账号</span>
              <h3>{user?.username || "未登录"}</h3>
              <p>学习偏好与模型配置都保存在你的账号下，切换项目不会丢失。</p>
            </div>
            <div className="concept-note">
              <span className="section-kicker">OCR 说明</span>
              <h3>按需开启</h3>
              <p>关闭后仍可解析正文；扫描件与截图文字不会识别。改设置后需对资料重新解析才会生效。</p>
            </div>
            <div className="concept-note">
              <span className="section-kicker">模型服务</span>
              <h3>密钥与备份</h3>
              <p>文本模型、OCR 提供商、检索模型，以及配置导出/导入，都在「模型服务」页签。</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
