import { getDatabase, databaseStatus } from "../server/db/client.mjs";

const db = await getDatabase();
console.log("status", await databaseStatus());

const users = await db.query("SELECT id, username FROM users ORDER BY created_at");
console.log("users", users.rows);

const tables = await db.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name ILIKE '%setting%'
`);
console.log("setting tables", tables.rows);

for (const table of tables.rows.map((row) => row.table_name)) {
  const result = await db.query(`SELECT * FROM ${table} LIMIT 20`);
  console.log(`table ${table} rows=${result.rows.length}`);
  for (const row of result.rows) {
    const preview = { ...row };
    if (typeof preview.value === "object") {
      preview.value = JSON.stringify(preview.value).slice(0, 120);
    } else if (typeof preview.value === "string") {
      preview.value = preview.value.slice(0, 120);
    }
    console.log(preview);
  }
}

process.exit(0);
