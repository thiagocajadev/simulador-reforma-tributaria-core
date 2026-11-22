// Applies the upstream Flyway scripts to a SQLite database in the order Flyway runs them:
// beforeMigrate callback, B baseline, V migrations by version, afterMigrate callback.

import fileSystem from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

interface FlywayScript {
  name: string;
  filePath: string;
}

interface FlywayApplyInput {
  database: DatabaseSync;
  scripts: FlywayScript[];
}

const BEFORE_MIGRATE_FILE = "beforeMigrate.sql";
const AFTER_MIGRATE_FILE = "afterMigrate.sql";
const MIGRATION_PATTERN = /^([BV])(\d+)__.+\.sql$/;
const BASELINE_PREFIX = "B";
const SCRIPT_ENCODING = "utf8";

// why: SQLite ignores PRAGMA foreign_keys inside a transaction, so Flyway (mixed mode) runs these scripts outside one.
const FOREIGN_KEYS_PRAGMA = /PRAGMA\s+foreign_keys\s*=/i;

class FlywayScriptError extends Error {
  constructor(scriptName: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Flyway script ${scriptName} failed: ${reason}`, { cause });
    this.name = "FlywayScriptError";
  }
}

function listFlywayScripts(sqlDirectory: string) {
  const filePaths = listSqlFiles(sqlDirectory);
  const callbacks = indexCallbacks(filePaths);
  const migrations = sortMigrations(filePaths);
  const scripts = [callbacks.beforeMigrate, ...migrations, callbacks.afterMigrate].map(toScript);
  return scripts;
}

function listSqlFiles(sqlDirectory: string) {
  const isDirectoryPresent = fileSystem.existsSync(sqlDirectory);

  if (!isDirectoryPresent) {
    throw new Error(
      `Flyway directory not found: ${sqlDirectory}. Run "git submodule update --init" first.`,
    );
  }

  const entries = fileSystem.readdirSync(sqlDirectory, { recursive: true, encoding: "utf8" });
  const filePaths = entries
    .filter((entry) => entry.endsWith(".sql"))
    .map((entry) => path.join(sqlDirectory, entry));
  return filePaths;
}

function indexCallbacks(filePaths: string[]) {
  const beforeMigrate = findCallback(filePaths, BEFORE_MIGRATE_FILE);
  const afterMigrate = findCallback(filePaths, AFTER_MIGRATE_FILE);
  const callbacks = { beforeMigrate, afterMigrate };
  return callbacks;
}

function findCallback(filePaths: string[], fileName: string) {
  const filePath = filePaths.find((candidate) => path.basename(candidate) === fileName);

  if (!filePath) {
    throw new Error(`Flyway callback ${fileName} not found among ${filePaths.length} scripts`);
  }

  return filePath;
}

function sortMigrations(filePaths: string[]) {
  const migrations = filePaths
    .map((filePath) => ({ filePath, match: MIGRATION_PATTERN.exec(path.basename(filePath)) }))
    .filter((candidate) => candidate.match !== null)
    .map(({ filePath, match }) => ({
      filePath,
      isBaseline: match?.[1] === BASELINE_PREFIX,
      version: Number(match?.[2]),
    }))
    .sort(compareMigrations)
    .map((migration) => migration.filePath);
  return migrations;
}

function compareMigrations(
  left: { isBaseline: boolean; version: number },
  right: { isBaseline: boolean; version: number },
) {
  const baselineOrder = Number(right.isBaseline) - Number(left.isBaseline);
  const order = baselineOrder === 0 ? left.version - right.version : baselineOrder;
  return order;
}

function toScript(filePath: string) {
  const script: FlywayScript = { name: path.basename(filePath), filePath };
  return script;
}

function applyFlywayScripts(input: FlywayApplyInput) {
  const { database, scripts } = input;

  for (const script of scripts) {
    applyScript(database, script);
  }
}

function applyScript(database: DatabaseSync, script: FlywayScript) {
  const sql = fileSystem.readFileSync(script.filePath, SCRIPT_ENCODING);
  const needsTransaction = !FOREIGN_KEYS_PRAGMA.test(sql);

  try {
    applySql({ database, sql, needsTransaction });
  } catch (error) {
    throw new FlywayScriptError(script.name, error);
  }
}

function applySql(input: { database: DatabaseSync; sql: string; needsTransaction: boolean }) {
  const { database, sql, needsTransaction } = input;

  if (!needsTransaction) {
    database.exec(sql);
    return;
  }

  database.exec("BEGIN");

  try {
    database.exec(sql);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export type { FlywayScript };
export { applyFlywayScripts, FlywayScriptError, listFlywayScripts };
