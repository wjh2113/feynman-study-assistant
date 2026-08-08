import { isStandaloneDeploy } from "./deploy-mode.mjs";
import { assertProductionObjectStorage } from "./object-storage.mjs";

function truthy(value) {
  return ["1", "true", "yes", "on", "require"].includes(String(value || "").toLowerCase());
}

export { isStandaloneDeploy };

/** Build pg Pool ssl option from DATABASE_SSL / DATABASE_SSL_CA. */
export function databaseSslOption() {
  const mode = String(process.env.DATABASE_SSL || "").toLowerCase();
  if (!mode || mode === "false" || mode === "0" || mode === "disable") return undefined;
  if (mode === "verify" || mode === "verify-full") {
    return {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_SSL_CA || undefined
    };
  }
  // Managed cloud DBs often use private CA; default require without strict CA pin.
  return { rejectUnauthorized: false };
}

export function assertProductionRuntimeConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const standalone = isStandaloneDeploy();
  const errors = [];

  if (!process.env.APP_ENCRYPTION_KEY || Buffer.byteLength(process.env.APP_ENCRYPTION_KEY, "utf8") < 32) {
    errors.push("生产环境必须设置至少 32 字节的 APP_ENCRYPTION_KEY");
  }
  if (!process.env.ALLOWED_ORIGINS) {
    errors.push("生产环境必须设置 ALLOWED_ORIGINS 为实际 HTTPS 来源");
  }

  if (standalone) {
    const storageProvider = String(process.env.STORAGE_PROVIDER || "local").toLowerCase();
    if (!["local", "jdcloud", "s3", "oss"].includes(storageProvider)) {
      errors.push(`单机模式下 STORAGE_PROVIDER 无效：${storageProvider}`);
    }
  } else {
    if (!process.env.DATABASE_URL) {
      errors.push("云模式生产环境必须设置 DATABASE_URL；单机部署请设置 DEPLOY_MODE=standalone");
    }
    if (!process.env.REDIS_URL) {
      errors.push("云模式生产环境必须设置 REDIS_URL；单机部署请设置 DEPLOY_MODE=standalone");
    }
    try {
      assertProductionObjectStorage();
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length) {
    throw new Error(`生产配置校验失败：\n- ${errors.join("\n- ")}`);
  }
}

export function runtimeConfigHints() {
  return {
    deployMode: isStandaloneDeploy() ? "standalone" : "cloud",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    databaseSsl: truthy(process.env.DATABASE_SSL),
    redisConfigured: Boolean(process.env.REDIS_URL),
    storageProvider: String(process.env.STORAGE_PROVIDER || "local").toLowerCase()
  };
}
