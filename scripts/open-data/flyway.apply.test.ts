import fileSystem from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyFlywayScripts, FlywayScriptError, listFlywayScripts } from "./flyway.apply.ts";
import { FLYWAY_SQL_DIRECTORY } from "./open-data.paths.ts";

const temporaryDirectories: string[] = [];

function writeFlywayDirectory(files: Record<string, string>) {
  const directory = fileSystem.mkdtempSync(path.join(os.tmpdir(), "flyway-"));
  temporaryDirectories.push(directory);

  for (const [fileName, sql] of Object.entries(files)) {
    fileSystem.writeFileSync(path.join(directory, fileName), sql);
  }

  return directory;
}

function removeTemporaryDirectories() {
  for (const directory of temporaryDirectories.splice(0)) {
    fileSystem.rmSync(directory, { recursive: true });
  }
}

function captureError(action: () => void) {
  try {
    action();
  } catch (error) {
    const caught = error instanceof Error ? error : null;
    return caught;
  }

  return null;
}

describe("listFlywayScripts", () => {
  afterEach(removeTemporaryDirectories);

  it("orders the upstream scripts as Flyway runs them", () => {
    const expectedFirst = ["beforeMigrate.sql", "B0001__sistema_tributario_completo.sql"];
    const expectedLast = "afterMigrate.sql";
    const actual = listFlywayScripts(FLYWAY_SQL_DIRECTORY).map((script) => script.name);
    const actualFirst = actual.slice(0, 2);
    const actualLast = actual.at(-1);
    const actualVersions = actual.slice(2, -1).map((name) => Number(name.slice(1, 5)));
    const expectedVersions = actualVersions.toSorted((left, right) => left - right);

    expect(actualFirst).toStrictEqual(expectedFirst);
    expect(actualLast).toBe(expectedLast);
    expect(actualVersions).toStrictEqual(expectedVersions);
  });

  it("sorts versions by number, not by name", () => {
    const directory = writeFlywayDirectory({
      "beforeMigrate.sql": "",
      "afterMigrate.sql": "",
      "V10__later.sql": "",
      "V9__earlier.sql": "",
      "B1__baseline.sql": "",
    });

    const expected = [
      "beforeMigrate.sql",
      "B1__baseline.sql",
      "V9__earlier.sql",
      "V10__later.sql",
      "afterMigrate.sql",
    ];
    const actual = listFlywayScripts(directory).map((script) => script.name);

    expect(actual).toStrictEqual(expected);
  });

  it("tells how to fetch the submodule when the Flyway directory is missing", () => {
    const missingDirectory = path.join(os.tmpdir(), "missing-flyway-directory");

    const expectedMessage = /git submodule update --init/;
    const actual = () => listFlywayScripts(missingDirectory);

    expect(actual).toThrow(expectedMessage);
  });
});

describe("applyFlywayScripts", () => {
  afterEach(removeTemporaryDirectories);

  it("names the failing script and rolls its statements back", () => {
    const directory = writeFlywayDirectory({
      "beforeMigrate.sql": "CREATE TABLE UF (UF_CD INTEGER PRIMARY KEY);",
      "B0001__baseline.sql": "INSERT INTO UF VALUES (43); INSERT INTO MISSING_TABLE VALUES (1);",
      "afterMigrate.sql": "",
    });
    const database = new DatabaseSync(":memory:");
    const scripts = listFlywayScripts(directory);

    const expectedMessage = /B0001__baseline\.sql failed: no such table: MISSING_TABLE/;
    const expectedRowCount = 0;
    const actual = captureError(() => applyFlywayScripts({ database, scripts }));
    const actualRowCount = Number(
      database.prepare("SELECT count(*) AS total FROM UF").get()?.total,
    );

    expect(actual).toBeInstanceOf(FlywayScriptError);
    expect(actual?.message).toMatch(expectedMessage);
    expect(actualRowCount).toBe(expectedRowCount);
  });
});
