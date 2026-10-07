#!/usr/bin/env node
/**
 * Top up per-document question banks to a minimum count.
 *
 * Usage:
 *   node scripts/topup-question-banks.mjs --project <projectId> [--min 50] [--user <userId>]
 */
import { getDatabase } from "../server/db/client.mjs";
import { runTopUpDocumentQuestionBanksJob } from "../server/services/document-question-bank.mjs";

function argValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  return String(process.argv[index + 1] || fallback).trim();
}

const projectId = argValue("--project");
const minCount = Number(argValue("--min", "50")) || 50;
let userId = argValue("--user");

if (!projectId) {
  console.error("Usage: node scripts/topup-question-banks.mjs --project <id> [--min 50]");
  process.exit(1);
}

if (!userId) {
  const db = await getDatabase();
  const result = await db.query("SELECT user_id, title FROM projects WHERE id = $1 LIMIT 1", [projectId]);
  userId = result.rows[0]?.user_id || "";
  if (result.rows[0]?.title) console.log(`Project: ${result.rows[0].title}`);
}

if (!userId) {
  console.error(`Project not found or missing user: ${projectId}`);
  process.exit(1);
}

console.log(`Topping up question banks for ${projectId} (user=${userId}) to ≥ ${minCount}…`);
const result = await runTopUpDocumentQuestionBanksJob(
  { projectId, userId, minCount },
  (pct) => console.log(`  progress ${pct}%`)
);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
