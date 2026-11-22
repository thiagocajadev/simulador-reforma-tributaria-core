import { describe, expect, it } from "vitest";
import {
  formatDocumentMoney,
  formatDocumentRate,
  subtractDocumentMoney,
  sumDocumentMoney,
} from "./document.values.ts";

describe("formatDocumentMoney", () => {
  it("writes exactly two places, rounding half to even", () => {
    const expected = ["1200.00", "0.48", "10.12", "7.00"];
    const actual = ["1200", "0.48", "10.125", "7"].map(formatDocumentMoney);

    expect(actual).toStrictEqual(expected);
  });
});

describe("formatDocumentRate", () => {
  it("writes two to four places", () => {
    const expected = ["0.90", "8.8123", "60.00", "0.05"];
    const actual = ["0.9", "8.8123", "60", "0.0500"].map(formatDocumentRate);

    expect(actual).toStrictEqual(expected);
  });
});

describe("sumDocumentMoney", () => {
  it("adds every amount, and an empty list sums to zero", () => {
    const expected = ["1103.50", "0.00"];
    const actual = [sumDocumentMoney(["1000.00", "88.00", "15.5"]), sumDocumentMoney([])];

    expect(actual).toStrictEqual(expected);
  });
});

describe("subtractDocumentMoney", () => {
  it("keeps two places in the difference", () => {
    const expected = "400.00";
    const actual = subtractDocumentMoney("1000", "600.00");

    expect(actual).toBe(expected);
  });
});
