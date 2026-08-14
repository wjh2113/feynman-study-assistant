import { getDatabase } from "./db/client.mjs";
import { decryptSecret, encryptSecret } from "./secret-crypto.mjs";
import { getUserById, saveUserAppSetting } from "./storage.mjs";

export const MODEL_CONFIG_FORMAT = "zhifan-model-config/v1";
export const SETTING_KEYS = ["deepseek", "vision", "embedding"];

function decryptSecretField(next, field) {
  if (typeof next[field] === "string" && next[field]) {
    try {
      next[field] = decryptSecret(next[field]);
    } catch (error) {
      next[field] = "";
      next._decryptError = error.message;
    }
  }
}

export function decryptSettingValue(value) {
  if (!value || typeof value !== "object") return value || {};
  const next = { ...value };
  decryptSecretField(next, "apiKey");
  decryptSecretField(next, "secretKey");
  if (next.embedding && typeof next.embedding === "object") {
    next.embedding = decryptSettingValue(next.embedding);
  }
  if (next.reranker && typeof next.reranker === "object") {
    next.reranker = decryptSettingValue(next.reranker);
  }
  return next;
}

export function encryptSettingValue(value) {
  if (!value || typeof value !== "object") return value || {};
  const next = { ...value };
  delete next._decryptError;
  if (typeof next.apiKey === "string" && next.apiKey) {
    next.apiKey = encryptSecret(next.apiKey);
  }
  if (typeof next.secretKey === "string" && next.secretKey) {
    next.secretKey = encryptSecret(next.secretKey);
  }
  if (next.embedding && typeof next.embedding === "object") {
    next.embedding = encryptSettingValue(next.embedding);
  }
  if (next.reranker && typeof next.reranker === "object") {
    next.reranker = encryptSettingValue(next.reranker);
  }
  return next;
}

export function parseSettingKey(rawKey) {
  const text = String(rawKey || "");
  const idx = text.indexOf(":");
  if (idx <= 0) return null;
  return { settingKey: text.slice(0, idx), userId: text.slice(idx + 1) };
}

export function wrapConfigPayload(users) {
  return {
    format: MODEL_CONFIG_FORMAT,
    exportedAt: new Date().toISOString(),
    note: "Contains plaintext API keys after decrypt. Keep offline. Import via Settings UI or npm run config:import -- <file>",
    encryptionConfigured: Boolean(process.env.APP_ENCRYPTION_KEY),
    users: users || []
  };
}

export async function buildUserConfigBundle(userId) {
  const db = await getDatabase();
  const userResult = await db.query(
    "SELECT id, username, email FROM users WHERE id = $1",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new Error("用户不存在");

  const settings = {};
  for (const key of SETTING_KEYS) {
    const meta = await db.query(
      "SELECT value, updated_at FROM app_settings WHERE key = $1",
      [`${key}:${userId}`]
    );
    const row = meta.rows[0];
    if (!row) continue;
    const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    settings[key] = {
      updatedAt: row.updated_at,
      value: decryptSettingValue(value || {})
    };
  }

  return {
    userId: user.id,
    username: user.username,
    email: user.email || null,
    settings
  };
}

export async function exportAllUserConfigBundles() {
  const db = await getDatabase();
  const usersResult = await db.query(
    "SELECT id, username, email, created_at FROM users ORDER BY created_at ASC"
  );
  const settingsResult = await db.query(
    "SELECT key, value, updated_at FROM app_settings ORDER BY key ASC"
  );

  const usersById = new Map(usersResult.rows.map((row) => [row.id, row]));
  const configsByUser = new Map();

  for (const row of settingsResult.rows) {
    const parsed = parseSettingKey(row.key);
    if (!parsed || !SETTING_KEYS.includes(parsed.settingKey)) continue;
    const user = usersById.get(parsed.userId);
    if (!user) continue;
    if (!configsByUser.has(user.id)) {
      configsByUser.set(user.id, {
        userId: user.id,
        username: user.username,
        email: user.email || null,
        settings: {}
      });
    }
    configsByUser.get(user.id).settings[parsed.settingKey] = {
      updatedAt: row.updated_at,
      value: decryptSettingValue(typeof row.value === "string" ? JSON.parse(row.value) : row.value)
    };
  }

  return [...configsByUser.values()];
}

function pickImportEntry(payload, username) {
  if (!payload || payload.format !== MODEL_CONFIG_FORMAT || !Array.isArray(payload.users)) {
    throw new Error("不是有效的 zhifan-model-config/v1 备份文件");
  }
  if (!payload.users.length) throw new Error("备份文件中没有可导入的用户配置");

  const normalized = String(username || "").trim().toLowerCase();
  const matched = payload.users.find(
    (entry) => String(entry.username || "").trim().toLowerCase() === normalized
  );
  if (matched) return matched;
  if (payload.users.length === 1) return payload.users[0];
  throw new Error(`备份中有多个用户，且没有与当前账号「${username}」匹配的配置`);
}

export async function importUserConfigBundle(userId, payload) {
  const user = await getUserById(userId);
  if (!user) throw new Error("用户不存在");

  const entry = pickImportEntry(payload, user.username);
  let importedSettings = 0;
  const importedKeys = [];

  for (const key of SETTING_KEYS) {
    const bundle = entry.settings?.[key];
    if (!bundle?.value || typeof bundle.value !== "object") continue;
    await saveUserAppSetting(userId, key, encryptSettingValue(bundle.value));
    importedSettings += 1;
    importedKeys.push(key);
  }

  if (!importedSettings) throw new Error("备份里没有可导入的模型配置");

  return {
    username: user.username,
    sourceUsername: entry.username || null,
    importedSettings,
    importedKeys
  };
}
