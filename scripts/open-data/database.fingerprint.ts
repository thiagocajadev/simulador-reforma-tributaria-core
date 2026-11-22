// Fingerprints the open data tables so two databases can be compared without shipping either one:
// row count, a hash of every row and a hash of the DDL, per table, plus the index names.

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

interface TableFingerprint {
  rowCount: number;
  rowsHash: string;
  ddlHash: string;
}

interface DatabaseFingerprint {
  databaseVersion: string;
  tables: Record<string, TableFingerprint>;
  indexes: string[];
}

const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const CRLF = "\r\n";
const LF = "\n";

// why: these columns default to strftime('now'), so they hold the time of each build, not data.
const VOLATILE_COLUMNS: Record<string, string[]> = { VERSAO_BASE_DADO: ["VRBD_DATA"] };

// why: Flyway bookkeeping and SQLite statistics are not open data; SEARCH_ tables are derived by search.index.ts.
const EXCLUDED_TABLE_FILTER = `
  sqlite_master.name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND
  sqlite_master.name NOT LIKE 'SEARCH\\_%' ESCAPE '\\' AND
  sqlite_master.name <> 'flyway_schema_history'`;

const LIST_TABLES_SQL = `
SELECT
  sqlite_master.name,
  sqlite_master.sql
FROM
  sqlite_master
WHERE
  sqlite_master.type = 'table' AND
  ${EXCLUDED_TABLE_FILTER}
ORDER BY
  sqlite_master.name;`;

const LIST_INDEXES_SQL = `
SELECT
  sqlite_master.name
FROM
  sqlite_master
WHERE
  sqlite_master.type = 'index' AND
  sqlite_master.tbl_name IN (
    SELECT sqlite_master.name FROM sqlite_master WHERE sqlite_master.type = 'table' AND ${EXCLUDED_TABLE_FILTER}
  )
ORDER BY
  sqlite_master.name;`;

const DATABASE_VERSION_SQL = `
SELECT
  VERSAO_BASE_DADO.VRBD_VERSAO_BASE_DADO AS version
FROM
  VERSAO_BASE_DADO
ORDER BY
  VERSAO_BASE_DADO.VRBD_ID DESC
LIMIT 1;`;

function fingerprintDatabase(database: DatabaseSync) {
  const tables = fingerprintTables(database);
  const indexes = database
    .prepare(LIST_INDEXES_SQL)
    .all()
    .map((row) => String(row.name));
  const databaseVersion = String(database.prepare(DATABASE_VERSION_SQL).get()?.version);
  const fingerprint: DatabaseFingerprint = { databaseVersion, tables, indexes };
  return fingerprint;
}

function fingerprintTables(database: DatabaseSync) {
  const tableRows = database.prepare(LIST_TABLES_SQL).all();
  const entries = tableRows.map((tableRow) => {
    const tableName = String(tableRow.name);
    const ddl = String(tableRow.sql);
    const entry: [string, TableFingerprint] = [
      tableName,
      fingerprintTable({ database, tableName, ddl }),
    ];
    return entry;
  });
  const tables = Object.fromEntries(entries);
  return tables;
}

function fingerprintTable(input: { database: DatabaseSync; tableName: string; ddl: string }) {
  const { database, tableName, ddl } = input;
  const rows = readRowsInStableOrder(database, tableName);
  const rowsHash = hashText(JSON.stringify(rows));
  // why: SQLite keeps the CREATE text as read, and Git checks the Flyway SQL out with CRLF on Windows and LF on Linux.
  const ddlHash = hashText(ddl.replaceAll(CRLF, LF));
  const fingerprint: TableFingerprint = { rowCount: rows.length, rowsHash, ddlHash };
  return fingerprint;
}

// why: JSON reads REAL 2.0 and INTEGER 2 alike, so each value travels with its SQLite storage type.
function readRowsInStableOrder(database: DatabaseSync, tableName: string) {
  const volatileColumns = VOLATILE_COLUMNS[tableName] ?? [];
  const columnNames = database
    .prepare(`SELECT * FROM "${tableName}" LIMIT 0`)
    .columns()
    .map((column) => `"${column.name}"`)
    .filter((columnName) => !volatileColumns.includes(columnName.slice(1, -1)));
  const orderList = columnNames.join(", ");
  const typedList = columnNames
    .map((columnName) => `typeof(${columnName}), ${columnName}`)
    .join(", ");
  const rows = database
    .prepare(`SELECT ${typedList} FROM "${tableName}" ORDER BY ${orderList}`)
    .all();
  return rows;
}

function hashText(text: string) {
  const digest = createHash(HASH_ALGORITHM).update(text).digest(HASH_ENCODING);
  return digest;
}

export type { DatabaseFingerprint, TableFingerprint };
export { fingerprintDatabase };
