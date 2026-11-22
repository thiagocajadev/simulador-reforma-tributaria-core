import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/shared/math/decimal.ts";
import type { OperationItem } from "./calculation.dto.ts";
import type { TreatmentFacts } from "./calculation.facts.ts";
import { calculateItemTaxes, type LocationRates } from "./tax.calculate.ts";

const TREATMENT: TreatmentFacts = {
  description: "Tributação integral",
  formulas: {
    rate: "aliquota",
    effectiveRate: "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
    base: "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado",
    calculatedTax: "baseCalculo*aliquotaEfetiva",
    taxDue: "tributoCalculado",
  },
  hasReduction: false,
  hasAdjustment: false,
  hasDeferral: false,
  isMonophasic: false,
  requiresTaxRelief: false,
};

const LOCATION_RATES: LocationRates = {
  CBS: { applicable: "0.9", reference: "0.9" },
  IBS_UF: { applicable: "0.1", reference: "0.1" },
  IBS_MUN: { applicable: "0", reference: "0" },
};

const NO_PERCENTS = { CBS: null, IBS_UF: null, IBS_MUN: null };

function buildInput(input: {
  rateType: string;
  item?: Partial<OperationItem>;
  rateFormula?: string;
  baseFormula?: string;
}) {
  const { rateType, item, rateFormula, baseFormula } = input;
  const taxInput = {
    item: { itemNumber: 1, cstCode: "000", cClassTrib: "000001", baseAmount: "1000.00", ...item },
    hasReductionGroup: false,
    rateType,
    treatment: {
      ...TREATMENT,
      formulas: {
        ...TREATMENT.formulas,
        rate: rateFormula ?? "aliquota",
        base: baseFormula ?? TREATMENT.formulas.base,
      },
    },
    reductionPercents: NO_PERCENTS,
    classificationRates: NO_PERCENTS,
    locationRates: LOCATION_RATES,
    selectiveTaxAmount: parseDecimal("0"),
  };
  return taxInput;
}

describe("calculateItemTaxes", () => {
  it("reports a fixed rate missing from the classification", () => {
    const input = buildInput({ rateType: "Fixa" });

    const expected = { kind: "missingRate", tax: "CBS", rateType: "Fixa" };
    const actual = calculateItemTaxes(input);

    expect(actual).toStrictEqual(expected);
  });

  it("lets a nominal rate prevail over a fixed rate formula", () => {
    const input = buildInput({
      rateType: "Padrão",
      rateFormula: "0",
      item: { nominalRates: { cbsRate: "8.8", ibsUfRate: "0.1", ibsMunRate: "0.05" } },
    });

    const expectedRates = ["8.80", "0.10", "0.05"];
    const outcome = calculateItemTaxes(input);
    const taxes = outcome.kind === "calculated" ? outcome.taxes : null;
    const actualRates = taxes ? [taxes.cbs.rate, taxes.ibsUf.rate, taxes.ibsMun.rate] : [];

    expect(actualRates).toStrictEqual(expectedRates);
  });

  it("calculates zero for a classification without rate", () => {
    const input = buildInput({ rateType: "Sem alíquota" });

    const expected = {
      rate: "0.00",
      reductionPercent: null,
      effectiveRate: null,
      amount: "0.00",
      rateSource: "none",
    };
    const outcome = calculateItemTaxes(input);
    const cbs = outcome.kind === "calculated" ? outcome.taxes.cbs : null;
    const actual = cbs
      ? {
          rate: cbs.rate,
          reductionPercent: cbs.reductionPercent,
          effectiveRate: cbs.effectiveRate,
          amount: cbs.amount,
          rateSource: cbs.rateSource,
        }
      : null;

    expect(actual).toStrictEqual(expected);
  });

  it("records each formula with the values it consumed and its settled result", () => {
    const input = buildInput({ rateType: "Padrão" });

    const expected = [
      { step: "rate", formula: "aliquota", values: { aliquota: "0.009" }, result: "0.009" },
      {
        step: "effectiveRate",
        formula: "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
        values: { aliquota: "0.009", percentualReducao: "0", pRedutorCompraGov: "0" },
        result: "0.009",
      },
      {
        step: "base",
        formula: "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado",
        values: {
          baseCalculoInformada: "1000",
          impostoSeletivoInformado: "0",
          impostoSeletivoCalculado: "0",
        },
        result: "1000",
      },
      {
        step: "calculatedTax",
        formula: "baseCalculo*aliquotaEfetiva",
        values: { baseCalculo: "1000", aliquotaEfetiva: "0.009" },
        result: "9",
      },
      {
        step: "taxDue",
        formula: "tributoCalculado",
        values: { tributoCalculado: "9" },
        result: "9",
      },
    ];
    const outcome = calculateItemTaxes(input);
    const actual = outcome.kind === "calculated" ? outcome.taxes.cbs.calculationSteps : null;

    expect(actual).toStrictEqual(expected);
  });

  it("records a nominal rate that prevails over the rate formula as given, not calculated", () => {
    const input = buildInput({
      rateType: "Padrão",
      rateFormula: "0",
      item: { nominalRates: { cbsRate: "8.8", ibsUfRate: "0.1", ibsMunRate: "0.05" } },
    });

    const expectedSource = "nominal";
    const expectedStep = { step: "rate", formula: null, values: {}, result: "0.088" };
    const outcome = calculateItemTaxes(input);
    const cbs = outcome.kind === "calculated" ? outcome.taxes.cbs : null;
    const actualSource = cbs?.rateSource;
    const actualStep = cbs?.calculationSteps.at(0);

    expect(actualSource).toBe(expectedSource);
    expect(actualStep).toStrictEqual(expectedStep);
  });

  it("names the source of each stored rate type", () => {
    const rateTypes = ["Padrão", "Uniforme nacional (referência)", "Uniforme setorial"];
    const classificationRates = { CBS: "0.5", IBS_UF: "0.05", IBS_MUN: "0" };

    const expected = ["standard", "reference", "classification"];
    const actual = rateTypes.map((rateType) => {
      const outcome = calculateItemTaxes({ ...buildInput({ rateType }), classificationRates });
      const source = outcome.kind === "calculated" ? outcome.taxes.cbs.rateSource : null;
      return source;
    });

    expect(actual).toStrictEqual(expected);
  });

  it("clamps a negative base to zero, as upstream", () => {
    const input = buildInput({ rateType: "Padrão", baseFormula: "baseCalculoInformada-2000" });

    const expectedBase = "0.00";
    const expectedAmount = "0.00";
    const outcome = calculateItemTaxes(input);
    const actualBase = outcome.kind === "calculated" ? outcome.taxes.baseAmount : null;
    const actualAmount = outcome.kind === "calculated" ? outcome.taxes.cbs.amount : null;

    expect(actualBase).toBe(expectedBase);
    expect(actualAmount).toBe(expectedAmount);
  });
});
