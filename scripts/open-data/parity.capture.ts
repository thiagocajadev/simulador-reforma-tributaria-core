// Captures the fingerprint of the database Flyway built, once, on the developer machine.
// Usage: node scripts/open-data/parity.capture.ts
// Needs upstream/calculadora-rtc-regime-regular/calculadora/db/calculadora-pro.db (docs/upstream.md, step 1).

import fileSystem from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fingerprintDatabase } from "./database.fingerprint.ts";
import { FLYWAY_DATABASE_PATH, PARITY_FIXTURE_PATH } from "./open-data.paths.ts";

const JSON_INDENT = 2;

function start() {
  captureParity();
}

function captureParity() {
  const isDatabasePresent = fileSystem.existsSync(FLYWAY_DATABASE_PATH);

  if (!isDatabasePresent) {
    throw new Error(
      `Flyway database not found: ${FLYWAY_DATABASE_PATH}. Build it first (docs/upstream.md, step 1).`,
    );
  }

  const database = new DatabaseSync(FLYWAY_DATABASE_PATH, { readOnly: true });
  const fingerprint = fingerprintDatabase(database);
  database.close();

  fileSystem.mkdirSync(path.dirname(PARITY_FIXTURE_PATH), { recursive: true });
  fileSystem.writeFileSync(
    PARITY_FIXTURE_PATH,
    `${JSON.stringify(fingerprint, null, JSON_INDENT)}\n`,
  );
  console.log(
    `Captured ${Object.keys(fingerprint.tables).length} tables to ${PARITY_FIXTURE_PATH}`,
  );
}

start();
