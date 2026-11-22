// Builds the open data database: the Flyway scripts, a foreign key check, then the search index.

import { DatabaseSync } from "node:sqlite";
import { applyFlywayScripts, listFlywayScripts } from "./flyway.apply.ts";
import { buildSearchIndex } from "./search.index.ts";

interface OpenDatabaseInput {
  sqlDirectory: string;
  location: string;
}

const FOREIGN_KEY_CHECK_SQL = "SELECT * FROM pragma_foreign_key_check;";

function createOpenDatabase(input: OpenDatabaseInput) {
  const { sqlDirectory, location } = input;
  const scripts = listFlywayScripts(sqlDirectory);
  const database = new DatabaseSync(location, { enableForeignKeyConstraints: true });

  applyFlywayScripts({ database, scripts });
  assertForeignKeys(database);
  buildSearchIndex(database);

  return database;
}

// why: the D1 dump defers foreign keys, so one dangling reference would fail the whole import.
function assertForeignKeys(database: DatabaseSync) {
  const violations = database.prepare(FOREIGN_KEY_CHECK_SQL).all();

  if (violations.length > 0) {
    throw new Error(
      `${violations.length} foreign key violations after Flyway, first: ${JSON.stringify(violations[0])}`,
    );
  }
}

export { createOpenDatabase };
