// Vitest global setup for the route tests: builds the open data in memory once per run and
// hands the D1 dump statements to the Workers runtime, which has no file system to read them from.

import type { TestProject } from "vitest/node";
import { createD1Dump } from "./d1.dump.ts";
import { createOpenDatabase } from "./open-data.create.ts";
import { FLYWAY_SQL_DIRECTORY } from "./open-data.paths.ts";

function provideOpenData(project: TestProject) {
  const database = createOpenDatabase({ sqlDirectory: FLYWAY_SQL_DIRECTORY, location: ":memory:" });
  const { statements } = createD1Dump(database);
  database.close();

  project.provide("openDataStatements", statements);
}

export default provideOpenData;
