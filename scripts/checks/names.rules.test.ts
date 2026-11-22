import { describe, expect, it } from "vitest";
import { findNameViolations, isBannedFileName } from "./names.rules.ts";

describe("findNameViolations", () => {
  it("flags banned verbs, nouns and abbreviations in declarations, with their line", () => {
    const sourceText = [
      "function handleRequest() {}",
      "const item = rows[0];",
      "const ctx = createContext();",
      "const runway = 3;",
    ].join("\n");

    const expected = [
      { line: 1, name: "handleRequest", rule: "banned verb (handle, do, run, execute, perform)" },
      { line: 2, name: "item", rule: "banned generic noun" },
      { line: 3, name: "ctx", rule: "banned abbreviation" },
    ];
    const actual = findNameViolations(sourceText);

    expect(actual).toStrictEqual(expected);
  });

  it("ignores a framework's own property names, which this repository does not declare", () => {
    const sourceText = "const parameters = context.req.query();\nconst body = response.data;";

    const expected: unknown[] = [];
    const actual = findNameViolations(sourceText);

    expect(actual).toStrictEqual(expected);
  });
});

describe("isBannedFileName", () => {
  it("rejects generic module names and accepts domain.operation names", () => {
    const expected = [true, true, false];
    const actual = ["string.utils.ts", "helpers.ts", "ncm.repository.ts"].map(isBannedFileName);

    expect(actual).toStrictEqual(expected);
  });
});
