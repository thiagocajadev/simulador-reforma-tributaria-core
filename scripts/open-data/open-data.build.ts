// Builds the open data from the upstream Flyway scripts into .data/:
// open-data.sqlite (local database), open-data.sql (D1 dump) and open-data.manifest.json.
// Usage: npm run data:build

import { execFileSync } from "node:child_process";
import fileSystem from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { createD1Dump, type DumpResult } from "./d1.dump.ts";
import { fingerprintDatabase } from "./database.fingerprint.ts";
import { createOpenDatabase } from "./open-data.create.ts";
import {
  DUMP_OUTPUT_PATH,
  FLYWAY_SQL_DIRECTORY,
  MANIFEST_OUTPUT_PATH,
  OUTPUT_DIRECTORY,
  SQLITE_OUTPUT_PATH,
  UPSTREAM_ROOT,
} from "./open-data.paths.ts";

interface OpenDataManifest {
  databaseVersion: string;
  upstreamCommit: string;
  totalRows: number;
  statementCount: number;
  dumpBytes: number;
  omittedIndexCount: number;
  tables: Record<string, { rowCount: number; rowsHash: string }>;
  searchTables: Record<string, number>;
}

const JSON_INDENT = 2;
const SEARCH_TABLE_NAMES = [
  "SEARCH_NCM",
  "SEARCH_NBS",
  "SEARCH_CLASSIFICATION",
  "SEARCH_MUNICIPALITY",
];

function start() {
  try {
    buildOpenData();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function buildOpenData() {
  fileSystem.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  fileSystem.rmSync(SQLITE_OUTPUT_PATH, { force: true });

  const database = createOpenDatabase({
    sqlDirectory: FLYWAY_SQL_DIRECTORY,
    location: SQLITE_OUTPUT_PATH,
  });
  const dump = createD1Dump(database);
  const manifest = describeOpenData(database, dump);
  database.close();

  fileSystem.writeFileSync(DUMP_OUTPUT_PATH, dump.sql);
  fileSystem.writeFileSync(
    MANIFEST_OUTPUT_PATH,
    `${JSON.stringify(manifest, null, JSON_INDENT)}\n`,
  );
  console.log(
    `Open data ${manifest.databaseVersion}: ${manifest.totalRows} rows, ${manifest.statementCount} statements, ${manifest.dumpBytes} bytes in ${DUMP_OUTPUT_PATH}`,
  );
}

function describeOpenData(database: DatabaseSync, dump: DumpResult) {
  const { databaseVersion, tables } = fingerprintDatabase(database);
  const totalRows = Object.values(dump.rowCounts).reduce((sum, rowCount) => sum + rowCount, 0);
  const manifest: OpenDataManifest = {
    databaseVersion,
    upstreamCommit: readUpstreamCommit(),
    totalRows,
    statementCount: dump.statementCount,
    dumpBytes: Buffer.byteLength(dump.sql),
    omittedIndexCount: dump.omittedIndexes.length,
    tables: Object.fromEntries(
      Object.entries(tables).map(([tableName, { rowCount, rowsHash }]) => [
        tableName,
        { rowCount, rowsHash },
      ]),
    ),
    searchTables: countSearchRows(database),
  };
  return manifest;
}

function readUpstreamCommit() {
  const commit = execFileSync("git", ["-C", UPSTREAM_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  return commit;
}

function countSearchRows(database: DatabaseSync) {
  const entries = SEARCH_TABLE_NAMES.map((tableName) => {
    const rowCount = Number(
      database.prepare(`SELECT count(*) AS total FROM ${tableName}`).get()?.total,
    );
    const entry: [string, number] = [tableName, rowCount];
    return entry;
  });
  const searchRows = Object.fromEntries(entries);
  return searchRows;
}

start();
