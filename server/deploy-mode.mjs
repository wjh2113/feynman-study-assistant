function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

/**
 * 单机模式：PGlite 落盘 + 本地原文件 + 可选内存队列。
 * DEPLOY_MODE=standalone|single|single-node|local，或 STANDALONE=true。
 */
export function isStandaloneDeploy() {
  const mode = String(process.env.DEPLOY_MODE || "").toLowerCase();
  if (["standalone", "single", "single-node", "local"].includes(mode)) return true;
  return truthy(process.env.STANDALONE);
}
