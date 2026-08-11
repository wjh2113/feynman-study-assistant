/**
 * Import model/OCR/embedding settings from an export file.
 * Usage: node scripts/import-model-config.mjs <backup.json> [--create-missing-users]
 *
 * Matches users by username. Re-encrypts secrets with current APP_ENCRYPTION_KEY.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { getDatabase } from "../server/db/client.mjs";
import {
  MODEL_CONFIG_FORMAT,
  SETTING_KEYS,
  encryptSettingValue
} from "../server/model-config-backup.mjs";
import { hashPassword } from "../server/auth.mjs";
import { createUser, getUserByUsername, saveUserAppSetting } from "../server/storage.mjs";

const args = process.argv.slice(2).filter((item) => item !== "--");
const createMissing = args.includes("--create-missing-users");
const infile = args.find((item) => !item.startsWith("--"));
if (!infile) {
  console.error("Usage: node scripts/import-model-config.mjs <backup.json> [--create-missing-users]");
  process.exit(1);
}

const raw = JSON.parse(await readFile(infile, "utf8"));
if (raw.format !== MODEL_CONFIG_FORMAT || !Array.isArray(raw.users)) {
  throw new Error("不是有效的 zhifan-model-config/v1 备份文件");
}

await getDatabase();
let importedUsers = 0;
let importedSettings = 0;
let createdUsers = 0;

for (const entry of raw.users) {
  const username = String(entry.username || "").trim();
  if (!username) continue;
  let user = await getUserByUsername(username);
  if (!user) {
    if (!createMissing) {
      console.warn(`Skip missing user: ${username} (pass --create-missing-users to create)`);
      continue;
    }
    const password = randomBytes(18).toString("base64url");
    const { hash, salt } = await hashPassword(password);
    user = await createUser({
      id: randomUUID(),
      username,
      email: entry.email || null,
      passwordHash: hash,
      salt
    });
    createdUsers += 1;
    console.log(`Created user ${username} with temporary password: ${password}`);
  }

  importedUsers += 1;
  for (const key of SETTING_KEYS) {
    const bundle = entry.settings?.[key];
    if (!bundle?.value) continue;
    await saveUserAppSetting(user.id, key, encryptSettingValue(bundle.value));
    importedSettings += 1;
    console.log(`Imported ${username}/${key}`);
  }
}

console.log(`Done. users=${importedUsers}, created=${createdUsers}, settings=${importedSettings}`);
process.exit(0);
