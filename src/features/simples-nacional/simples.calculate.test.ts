import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/shared/math/decimal.ts";
import { calculateSimplesItem, type SimplesItemInput } from "./simples.calculate.ts";
import type { RevenueTypeFacts, SimplesRegimeFacts } from "./simples.facts.ts";

const DOMESTIC_REVENUE: RevenueTypeFacts = {
  code: 1,
  description: "Receita bruta - interna",
  isRevenue: true,
  isSelectiveTaxRevenue: false,
  revenueFactor: "1.0",
  isPending: false,
  needsRates: true,
  isNonTaxableActivityRefused: true,
};

const SIMPLES_REGIME: SimplesRegimeFacts = {
  vocabulary: "CRT",
  hasTaxCalculation: true,
  hasIbs: true,
  dueDestination: "DEVIDO",
  pendingDestination: "PENDENTE_SUSPENSO",
};

function buildInput(overrides: {
  revenueType?: Partial<RevenueTypeFacts>;
  regime?: Partial<SimplesRegimeFacts>;
  cbsRate?: string | null;
  ibsRate?: string | null;
}): SimplesItemInput {
  const { revenueType, regime, cbsRate = "2.3591", ibsRate = "0.0260" } = overrides;
  const input: SimplesItemInput = {
    itemNumber: 1,
    calculable: {
      kind: "calculable",
      revenueType: { ...DOMESTIC_REVENUE, ...revenueType },
      baseAmount: parseDecimal("1000.00"),
      selectiveTaxAmount: parseDecimal("0.00"),
      cbsRate: cbsRate === null ? null : parseDecimal(cbsRate),
      ibsRate: ibsRate === null ? null : parseDecimal(ibsRate),
      notCalculatedReason: null,
    },
    regime: { ...SIMPLES_REGIME, ...regime },
    governmentEntity: null,
    governmentPurchaseFactor: null,
    rateDecimalPlaces: null,
  };
  return input;
}

describe("calculateSimplesItem", () => {
  it("taxes half the revenue for domestic market and export (tpRBSN 5, no fixture)", () => {
    const input = buildInput({ revenueType: { code: 5, revenueFactor: "0.5" } });

    const expectedBase = "500.00";
    const expectedCbs = {
      rate: "2.3591",
      dueAmount: "11.80",
      pendingAmount: "0.00",
      calculationSteps: [
        { step: "rate", formula: null, values: {}, result: "0.023591" },
        {
          step: "calculatedTax",
          formula: "receitaBruta*fatorReceita*aliquota",
          values: { receitaBruta: "1000", fatorReceita: "0.5", aliquota: "0.023591" },
          result: "11.8",
        },
      ],
    };
    const actual = calculateSimplesItem(input);
    const actualBase = "baseAmount" in actual ? actual.baseAmount : null;
    const actualCbs = "cbs" in actual ? actual.cbs : null;

    expect(actualBase).toBe(expectedBase);
    expect(actualCbs).toStrictEqual(expectedCbs);
  });

  it("drops the pending value when the regime sends it nowhere", () => {
    const input = buildInput({
      revenueType: { isPending: true },
      regime: { dueDestination: "PENDENTE_SUSPENSO", pendingDestination: "ZERO" },
    });

    const expected = { rate: "2.3591", dueAmount: "0.00", pendingAmount: "0.00" };
    const actual = calculateSimplesItem(input);
    const actualCbs = "cbs" in actual ? actual.cbs : null;

    expect(actualCbs).toMatchObject(expected);
  });

  it("leaves a rate the revenue type does not need out, with zero tax", () => {
    const input = buildInput({
      revenueType: { code: 0, isRevenue: false, revenueFactor: "0.0", needsRates: false },
      cbsRate: null,
      ibsRate: null,
    });

    const expected = {
      grossRevenue: "0.00",
      cbs: { rate: null, dueAmount: "0.00", pendingAmount: "0.00", calculationSteps: [] },
      itemTotal: "0.00",
    };
    const actual = calculateSimplesItem(input);
    const actualSummary =
      actual.status === "calculated"
        ? { grossRevenue: actual.grossRevenue, cbs: actual.cbs, itemTotal: actual.itemTotal }
        : null;

    expect(actualSummary).toStrictEqual(expected);
  });

  it("reports only the revenue of an item whose activity rules the calculation out", () => {
    const input = buildInput({});
    const notCalculatedInput: SimplesItemInput = {
      ...input,
      calculable: { ...input.calculable, notCalculatedReason: "activityUnknown" },
    };

    const expected = {
      itemNumber: 1,
      status: "notCalculated",
      reason: "activityUnknown",
      grossRevenue: "1000.00",
      revenueType: { code: 1, description: "Receita bruta - interna" },
    };
    const actual = calculateSimplesItem(notCalculatedInput);

    expect(actual).toStrictEqual(expected);
  });

  it("reports only the revenue under a regime that calculates no taxes, as upstream", () => {
    const input = buildInput({ regime: { hasTaxCalculation: false } });

    const expectedStatus = "notCalculated";
    const expectedReason = "revenueOnlyRegime";
    const actual = calculateSimplesItem(input);
    const actualStatus = actual.status;
    const actualReason = "reason" in actual ? actual.reason : null;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualReason).toBe(expectedReason);
  });

  it("records the rate a Union purchase shifts, with the rates it consumed", () => {
    const input: SimplesItemInput = { ...buildInput({}), governmentEntity: 1 };

    const expectedCbsRateStep = {
      step: "rate",
      formula: "aliquotaCbs+aliquotaIbs",
      values: { aliquotaCbs: "0.023591", aliquotaIbs: "0.00026" },
      result: "0.023851",
    };
    const expectedIbsSteps = [
      { step: "rate", formula: "0", values: {}, result: "0" },
      {
        step: "calculatedTax",
        formula: "receitaBruta*fatorReceita*aliquota",
        values: { receitaBruta: "1000", fatorReceita: "1", aliquota: "0" },
        result: "0",
      },
    ];
    const actual = calculateSimplesItem(input);
    const actualCbsRateStep = "cbs" in actual ? actual.cbs.calculationSteps.at(0) : null;
    const actualIbsSteps = "ibs" in actual ? actual.ibs?.calculationSteps : null;

    expect(actualCbsRateStep).toStrictEqual(expectedCbsRateStep);
    expect(actualIbsSteps).toStrictEqual(expectedIbsSteps);
  });

  it("records the NFS-e layout rounding on the rate step", () => {
    const input: SimplesItemInput = { ...buildInput({}), rateDecimalPlaces: 2 };

    const expected = {
      step: "rate",
      formula: null,
      values: {},
      result: "0.0236",
      roundedToPlaces: 2,
    };
    const actual = calculateSimplesItem(input);
    const actualRateStep = "cbs" in actual ? actual.cbs.calculationSteps.at(0) : null;

    expect(actualRateStep).toStrictEqual(expected);
  });

  it("refuses a state purchase without the transition factor", () => {
    const input: SimplesItemInput = { ...buildInput({}), governmentEntity: 2 };

    const expectedMessage = /No government purchase factor/;
    const actual = () => calculateSimplesItem(input);

    expect(actual).toThrow(expectedMessage);
  });
});
