import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./search.match.ts";

describe("parseSearchQuery", () => {
  it("reads digits with dots as a code prefix and bounds it by the next code", () => {
    const typedCode = "0713.33";

    const expected = {
      isValid: true,
      value: { kind: "code", codePrefix: "071333", codeUpperBound: "071334" },
    };
    const actual = parseSearchQuery(typedCode);

    expect(actual).toStrictEqual(expected);
  });

  it("bounds a prefix ending in 9 by the character after 9", () => {
    const typedCode = "8419";

    const expectedUpperBound = "841:";
    const actual = parseSearchQuery(typedCode);
    const actualUpperBound =
      actual.isValid && actual.value.kind === "code" ? actual.value.codeUpperBound : "";

    expect(actualUpperBound).toBe(expectedUpperBound);
  });

  it("quotes every word as a prefix, so FTS5 operators stay plain text", () => {
    const typedText = 'feijão OR "preto" NEAR(';

    const expectedExpression = '"feijão"* "OR"* "preto"* "NEAR"*';
    const actual = parseSearchQuery(typedText);
    const actualExpression =
      actual.isValid && actual.value.kind === "text" ? actual.value.matchExpression : "";

    expect(actualExpression).toBe(expectedExpression);
  });

  it("rejects text with no letters or digits", () => {
    const typedSymbols = "?!";

    const expectedMessage = "Must contain letters or digits.";
    const actual = parseSearchQuery(typedSymbols);
    const actualMessage = actual.isValid ? "" : actual.issue.message;

    expect(actualMessage).toBe(expectedMessage);
  });

  it("rejects separators alone instead of reading them as an empty code", () => {
    const typedSeparators = "..";

    const expectedValidity = false;
    const actual = parseSearchQuery(typedSeparators);
    const actualValidity = actual.isValid;

    expect(actualValidity).toBe(expectedValidity);
  });
});
