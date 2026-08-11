/**
 * Export per-user model/OCR/embedding settings for migration.
 * Usage: node scripts/export-model-config.mjs [outfile]
 *
 * Secrets are decrypted with APP_ENCRYPTION_KEY (or left plaintext if never encrypted).
 * Keep the output file private; do not commit it.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../server/db/client.mjs";
import {
  exportAllUserConfigBundles,
  wrapConfigPayload
} from "../server/model-config-backup.mjs";

const outArg = process.argv[2];
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = path.resolve(".data/backups/config");
await mkdir(backupDir, { recursive: true });
const outfile = path.resolve(outArg || path.join(backupDir, `model-config-${stamp}.json`));

await getDatabase();
const users = await exportAllUserConfigBundles();
const payload = wrapConfigPayload(users);

await writeFile(outfile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Exported ${payload.users.length} user config bundle(s) -> ${outfile}`);
for (const user of payload.users) {
  const keys = Object.keys(user.settings);
  console.log(`- ${user.username}: ${keys.join(", ") || "(empty)"}`);
}
process.exit(0);
