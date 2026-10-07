/**
 * Rebuild chunk indexes for every project that has documents.
 * Default: skip OCR (native text only) to avoid vision billing.
 *
 * Usage:
 *   node scripts/reindex-all-projects.mjs
 *   node scripts/reindex-all-projects.mjs --with-ocr
 *   node scripts/reindex-all-projects.mjs --user <userId>
 */
import "dotenv/config";
import { getDatabase } from "../server/db/client.mjs";
import { reindexProject } from "../server/services/reindex.mjs";

const args = process.argv.slice(2);
const withOcr = args.includes("--with-ocr");
const userFlag = args.indexOf("--user");
const onlyUser = userFlag >= 0 ? args[userFlag + 1] : null;

const db = await getDatabase();
const result = await db.query(
  `SELECT DISTINCT d.project_id, d.user_id, p.title,
          count(*)::int AS docs, coalesce(sum(d.chunk_count),0)::int AS chunks
     FROM documents d
     JOIN projects p ON p.id = d.project_id
    WHERE ($1::text IS NULL OR d.user_id = $1)
    GROUP BY d.project_id, d.user_id, p.title
    ORDER BY chunks DESC`,
  [onlyUser]
);

if (!result.rows.length) {
  console.log("No projects with documents.");
  process.exit(0);
}

console.log(`Reindexing ${result.rows.length} project(s), skipOcr=${!withOcr}`);
for (const row of result.rows) {
  const label = `${row.title || row.project_id} (${row.docs} docs, ${row.chunks} old chunks)`;
  process.stdout.write(`→ ${label} ... `);
  try {
    const out = await reindexProject(
      row.project_id,
      row.user_id,
      (percent) => {
        if (Number(percent) % 25 === 0) process.stdout.write(`${percent}% `);
      },
      { skipOcr: !withOcr }
    );
    console.log(`done → ${out.chunks} chunks / ${out.parents} parents`);
  } catch (error) {
    console.log(`FAILED: ${error.message}`);
  }
}

const after = await db.query(
  `SELECT d.filename, d.chunk_count,
          (d.parse_report->>'nativeCharacters')::int AS chars
     FROM documents d
    ORDER BY d.chunk_count DESC`
);
console.log("\nAfter reindex:");
for (const row of after.rows) {
  const avg = row.chars && row.chunk_count
    ? Math.round(row.chars / row.chunk_count)
    : "-";
  console.log(`  ${row.chunk_count}\tavg~${avg}\t${row.filename}`);
}

process.exit(0);
