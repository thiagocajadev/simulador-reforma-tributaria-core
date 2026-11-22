import { describe, expect, it } from "vitest";
import type { CalculationResult, Operation } from "@/features/calculations/calculation.dto.ts";
import type { SimplesActivity } from "@/features/simples-activities/simples-activities.dto.ts";
import {
  checkSimplesDraft,
  createSimplesDraft,
  fillSelectiveTaxAmounts,
  isSimplesAvailable,
  needsSelectiveTaxAmounts,
  type SimplesDraft,
} from "./simples.draft.ts";

const OPERATION: Operation = {
  taxEventDate: "2027-03-10T12:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 55,
  items: [
    {
      itemNumber: 1,
      ncmCode: "22030000",
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "1000.00",
      nominalRates: { cbsRate: "8.8", ibsUfRate: "0.05", ibsMunRate: "0.05" },
    },
  ],
};

function buildActivity(activityCode: string, facts: Partial<SimplesActivity>) {
  const activity: SimplesActivity = {
    activityCode,
    description: `Atividade ${activityCode}`,
    annex: facts.annexWithoutFatorR ?? null,
    isNonTaxable: false,
    annexWithoutFatorR: null,
    annexWithFatorR: null,
    hasIssInSimples: false,
    allowsMunicipalBenefit: false,
    ...facts,
  };
  return activity;
}

const RESALE = buildActivity("01", { annexWithoutFatorR: "I" });
const CONSULTING = buildActivity("07", { annexWithoutFatorR: "III", hasIssInSimples: true });
const FATOR_R_SERVICE = buildActivity("09", {
  annexWithoutFatorR: "V",
  annexWithFatorR: "III",
  hasIssInSimples: true,
});
const ANNEX_IV_SERVICE = buildActivity("14", { annexWithoutFatorR: "IV", hasIssInSimples: true });
const NON_TAXABLE = buildActivity("90", { isNonTaxable: true });

describe("isSimplesAvailable", () => {
  it("opens from 2027 on the NF-e, the NFC-e and the NFS-e", () => {
    const cases: [string, number][] = [
      ["2027-01-01", 55],
      ["2027-06-10", 65],
      ["2026-12-31", 55],
      ["2027-06-10", 91],
    ];

    const expected = [true, true, false, true];
    const actual = cases.map(([date, documentType]) => isSimplesAvailable(date, documentType));

    expect(actual).toStrictEqual(expected);
  });
});

describe("checkSimplesDraft", () => {
  it("builds one Simples item per operation item, with the typed rates", () => {
    const draft = { ...createSimplesDraft(), cbsRate: "2,3591234567", ibsRate: "0,026" };

    const expected = {
      kind: "ready",
      operation: {
        taxEventDate: "2027-03-10",
        documentType: 55,
        crt: 1,
        items: [
          {
            itemNumber: 1,
            activityCode: "01",
            cClassTrib: "000001",
            ncmCode: "22030000",
            nbsCode: undefined,
            baseAmount: "1000.00",
            selectiveTaxAmount: "0.00",
            cbsSimplesRate: "2.3591234567",
            ibsSimplesRate: "0.026",
          },
        ],
      },
    };
    const actual = checkSimplesDraft(draft, OPERATION, RESALE);

    expect(actual).toStrictEqual(expected);
  });

  it("skips the comparison when both rates are blank", () => {
    const draft = createSimplesDraft();

    const expected = { kind: "skipped" };
    const actual = checkSimplesDraft(draft, OPERATION, RESALE);

    expect(actual).toStrictEqual(expected);
  });

  it("asks only for the CBS rate with CRT 2, which has no IBS in the Simples", () => {
    const draft = { ...createSimplesDraft(), crt: "2" as const, cbsRate: "2,5", ibsRate: "" };

    const expectedKind = "ready";
    const expectedIbsRate = undefined;
    const actual = checkSimplesDraft(draft, OPERATION, RESALE);
    const actualKind = actual.kind;
    const actualIbsRate =
      actual.kind === "ready" ? actual.operation.items[0]?.ibsSimplesRate : "not ready";

    expect(actualKind).toBe(expectedKind);
    expect(actualIbsRate).toBe(expectedIbsRate);
  });

  it("flags a missing pair rate, a malformed rate and a missing activity", () => {
    const draft = { ...createSimplesDraft(), activityCode: "", cbsRate: "1234", ibsRate: "" };

    const expected = {
      kind: "invalid",
      fieldErrors: {
        "simples.activityCode": "Escolha a atividade do Simples Nacional.",
        "simples.cbsRate": "Informe um percentual com até 3 dígitos inteiros. Exemplo: 2,3591.",
        "simples.ibsRate":
          "Informe também esta alíquota, ou deixe as duas em branco para não comparar.",
      },
    };
    const actual = checkSimplesDraft(draft, OPERATION, RESALE);

    expect(actual).toStrictEqual(expected);
  });

  it("leaves a 2026 operation out of the comparison", () => {
    const draft = { ...createSimplesDraft(), cbsRate: "2,5", ibsRate: "0,03" };
    const operation2026 = { ...OPERATION, taxEventDate: "2026-12-31T12:00:00-03:00" };

    const expected = { kind: "unavailable" };
    const actual = checkSimplesDraft(draft, operation2026, RESALE);

    expect(actual).toStrictEqual(expected);
  });
});

describe("checkSimplesDraft on the NFS-e", () => {
  const serviceOperation: Operation = {
    ...OPERATION,
    documentType: 91,
    items: [
      {
        itemNumber: 1,
        nbsCode: "114011100",
        cstCode: "000",
        cClassTrib: "000001",
        baseAmount: "10000.00",
      },
    ],
  };

  function draftWith(nfse: Partial<SimplesDraft["nfse"]>, activityCode: string) {
    const base = createSimplesDraft();
    const draft: SimplesDraft = {
      ...base,
      activityCode,
      cbsRate: "2,3874",
      ibsRate: "0,0263",
      nfse: { ...base.nfse, ...nfse },
    };
    return draft;
  }

  it("puts the rates in the activity's annex, with the ISS facts of the service", () => {
    const draft = draftWith({ cbsRateWithoutIss: "2,1012", ibsRateWithoutIss: "0,0231" }, "07");

    const expected = {
      kind: "ready",
      operation: {
        taxEventDate: "2027-03-10",
        documentType: 91,
        simplesOption: 3,
        ibsCbsAssessmentRegime: 1,
        simplesTaxesAssessmentRegime: 1,
        effectiveRates: {
          isFatorRAtLeast28: false,
          isSublimitExceeded: false,
          annexIII: {
            cbsSimplesRate: "2.3874",
            ibsSimplesRate: "0.0263",
            withoutIssRedistribution: { cbsSimplesRate: "2.1012", ibsSimplesRate: "0.0231" },
          },
        },
        items: [
          {
            itemNumber: 1,
            activityCode: "07",
            cClassTrib: "000001",
            nbsCode: "114011100",
            baseAmount: "10000.00",
            issTaxation: 1,
            issWithholding: 1,
            municipalBenefit: undefined,
          },
        ],
      },
    };
    const actual = checkSimplesDraft(draft, serviceOperation, CONSULTING);

    expect(actual).toStrictEqual(expected);
  });

  it("picks annex III or V for activity 09 by the Fator R", () => {
    const annexes = [true, false].map((isFatorRAtLeast28) => {
      const check = checkSimplesDraft(
        draftWith({ isFatorRAtLeast28 }, "09"),
        serviceOperation,
        FATOR_R_SERVICE,
      );
      const rates =
        check.kind === "ready" && "effectiveRates" in check.operation
          ? check.operation.effectiveRates
          : {};
      return Object.keys(rates ?? {}).filter((key) => key.startsWith("annex"));
    });

    const expected = [["annexIII"], ["annexV"]];
    const actual = annexes;

    expect(actual).toStrictEqual(expected);
  });

  it("asks only the CBS rate when the sublimit takes the IBS out, and flags the sublimit", () => {
    const draft = { ...draftWith({ ibsCbsAssessmentRegime: "2" }, "14"), ibsRate: "" };

    const check = checkSimplesDraft(draft, serviceOperation, ANNEX_IV_SERVICE);
    const actual =
      check.kind === "ready" && "effectiveRates" in check.operation
        ? check.operation.effectiveRates
        : null;
    const expected = {
      isFatorRAtLeast28: false,
      isSublimitExceeded: true,
      annexIV: {
        cbsSimplesRate: "2.3874",
        ibsSimplesRate: undefined,
        withoutIssRedistribution: undefined,
      },
    };

    expect(actual).toStrictEqual(expected);
  });

  it("ignores a malformed pair without the ISS redistribution once its fields are hidden", () => {
    const draft = draftWith({ cbsRateWithoutIss: "abc" }, "90");

    const expectedKind = "ready";
    const actualKind = checkSimplesDraft(draft, serviceOperation, NON_TAXABLE).kind;

    expect(actualKind).toBe(expectedKind);
  });

  it("rejects a malformed rate of the pair without the ISS redistribution", () => {
    const draft = draftWith({ cbsRateWithoutIss: "abc", ibsRateWithoutIss: "0,02" }, "07");

    const expected = {
      kind: "invalid",
      fieldErrors: {
        "simples.cbsRateWithoutIss":
          "Informe um percentual com até 3 dígitos inteiros. Exemplo: 2,3591.",
      },
    };
    const actual = checkSimplesDraft(draft, serviceOperation, CONSULTING);

    expect(actual).toStrictEqual(expected);
  });
});

const CIGARS_OPERATION: Operation = {
  ...OPERATION,
  items: [
    {
      ...OPERATION.items[0],
      itemNumber: 1,
      ncmCode: "24021000",
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "1000.00",
      selectiveTax: { cstCode: "000", cClassTrib: "000001", adValoremRate: "25.34" },
    },
    {
      ...OPERATION.items[0],
      itemNumber: 2,
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "500.00",
    },
  ],
};

function buildResult(items: CalculationResult["items"]) {
  const result = { items, totals: {}, dataVersion: "test" } as unknown as CalculationResult;
  return result;
}

describe("needsSelectiveTaxAmounts", () => {
  it("holds a ready NF-e comparison only when an item carries the IS", () => {
    const draft = { ...createSimplesDraft(), cbsRate: "2,3591", ibsRate: "0,026" };
    const withTax = checkSimplesDraft(draft, CIGARS_OPERATION, RESALE);
    const withoutTax = checkSimplesDraft(draft, OPERATION, RESALE);

    const expected = [true, false];
    const actual = [
      needsSelectiveTaxAmounts(withTax, CIGARS_OPERATION),
      needsSelectiveTaxAmounts(withoutTax, OPERATION),
    ];

    expect(actual).toStrictEqual(expected);
  });
});

describe("fillSelectiveTaxAmounts", () => {
  it("carries each item's calculated IS, and 0.00 where the item has none", () => {
    const draft = { ...createSimplesDraft(), cbsRate: "2,3591", ibsRate: "0,026" };
    const draftCheck = checkSimplesDraft(draft, CIGARS_OPERATION, RESALE);
    const result = buildResult([
      { itemNumber: 1, status: "simulated", selectiveTax: { amount: "253.40" } },
      { itemNumber: 2, status: "simulated", selectiveTax: null },
    ] as unknown as CalculationResult["items"]);

    const expected = ["253.40", "0.00"];
    const filled =
      draftCheck.kind === "ready" ? fillSelectiveTaxAmounts(draftCheck, result) : draftCheck;
    const actual =
      filled.kind === "ready" && "crt" in filled.operation
        ? filled.operation.items.map((simplesItem) => simplesItem.selectiveTaxAmount)
        : [];

    expect(actual).toStrictEqual(expected);
  });

  it("sends 0.00 for an item the regular regime rejected", () => {
    const draft = { ...createSimplesDraft(), cbsRate: "2,3591", ibsRate: "0,026" };
    const draftCheck = checkSimplesDraft(draft, CIGARS_OPERATION, RESALE);
    const result = buildResult([
      { itemNumber: 1, status: "rejected", violations: [] },
    ] as unknown as CalculationResult["items"]);

    const expected = "0.00";
    const filled =
      draftCheck.kind === "ready" ? fillSelectiveTaxAmounts(draftCheck, result) : draftCheck;
    const actual =
      filled.kind === "ready" && "crt" in filled.operation
        ? filled.operation.items[0]?.selectiveTaxAmount
        : "not ready";

    expect(actual).toBe(expected);
  });
});
