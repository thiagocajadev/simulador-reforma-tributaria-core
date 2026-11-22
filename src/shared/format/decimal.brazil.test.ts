import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, parseTypedDecimal } from "./decimal.brazil.ts";

describe("formatMoney", () => {
  it("groups thousands with dots and keeps two places after a comma", () => {
    const expected = ["R$ 1.200,00", "R$ 0,48", "R$ 1.234.567,80"];
    const actual = ["1200.00", "0.48", "1234567.8"].map(formatMoney);

    expect(actual).toStrictEqual(expected);
  });
});

describe("formatPercent", () => {
  it("shows at least two places and at most four, without trailing zeros past two", () => {
    const expected = ["0,90%", "0,04%", "8,8123%", "60,00%"];
    const actual = ["0.9", "0.0400", "8.8123", "60"].map(formatPercent);

    expect(actual).toStrictEqual(expected);
  });
});

describe("parseTypedDecimal", () => {
  it("reads the Brazilian notation people type into a plain decimal", () => {
    const expected = ["1200.50", "1200.5", "1200", "1234567.89"];
    const actual = ["1.200,50", "1200,5", " 1200 ", "1.234.567,89"].map((typed) =>
      parseTypedDecimal(typed, 2),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("returns null for text it cannot read or with too many places", () => {
    const expected = [null, null, null, null];
    const actual = ["", "12a", "1.20,00", "10,123"].map((typed) => parseTypedDecimal(typed, 2));

    expect(actual).toStrictEqual(expected);
  });
});
