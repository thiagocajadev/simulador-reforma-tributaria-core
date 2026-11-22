// Every path the open data ETL reads or writes, resolved from the repository root.

import path from "node:path";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..", "..");
const UPSTREAM_ROOT = path.join(REPOSITORY_ROOT, "upstream", "calculadora-rtc-regime-regular");
const OUTPUT_DIRECTORY = path.join(REPOSITORY_ROOT, ".data");

const FLYWAY_SQL_DIRECTORY = path.join(UPSTREAM_ROOT, "flyway", "sql");
const FLYWAY_DATABASE_PATH = path.join(UPSTREAM_ROOT, "calculadora", "db", "calculadora-pro.db");
const PARITY_FIXTURE_PATH = path.join(
  REPOSITORY_ROOT,
  "fixtures",
  "open-data",
  "flyway-parity.json",
);
const SQLITE_OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "open-data.sqlite");
const DUMP_OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "open-data.sql");
const MANIFEST_OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "open-data.manifest.json");

export {
  DUMP_OUTPUT_PATH,
  FLYWAY_DATABASE_PATH,
  FLYWAY_SQL_DIRECTORY,
  MANIFEST_OUTPUT_PATH,
  OUTPUT_DIRECTORY,
  PARITY_FIXTURE_PATH,
  SQLITE_OUTPUT_PATH,
  UPSTREAM_ROOT,
};
