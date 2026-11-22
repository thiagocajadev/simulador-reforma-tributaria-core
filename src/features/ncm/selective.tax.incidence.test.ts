import { describe, expect, it } from "vitest";
import type { SelectiveTaxWindow } from "./ncm.dto.ts";
import { deriveSelectiveTaxIncidence, readSelectiveTaxWindows } from "./selective.tax.incidence.ts";

const CIGARETTE_WINDOWS: SelectiveTaxWindow[] = [
  { rate: "adValorem", from: "2027-01-01", to: "2028-12-31", exceptions: [] },
  { rate: "adValorem", from: "2029-01-01", to: "2029-12-31", exceptions: [] },
  {
    rate: "adRem",
    from: "2027-01-01",
    to: "2033-12-31",
    unit: "VN",
    unitDescription: "Vintena de cigarro",
    exceptions: [],
  },
];

const NO_OFFICIAL_RATES = { adValorem: null, adRem: null };

describe("deriveSelectiveTaxIncidence", () => {
  it("finds both rates, and the ad rem unit, on a date inside their windows", () => {
    const expected = {
      hasAdValorem: true,
      adRemUnit: { code: "VN", description: "Vintena de cigarro" },
      officialRates: NO_OFFICIAL_RATES,
    };
    const actual = deriveSelectiveTaxIncidence(CIGARETTE_WINDOWS, "2029-12-31");

    expect(actual).toStrictEqual(expected);
  });

  it("keeps only the rate still valid, and nothing before the first window", () => {
    const expectedAfterAdValorem = {
      hasAdValorem: false,
      adRemUnit: { code: "VN", description: "Vintena de cigarro" },
      officialRates: NO_OFFICIAL_RATES,
    };
    const actualAfterAdValorem = deriveSelectiveTaxIncidence(CIGARETTE_WINDOWS, "2030-06-01");
    const actualBefore = deriveSelectiveTaxIncidence(CIGARETTE_WINDOWS, "2026-12-31");

    expect(actualAfterAdValorem).toStrictEqual(expectedAfterAdValorem);
    expect(actualBefore).toBeNull();
  });

  it("drops a window an exception covers on the date, and a code without windows", () => {
    const excepted: SelectiveTaxWindow[] = [
      {
        rate: "adValorem",
        from: "2027-01-01",
        to: null,
        exceptions: [{ from: "2027-01-01", to: "2033-12-31" }],
      },
    ];

    const expectedAfterException = {
      hasAdValorem: true,
      adRemUnit: null,
      officialRates: NO_OFFICIAL_RATES,
    };
    const actualDuringException = deriveSelectiveTaxIncidence(excepted, "2030-01-01");
    const actualAfterException = deriveSelectiveTaxIncidence(excepted, "2034-01-01");
    const actualWithoutWindows = deriveSelectiveTaxIncidence([], "2030-01-01");

    expect(actualDuringException).toBeNull();
    expect(actualAfterException).toStrictEqual(expectedAfterException);
    expect(actualWithoutWindows).toBeNull();
  });

  it("carries the official rate of the window valid on the date, once the open data holds one", () => {
    const priced: SelectiveTaxWindow[] = [
      { rate: "adValorem", value: "13.5", from: "2027-01-01", to: "2027-12-31", exceptions: [] },
      { rate: "adValorem", value: "15", from: "2028-01-01", to: null, exceptions: [] },
      {
        rate: "adRem",
        value: null,
        from: "2027-01-01",
        to: null,
        unit: "VN",
        unitDescription: "Vintena de cigarro",
        exceptions: [],
      },
    ];

    const expected = { adValorem: "15", adRem: null };
    const actual = deriveSelectiveTaxIncidence(priced, "2028-06-01")?.officialRates;

    expect(actual).toStrictEqual(expected);
  });

  it("takes the rate of the most specific NCM prefix, as the calculation does", () => {
    const overlapping: SelectiveTaxWindow[] = [
      {
        rate: "adValorem",
        value: "10",
        prefixLength: 4,
        from: "2027-01-01",
        to: null,
        exceptions: [],
      },
      {
        rate: "adValorem",
        value: "25",
        prefixLength: 8,
        from: "2027-01-01",
        to: null,
        exceptions: [],
      },
      {
        rate: "adValorem",
        value: "12",
        prefixLength: 6,
        from: "2027-01-01",
        to: null,
        exceptions: [],
      },
    ];

    const expected = "25";
    const actual = deriveSelectiveTaxIncidence(overlapping, "2027-06-01")?.officialRates.adValorem;

    expect(actual).toBe(expected);
  });
});

describe("readSelectiveTaxWindows", () => {
  it("reads the column's JSON, and no windows from a NULL", () => {
    const expected = CIGARETTE_WINDOWS;
    const actual = readSelectiveTaxWindows(JSON.stringify(CIGARETTE_WINDOWS));
    const actualFromNull = readSelectiveTaxWindows(null);

    expect(actual).toStrictEqual(expected);
    expect(actualFromNull).toStrictEqual([]);
  });
});
