import { describe, expect, it } from "vitest";
import { composeRate } from "./rates.compose.ts";

describe("composeRate", () => {
  it("returns the reference rate when no standard rate exists", () => {
    const components = { referenceRate: 0.9, standardRate: null, applicationMethod: null };

    const expected = { rate: "0.9", source: "reference" };
    const actual = composeRate(components);

    expect(actual).toStrictEqual(expected);
  });

  it("adds without binary floating point error", () => {
    const components = {
      referenceRate: 0.1,
      standardRate: 0.2,
      applicationMethod: "ACRESCIMO" as const,
    };

    const expected = { rate: "0.3", source: "standard" };
    const actual = composeRate(components);

    expect(actual).toStrictEqual(expected);
  });

  it("replaces and subtracts as the upstream application methods do", () => {
    const replaced = {
      referenceRate: 17.7,
      standardRate: 19.5,
      applicationMethod: "SUBSTITUICAO" as const,
    };
    const decreased = {
      referenceRate: 17.7,
      standardRate: 0.75,
      applicationMethod: "DECRESCIMO" as const,
    };

    const expectedRates = ["19.5", "16.95"];
    const actualRates = [composeRate(replaced).rate, composeRate(decreased).rate];

    expect(actualRates).toStrictEqual(expectedRates);
  });

  it("refuses a standard rate that leaves the applicable rate negative", () => {
    const components = {
      referenceRate: 0.1,
      standardRate: 0.2,
      applicationMethod: "DECRESCIMO" as const,
    };

    const expectedMessage = /negative/;
    const actual = () => composeRate(components);

    expect(actual).toThrow(expectedMessage);
  });

  it("refuses a standard rate without an application method", () => {
    const components = { referenceRate: 0.1, standardRate: 0.2, applicationMethod: null };

    const expectedMessage = /application method/;
    const actual = () => composeRate(components);

    expect(actual).toThrow(expectedMessage);
  });
});
