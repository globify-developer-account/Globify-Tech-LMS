#!/usr/bin/env node
// Copies every row from the old PostgreSQL database (Neon) into the new MySQL /
// MariaDB database. Run it once, after `pnpm db:deploy` has created the empty
// tables on the target:
//
//   SOURCE_DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" \
//   DATABASE_URL="mysql://user:pass@host:3306/db" \
//   node scripts/copy-postgres-to-mysql.mjs [--dry-run]
//
// --dry-run copies everything inside a transaction and then rolls it back, so
// you find out whether every row fits before anything is written.
//
// The copy is one transaction: it either lands completely or not at all. It
// refuses to run if any target table already has rows.

import pg from "pg";
import mysql from "mysql2/promise";

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE = process.env.SOURCE_DATABASE_URL;
const TARGET = process.env.DATABASE_URL;
if (!SOURCE?.startsWith("postgres")) fail("SOURCE_DATABASE_URL must be the PostgreSQL (Neon) connection string. Use the direct, non-pooled one.");
if (!TARGET?.startsWith("mysql://")) fail("DATABASE_URL must be the mysql:// connection string of the new database.");

// Prisma stores DateTime as UTC in `timestamp without time zone`. node-postgres
// would read those as local time and shift them, so take the text as it is:
// '2026-09-17 10:11:12.345' is also what MySQL DATETIME(3) expects.
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString().replace("T", " ").replace("Z", "")); // timestamptz
pg.types.setTypeParser(1082, (v) => v); // date

const src = new pg.Client({ connectionString: SOURCE });
const dst = await mysql.createConnection({ uri: TARGET, timezone: "Z", charset: "utf8mb4", supportBigNumbers: true, bigNumberStrings: true });

try {
  await src.connect();
  await src.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const dbName = (await dst.query("SELECT DATABASE() AS db"))[0][0].db;
  console.log(`Source: PostgreSQL ${(await src.query("SHOW server_version")).rows[0].server_version}`);
  console.log(`Target: ${(await dst.query("SELECT VERSION() AS v"))[0][0].v}, database ${dbName}${DRY_RUN ? "  (dry run)" : ""}\n`);

  const [targetCols] = await dst.query(
    "SELECT table_name AS t, column_name AS c, data_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position",
  );
  const tables = new Map();
  for (const r of targetCols) {
    if (r.t === "_prisma_migrations") continue;
    if (!tables.has(r.t)) tables.set(r.t, []);
    tables.get(r.t).push({ name: r.c, type: String(r.type).toLowerCase(), nullable: r.nullable === "YES" });
  }
  if (!tables.size) fail("The target has no tables. Run `pnpm db:deploy` against it first.");

  const sourceCols = new Map();
  // Base tables only: a view (pg_stat_statements, for one) is not data to copy.
  const sourceColumnsSql = `
    SELECT c.table_name AS t, c.column_name AS c, c.data_type AS type
    FROM information_schema.columns c
    JOIN information_schema.tables b ON b.table_schema = c.table_schema AND b.table_name = c.table_name
    WHERE c.table_schema = 'public' AND b.table_type = 'BASE TABLE'`;
  for (const r of (await src.query(sourceColumnsSql)).rows) {
    if (!sourceCols.has(r.t)) sourceCols.set(r.t, new Map());
    sourceCols.get(r.t).set(r.c, r.type);
  }

  // Refuse to mix with existing data.
  const nonEmpty = [];
  for (const t of tables.keys()) {
    const [[row]] = await dst.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    if (Number(row.n) > 0) nonEmpty.push(`${t} (${row.n})`);
  }
  if (nonEmpty.length) fail(`These target tables already have rows: ${nonEmpty.join(", ")}.\nCopy into a freshly migrated, empty database.`);

  const missingInSource = [...tables.keys()].filter((t) => !sourceCols.has(t));
  const missingInTarget = [...sourceCols.keys()].filter((t) => !tables.has(t) && t !== "_prisma_migrations");
  if (missingInTarget.length) fail(`Source tables with no target table: ${missingInTarget.join(", ")}. Is the target on the latest migration?`);
  if (missingInSource.length) console.log(`Not in the source, left empty: ${missingInSource.join(", ")}\n`);

  const [[{ map }]] = await dst.query("SELECT @@max_allowed_packet AS map");
  const maxBatchBytes = Math.min(4 * 1024 * 1024, Math.floor(Number(map) / 4));

  // Hostinger drops a connection that sits idle for 20 seconds, and this one
  // idles while each table is read from PostgreSQL. Keep it open.
  await dst.query("SET SESSION wait_timeout = 3600");
  // Strict mode turns silent truncation into an error, so nothing is cut short.
  await dst.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
  await dst.query("SET SESSION foreign_key_checks = 0"); // rows arrive in table order, not dependency order
  await dst.beginTransaction();

  const report = [];
  for (const [table, cols] of tables) {
    const srcTypes = sourceCols.get(table);
    if (!srcTypes) continue;
    const copied = cols.filter((c) => srcTypes.has(c.name));
    const notInSource = cols.filter((c) => !srcTypes.has(c.name)).map((c) => c.name);
    if (notInSource.length) console.log(`  ${table}: no source column for ${notInSource.join(", ")}; the default is used`);

    // JSON comes across as its exact text (so a stored JSON null stays distinct
    // from SQL NULL), and lists, enum lists included, as JSON array text.
    const select = copied
      .map((c) => {
        const t = srcTypes.get(c.name);
        if (t === "ARRAY") return `to_json("${c.name}")::text AS "${c.name}"`;
        if (t === "json" || t === "jsonb") return `"${c.name}"::text AS "${c.name}"`;
        return `"${c.name}"`;
      })
      .join(", ");
    const { rows } = await src.query(`SELECT ${select} FROM "${table}"`);

    const values = rows.map((row) => copied.map((c) => toMysql(row[c.name], c, srcTypes.get(c.name))));
    const columnList = copied.map((c) => `\`${c.name}\``).join(", ");
    let batch = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      try {
        await dst.query(`INSERT INTO \`${table}\` (${columnList}) VALUES ?`, [batch]);
      } catch (e) {
        throw new Error(`${table}: ${e.message}`);
      }
      batch = [];
      bytes = 0;
    };
    for (const v of values) {
      const size = v.reduce((n, x) => n + (typeof x === "string" ? Buffer.byteLength(x) : 8), 0);
      if (bytes + size > maxBatchBytes || batch.length >= 500) await flush();
      batch.push(v);
      bytes += size;
    }
    await flush();
    report.push({ table, source: rows.length });
  }

  // Verify inside the transaction, before committing.
  let mismatches = 0;
  for (const r of report) {
    const [[row]] = await dst.query(`SELECT COUNT(*) AS n FROM \`${r.table}\``);
    r.target = Number(row.n);
    if (r.target !== r.source) mismatches++;
  }
  const width = Math.max(...report.map((r) => r.table.length));
  console.log("\n" + report.filter((r) => r.source > 0).map((r) => `${r.table.padEnd(width)}  ${String(r.source).padStart(6)} → ${String(r.target).padStart(6)}${r.source === r.target ? "" : "  MISMATCH"}`).join("\n"));
  console.log(`\n${report.reduce((n, r) => n + r.source, 0)} rows across ${report.filter((r) => r.source > 0).length} non-empty tables.`);

  if (mismatches) {
    await dst.rollback();
    fail(`${mismatches} table(s) have different row counts. Nothing was written.`);
  }
  if (DRY_RUN) {
    await dst.rollback();
    console.log("Dry run: every row fits. Rolled back; nothing was written.");
  } else {
    await dst.commit();
    console.log("Committed.");
  }
} catch (e) {
  try { await dst.rollback(); } catch {}
  fail(e instanceof Error ? e.message : String(e));
} finally {
  await src.end().catch(() => {});
  await dst.end().catch(() => {});
}

/** Converts one PostgreSQL value to what the MySQL column expects. */
function toMysql(value, col, srcType) {
  // A list that was NULL in PostgreSQL is an empty list to Prisma.
  if (srcType === "ARRAY") return value ?? (col.nullable ? null : "[]");
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace("Z", "");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
