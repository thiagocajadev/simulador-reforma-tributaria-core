import { describe, expect, it } from "vitest";
import {
  addDecimals,
  compareDecimals,
  type Decimal,
  divideDecimals,
  formatDecimal,
  multiplyDecimals,
  parseDecimal,
  roundDecimal,
  shiftDecimalPoint,
  subtractDecimals,
} from "./decimal.ts";

const PLAIN = { minPlaces: 0, maxPlaces: 40 };
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const RATE = { minPlaces: 2, maxPlaces: 4 };

function formatPlain(value: Decimal) {
  const text = formatDecimal(value, PLAIN);
  return text;
}

describe("parseDecimal", () => {
  it("reads plain decimals with their scale", () => {
    const texts = ["1200.00", "-0.025", "8.8123", "1000000"];

    const expected = ["1200", "-0.025", "8.8123", "1000000"];
    const actual = texts.map((text) => formatPlain(parseDecimal(text)));

    expect(actual).toStrictEqual(expected);
  });

  it("refuses exponents, spaces and empty fractions", () => {
    const texts = ["1e3", " 1.0", "1.", ".5", "", "1,5"];

    const expectedRefusals = texts.length;
    const actualRefusals = texts.filter(isRefused).length;

    expect(actualRefusals).toBe(expectedRefusals);
  });
});

function isRefused(text: string) {
  try {
    parseDecimal(text);
  } catch {
    return true;
  }

  return false;
}

describe("exact arithmetic", () => {
  it("adds and subtracts without binary floating point error", () => {
    const tenth = parseDecimal("0.1");
    const fifth = parseDecimal("0.2");

    const expected = ["0.3", "-0.1"];
    const actual = [
      formatPlain(addDecimals(tenth, fifth)),
      formatPlain(subtractDecimals(tenth, fifth)),
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("multiplies exactly, keeping every digit", () => {
    const base = parseDecimal("1000000.00");
    const effectiveRate = parseDecimal("0.035249");

    const expected = "35249";
    const actual = formatPlain(multiplyDecimals(base, effectiveRate));

    expect(actual).toBe(expected);
  });

  it("compares values of different scales", () => {
    const pairs = [
      ["1.50", "1.5"],
      ["-0.01", "0"],
      ["2", "1.999"],
    ] as const;

    const expected = [0, -1, 1];
    const actual = pairs.map(([left, right]) =>
      compareDecimals(parseDecimal(left), parseDecimal(right)),
    );

    expect(actual).toStrictEqual(expected);
  });
});

describe("divideDecimals", () => {
  it("keeps 34 significant digits, as Java's DECIMAL128 context", () => {
    const one = parseDecimal("1");
    const three = parseDecimal("3");

    const expected = `0.${"3".repeat(34)}`;
    const actual = formatPlain(divideDecimals(one, three));

    expect(actual).toBe(expected);
  });

  it("rounds the 34th significant digit half even", () => {
    const two = parseDecimal("2");
    const three = parseDecimal("3");
    const minusTwo = parseDecimal("-2");

    const expected = [`0.${"6".repeat(33)}7`, `-0.${"6".repeat(33)}7`];
    const actual = [
      formatPlain(divideDecimals(two, three)),
      formatPlain(divideDecimals(minusTwo, three)),
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("returns exact quotients unchanged", () => {
    const dividend = parseDecimal("1.25");
    const divisor = parseDecimal("100");

    const expected = "0.0125";
    const actual = formatPlain(divideDecimals(dividend, divisor));

    expect(actual).toBe(expected);
  });

  it("refuses division by zero", () => {
    const one = parseDecimal("1");
    const zero = parseDecimal("0.00");

    const expectedMessage = "Division by zero";
    const actualDivision = () => divideDecimals(one, zero);

    expect(actualDivision).toThrow(expectedMessage);
  });
});

describe("roundDecimal", () => {
  it("rounds exact halves to the even neighbour", () => {
    const halves = ["0.005", "0.015", "0.025", "0.035", "-0.025", "2.5"];
    const places = [2, 2, 2, 2, 2, 0];

    const expected = ["0", "0.02", "0.02", "0.04", "-0.02", "2"];
    const actual = halves.map((half, position) =>
      formatPlain(roundDecimal(parseDecimal(half), places[position] ?? 0)),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("rounds above and below half away from and toward zero", () => {
    const values = ["0.0251", "0.0249", "-0.0251"];

    const expected = ["0.03", "0.02", "-0.03"];
    const actual = values.map((value) => formatPlain(roundDecimal(parseDecimal(value), 2)));

    expect(actual).toStrictEqual(expected);
  });

  it("pads values that already fit", () => {
    const value = parseDecimal("1.5");

    const expected = { unscaled: 15000n, scale: 4 };
    const actual = roundDecimal(value, 4);

    expect(actual).toStrictEqual(expected);
  });
});

describe("shiftDecimalPoint", () => {
  it("moves between percentage points and fractions exactly", () => {
    const percentage = parseDecimal("8.8123");
    const fraction = parseDecimal("0.006132");

    const expected = ["0.088123", "0.6132"];
    const actual = [
      formatPlain(shiftDecimalPoint(percentage, -2)),
      formatPlain(shiftDecimalPoint(fraction, 2)),
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("keeps the scale non-negative when shifting an integer right", () => {
    const value = parseDecimal("12");

    const expected = { unscaled: 1200n, scale: 0 };
    const actual = shiftDecimalPoint(value, 2);

    expect(actual).toStrictEqual(expected);
  });
});

describe("formatDecimal", () => {
  it("prints money with exactly two places", () => {
    const values = ["200", "0.025", "35249.0000"];

    const expected = ["200.00", "0.02", "35249.00"];
    const actual = values.map((value) => formatDecimal(parseDecimal(value), MONEY));

    expect(actual).toStrictEqual(expected);
  });

  it("prints rates with two to four places, as the upstream serializer", () => {
    const values = ["0.2080", "0.2000", "60.0000", "1.68393793783894", "3.52492"];

    const expected = ["0.208", "0.20", "60.00", "1.6839", "3.5249"];
    const actual = values.map((value) => formatDecimal(parseDecimal(value), RATE));

    expect(actual).toStrictEqual(expected);
  });
});
