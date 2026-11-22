// Writes the open data as a SQL file D1 accepts (`wrangler d1 execute --file`):
// no BEGIN/COMMIT, no PRAGMA but defer_foreign_keys, DDL copied verbatim from sqlite_master,
// one INSERT per row, then the calculation indexes and the FTS5 search tables.
// Every table is dropped first, so loading the file again replaces the data.
// MVP decision (2026-11-20): all but two of the upstream secondary indexes stay out of D1. They
// serve the Java calculator's queries, and would push a full load to about 194k rows written, above
// the 100k/day of the Free plan. Primary keys and FTS5 cover the searches, and the calculations get
// the six indexes of calculation.index.ts, each measured before it joined the dump; the load is
// then about 89k rows (docs/open-data.md, Lean D1).

import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { CALCULATION_INDEX_NAMES, CALCULATION_INDEX_STATEMENTS } from "./calculation.index.ts";
import { SEARCH_INDEX_STATEMENTS } from "./search.index.ts";

interface DumpTable {
  name: string;
  ddl: string;
}

interface DumpResult {
  sql: string;
  omittedIndexes: string[];
  statements: string[];
  statementCount: number;
  rowCounts: Record<string, number>;
}

// why: D1 rejects any single SQL statement above 100 KB.
const MAX_STATEMENT_BYTES = 100_000;
const DEFER_FOREIGN_KEYS = "PRAGMA defer_foreign_keys = TRUE;";
const SQL_NULL = "NULL";
const SINGLE_QUOTE = /'/g;
const ESCAPED_SINGLE_QUOTE = "''";
const HEX_ENCODING = "hex";

const LIST_TABLES_SQL = `
SELECT
  sqlite_master.name,
  sqlite_master.sql
FROM
  sqlite_master
WHERE
  sqlite_master.type = 'table' AND
  sqlite_master.name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND
  sqlite_master.name NOT LIKE 'SEARCH\\_%' ESCAPE '\\' AND
  sqlite_master.name <> 'flyway_schema_history'
ORDER BY
  sqlite_master.rowid;`;

const LIST_SECONDARY_INDEXES_SQL = `
SELECT
  sqlite_master.name
FROM
  sqlite_master
WHERE
  sqlite_master.type = 'index' AND
  sqlite_master.sql IS NOT NULL AND
  sqlite_master.tbl_name NOT LIKE 'SEARCH\\_%' ESCAPE '\\' AND
  sqlite_master.tbl_name <> 'flyway_schema_history'
ORDER BY
  sqlite_master.rowid;`;

const SEARCH_TABLES_SQL = `
SELECT
  sqlite_master.name
FROM
  sqlite_master
WHERE
  sqlite_master.type = 'table' AND
  sqlite_master.sql LIKE 'CREATE VIRTUAL TABLE%' AND
  sqlite_master.name LIKE 'SEARCH\\_%' ESCAPE '\\';`;

function createD1Dump(database: DatabaseSync) {
  const tables = sortParentsFirst(database, listTables(database));
  const rowCounts: Record<string, number> = {};
  const createStatements = tables.map((table) => terminate(table.ddl));
  const statements = [DEFER_FOREIGN_KEYS, ...dropStatements(database, tables), ...createStatements];

  // why: remote D1 imports in chunks, so defer_foreign_keys cannot cover a child loaded before its parent.
  for (const table of tables) {
    const inserts = insertStatements(database, table);
    rowCounts[table.name] = inserts.length;
    statements.push(...inserts);
  }

  statements.push(...CALCULATION_INDEX_STATEMENTS, ...SEARCH_INDEX_STATEMENTS);
  assertStatementSizes(statements);

  const dump: DumpResult = {
    sql: `${statements.join("\n")}\n`,
    omittedIndexes: listOmittedIndexes(database),
    statements,
    statementCount: statements.length,
    rowCounts,
  };
  return dump;
}

function listTables(database: DatabaseSync) {
  const tables = database
    .prepare(LIST_TABLES_SQL)
    .all()
    .map((row) => ({ name: String(row.name), ddl: String(row.sql) }));
  return tables;
}

// why: remote D1 imports in chunks, so each parent must hold its rows before any child row arrives.
function sortParentsFirst(database: DatabaseSync, tables: DumpTable[]) {
  const tableNames = new Set(tables.map((table) => table.name));
  const parentsByTable = new Map(
    tables.map((table) => [table.name, listParentTables(database, table.name, tableNames)]),
  );
  const sorted: DumpTable[] = [];
  let pending = [...tables];

  while (pending.length > 0) {
    const placedNames = new Set(sorted.map((table) => table.name));
    const ready = pending.filter((table) =>
      (parentsByTable.get(table.name) ?? []).every((parent) => placedNames.has(parent)),
    );

    if (ready.length === 0) {
      throw new Error(`Foreign key cycle among: ${pending.map((table) => table.name).join(", ")}`);
    }

    sorted.push(...ready);
    pending = pending.filter((table) => !ready.includes(table));
  }

  return sorted;
}

function listParentTables(database: DatabaseSync, tableName: string, tableNames: Set<string>) {
  const parents = database
    .prepare(
      'SELECT DISTINCT foreign_keys."table" AS parent FROM pragma_foreign_key_list(?) AS foreign_keys',
    )
    .all(tableName)
    .map((row) => String(row.parent))
    .filter((parent) => parent !== tableName && tableNames.has(parent));
  return parents;
}

function dropStatements(database: DatabaseSync, tables: DumpTable[]) {
  const searchTables = database
    .prepare(SEARCH_TABLES_SQL)
    .all()
    .map((row) => String(row.name));
  const tableNames = [...searchTables, ...tables.map((table) => table.name).reverse()];
  const statements = tableNames.map((tableName) => `DROP TABLE IF EXISTS "${tableName}";`);
  return statements;
}

function insertStatements(database: DatabaseSync, table: DumpTable) {
  const query = database.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`);
  query.setReadBigInts(true);

  const columnList = query
    .columns()
    .map((column) => `"${column.name}"`)
    .join(", ");
  const statements = query.all().map((row) => {
    const values = Object.values(row).map(toSqlLiteral).join(", ");
    const statement = `INSERT INTO "${table.name}" (${columnList}) VALUES (${values});`;
    return statement;
  });
  return statements;
}

function toSqlLiteral(value: SQLOutputValue) {
  if (value === null) {
    return SQL_NULL;
  }

  if (typeof value === "bigint") {
    const integerLiteral = value.toString();
    return integerLiteral;
  }

  if (typeof value === "number") {
    const realLiteral = toRealLiteral(value);
    return realLiteral;
  }

  if (typeof value === "string") {
    const textLiteral = `'${value.replace(SINGLE_QUOTE, ESCAPED_SINGLE_QUOTE)}'`;
    return textLiteral;
  }

  const blobLiteral = `X'${Buffer.from(value).toString(HEX_ENCODING)}'`;
  return blobLiteral;
}

// why: with readBigInts on, a JS number is always a SQLite REAL; "2" would load back as INTEGER.
function toRealLiteral(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot write a non-finite REAL to the D1 dump: ${value}`);
  }

  const shortest = String(value);
  const isIntegerLooking = /^-?\d+$/.test(shortest);
  const literal = isIntegerLooking ? `${shortest}.0` : shortest;
  return literal;
}

function listOmittedIndexes(database: DatabaseSync) {
  const indexNames = database
    .prepare(LIST_SECONDARY_INDEXES_SQL)
    .all()
    .map((row) => String(row.name))
    .filter((indexName) => !CALCULATION_INDEX_NAMES.includes(indexName));
  return indexNames;
}

function terminate(ddl: string) {
  const statement = `${ddl.trimEnd()};`;
  return statement;
}

function assertStatementSizes(statements: string[]) {
  const oversized = statements.find(
    (statement) => Buffer.byteLength(statement) > MAX_STATEMENT_BYTES,
  );

  if (oversized) {
    throw new Error(
      `D1 statement above ${MAX_STATEMENT_BYTES} bytes: ${oversized.slice(0, 120)}...`,
    );
  }
}

export type { DumpResult };
export { createD1Dump };
