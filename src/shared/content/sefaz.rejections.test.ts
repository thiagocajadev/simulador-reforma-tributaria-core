import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEFAZ_REJECTION_CAUSES } from "./sefaz.rejections.ts";

const NFE_DOC = path.resolve(import.meta.dirname, "../../../docs/nfe.md");
const TABLE_CODES = /^\| (\d{3,4}(?:, \d{3,4})*) \|/;
// why: the 2026 note's date rejections are named in the doc's prose, not in its table.
const PAST_DATE_CODES = ["228", "505"];

function readDocumentedCodes() {
  const lines = readFileSync(NFE_DOC, "utf8").split("\n");
  const tableCodes = lines.flatMap((line) => {
    const match = TABLE_CODES.exec(line);
    const codes = match?.[1] ? match[1].split(",").map((code) => code.trim()) : [];
    return codes;
  });
  const documented = [...tableCodes, ...PAST_DATE_CODES];
  return documented;
}

describe("SEFAZ_REJECTION_CAUSES", () => {
  it("lists every rejection docs/nfe.md records, each once", () => {
    const listed = SEFAZ_REJECTION_CAUSES.flatMap((cause) =>
      cause.rejections.map((rejection) => rejection.code),
    );

    const expected = readDocumentedCodes().sort();
    const actual = [...listed].sort();

    expect(actual).toStrictEqual(expected);
  });
});
