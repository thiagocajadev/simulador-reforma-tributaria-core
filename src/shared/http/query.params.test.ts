import { describe, expect, it } from "vitest";
import { deriveBrasiliaDate } from "@/shared/format/brasilia.date.ts";
import {
  combineFields,
  parseLimit,
  parseMunicipalityCode,
  parseOptionalUf,
  parseReferenceDate,
  parseRequiredCode,
  parseSearchText,
  parseUf,
} from "./query.params.ts";

describe("parseReferenceDate", () => {
  it("defaults to today in Brasília, which is still yesterday in UTC-3 just after UTC midnight", () => {
    const utcJustAfterMidnight = new Date("2026-11-21T01:30:00Z");

    const expected = { isValid: true, value: "2026-11-20" };
    const actual = parseReferenceDate(undefined, utcJustAfterMidnight);

    expect(actual).toStrictEqual(expected);
  });

  it("rejects a date that does not exist on the calendar", () => {
    const now = new Date("2026-11-20T12:00:00Z");

    const expectedField = "date";
    const actual = parseReferenceDate("2026-02-30", now);
    const actualField = actual.isValid ? null : actual.issue.field;

    expect(actualField).toBe(expectedField);
  });

  it("accepts a leap day", () => {
    const now = new Date("2026-11-20T12:00:00Z");

    const expected = { isValid: true, value: "2028-02-29" };
    const actual = parseReferenceDate("2028-02-29", now);

    expect(actual).toStrictEqual(expected);
  });
});

describe("deriveBrasiliaDate", () => {
  it("keeps the same day at Brasília noon", () => {
    const utcAfternoon = new Date("2026-11-20T15:00:00Z");

    const expected = "2026-11-20";
    const actual = deriveBrasiliaDate(utcAfternoon);

    expect(actual).toBe(expected);
  });
});

describe("parseSearchText", () => {
  it("trims the text before checking its length", () => {
    const paddedSingleLetter = "  a  ";

    const expectedMessage = /got 1/;
    const actual = parseSearchText(paddedSingleLetter);
    const actualMessage = actual.isValid ? "" : actual.issue.message;

    expect(actualMessage).toMatch(expectedMessage);
  });
});

describe("parseLimit", () => {
  it("defaults to 20 and rejects anything outside 1 to 20", () => {
    const expectedDefault = { isValid: true, value: 20 };
    const expectedValidity = [false, false, false, true];
    const actualDefault = parseLimit(undefined);
    const actualValidity = ["0", "21", "2.5", "1"].map((raw) => parseLimit(raw).isValid);

    expect(actualDefault).toStrictEqual(expectedDefault);
    expect(actualValidity).toStrictEqual(expectedValidity);
  });
});

describe("parseUf and parseMunicipalityCode", () => {
  it("uppercases the state code and requires the 7-digit IBGE code", () => {
    const expectedUf = { isValid: true, value: "RS" };
    const expectedCode = { isValid: true, value: 4314902 };
    const expectedShortCodeValidity = false;
    const actualUf = parseUf(" rs ");
    const actualCode = parseMunicipalityCode("4314902");
    const actualShortCodeValidity = parseMunicipalityCode("431490").isValid;

    expect(actualUf).toStrictEqual(expectedUf);
    expect(actualCode).toStrictEqual(expectedCode);
    expect(actualShortCodeValidity).toBe(expectedShortCodeValidity);
  });
});

describe("parseOptionalUf", () => {
  it("reads a blank or missing UF as a nationwide search, and normalizes a given one", () => {
    const inputs = [undefined, "", "  ", " rs "];

    const expected = [
      { isValid: true, value: null },
      { isValid: true, value: null },
      { isValid: true, value: null },
      { isValid: true, value: "RS" },
    ];
    const actual = inputs.map(parseOptionalUf);

    expect(actual).toStrictEqual(expected);
  });

  it("still rejects a UF that is not two letters", () => {
    const expectedField = "uf";
    const actual = parseOptionalUf("R1");
    const actualField = actual.isValid ? null : actual.issue.field;

    expect(actualField).toBe(expectedField);
  });
});

describe("parseRequiredCode", () => {
  it("accepts a trimmed code that matches, and rejects a missing or malformed one", () => {
    const pattern = /^\d{6}$/;

    const expected = [
      { isValid: true, value: "200028" },
      { isValid: false, issue: { field: "cClassTrib", message: 'Must match ^\\d{6}$, got "".' } },
      {
        isValid: false,
        issue: { field: "cClassTrib", message: 'Must match ^\\d{6}$, got "2000".' },
      },
    ];
    const actual = [" 200028 ", undefined, "2000"].map((raw) =>
      parseRequiredCode("cClassTrib", raw, pattern),
    );

    expect(actual).toStrictEqual(expected);
  });
});

describe("combineFields", () => {
  it("reports every invalid field at once", () => {
    const fields = { uf: parseUf("RIO"), limit: parseLimit("99"), text: parseSearchText("arroz") };

    const expectedFields = ["uf", "limit"];
    const actual = combineFields(fields);
    const actualFields = actual.isValid ? [] : actual.issues.map((issue) => issue.field);

    expect(actualFields).toStrictEqual(expectedFields);
  });

  it("returns the parsed values when every field is valid", () => {
    const fields = { uf: parseUf("sp"), limit: parseLimit("5") };

    const expected = { isValid: true, values: { uf: "SP", limit: 5 } };
    const actual = combineFields(fields);

    expect(actual).toStrictEqual(expected);
  });
});
