import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatStatusDate, REFORM_STATUS_DATE } from "./reform.status.ts";

const SOURCE_DIRECTORY = path.resolve(import.meta.dirname, "../..");
const BRAZILIAN_DATE = /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/;
// why: a source's publisher may carry the day the news came out; that is a fact of the source.
const DATED_REGISTRY = path.join("shared", "content", "official.sources.ts");

function listCopyFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listCopyFiles(entryPath);
    }

    const isCopy = /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.");
    return isCopy ? [entryPath] : [];
  });
  return files;
}

describe("REFORM_STATUS", () => {
  it("is the only place the site writes a pending fact's date", () => {
    const copyFiles = listCopyFiles(SOURCE_DIRECTORY).filter(
      (file) => !file.endsWith(DATED_REGISTRY),
    );

    const expectedDated: string[] = [];
    const actualDated = copyFiles
      .filter((file) => BRAZILIAN_DATE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SOURCE_DIRECTORY, file));

    expect(actualDated).toStrictEqual(expectedDated);
  });

  it("writes its dates the Brazilian way", () => {
    const expected = ["22/11/2026", "02/02/2027"];
    const actual = [REFORM_STATUS_DATE, formatStatusDate("2027-02-02")];

    expect(actual).toStrictEqual(expected);
  });
});
