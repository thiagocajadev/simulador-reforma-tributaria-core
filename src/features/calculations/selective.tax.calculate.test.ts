import { describe, expect, it } from "vitest";
import type { OperationItem } from "./calculation.dto.ts";
import type { SelectiveTaxTreatmentFacts } from "./calculation.facts.ts";
import { calculateSelectiveTax } from "./selective.tax.calculate.ts";

const WITH_CALCULATION: SelectiveTaxTreatmentFacts = {
  description: "Tributação pelo Imposto Seletivo - Com Cálculo",
  formulas: {
    base: "baseCalculoInformada",
    calculatedTax: "baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem",
    taxDue: "tributoCalculado",
  },
};

function buildItem(selectiveTax: OperationItem["selectiveTax"]) {
  const operationItem: OperationItem = {
    itemNumber: 1,
    ncmCode: "24021000",
    cstCode: "000",
    cClassTrib: "000001",
    baseAmount: "15.00",
    selectiveTax,
  };
  return operationItem;
}

describe("calculateSelectiveTax", () => {
  it("gives the upstream tests' amounts: 47,30 on 200 and 10,54 on a vehicle", () => {
    const cigars = { ...buildItem(undefined), baseAmount: "200.00" };
    const vehicle = { ...cigars, ncmCode: "87032100" };

    const expected = ["47.30", "10.54"];
    const actual = [
      calculateSelectiveTax({
        item: {
          ...cigars,
          selectiveTax: {
            cstCode: "000",
            cClassTrib: "000001",
            adValoremRate: "13",
            adRemRate: "21.3",
            quantity: "1",
            unit: "VN",
          },
        },
        treatment: WITH_CALCULATION,
        rates: { adValorem: { percent: null }, adRem: { amount: null, unit: "VN" } },
      }).amount,
      calculateSelectiveTax({
        item: {
          ...vehicle,
          selectiveTax: { cstCode: "000", cClassTrib: "000001", adValoremRate: "5.27" },
        },
        treatment: WITH_CALCULATION,
        rates: { adValorem: { percent: null }, adRem: null },
      }).amount,
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("rounds once, after adding the ad valorem and ad rem parts", () => {
    const operationItem = buildItem({
      cstCode: "000",
      cClassTrib: "000001",
      adValoremRate: "66.7",
      adRemRate: "3.5",
      quantity: "2.5",
      unit: "VN",
    });

    const expected = {
      baseAmount: "15.00",
      adValoremRate: "66.70",
      adRemRate: "3.50",
      unit: "VN",
      quantity: "2.5000",
      amount: "18.76",
      rateSources: { adValorem: "nominal", adRem: "nominal" },
    };
    const actual = calculateSelectiveTax({
      item: operationItem,
      treatment: WITH_CALCULATION,
      rates: { adValorem: { percent: null }, adRem: { amount: null, unit: "VN" } },
    });
    const { baseAmount, adValoremRate, adRemRate, unit, quantity, amount, rateSources } = actual;

    expect({
      baseAmount,
      adValoremRate,
      adRemRate,
      unit,
      quantity,
      amount,
      rateSources,
    }).toStrictEqual(expected);
  });

  it("takes an official rate the visitor left out, and records where each rate came from", () => {
    const operationItem = buildItem({
      cstCode: "000",
      cClassTrib: "000001",
      adRemRate: "1",
      quantity: "1",
      unit: "VN",
    });

    const expectedRates = { adValoremRate: "13.00", adRemRate: "1.00" };
    const expectedSources = { adValorem: "official", adRem: "nominal" };
    const expectedAmount = "2.95";
    const actual = calculateSelectiveTax({
      item: operationItem,
      treatment: WITH_CALCULATION,
      rates: { adValorem: { percent: "13" }, adRem: { amount: "21.3", unit: "VN" } },
    });
    const actualRates = { adValoremRate: actual.adValoremRate, adRemRate: actual.adRemRate };

    expect(actualRates).toStrictEqual(expectedRates);
    expect(actual.rateSources).toStrictEqual(expectedSources);
    expect(actual.amount).toBe(expectedAmount);
  });

  it("records the formulas it ran, and leaves unit and quantity out without an ad rem rate", () => {
    const operationItem = buildItem({
      cstCode: "000",
      cClassTrib: "000001",
      adValoremRate: "5.27",
    });

    const expectedSteps = ["base", "calculatedTax", "taxDue"];
    const expectedAdRem = { adRemRate: null, unit: null, quantity: null };
    const actual = calculateSelectiveTax({
      item: operationItem,
      treatment: WITH_CALCULATION,
      rates: { adValorem: { percent: null }, adRem: null },
    });
    const actualSteps = actual.calculationSteps.map((step) => step.step);
    const actualAdRem = {
      adRemRate: actual.adRemRate,
      unit: actual.unit,
      quantity: actual.quantity,
    };

    expect(actualSteps).toStrictEqual(expectedSteps);
    expect(actualAdRem).toStrictEqual(expectedAdRem);
    expect(actual.amount).toBe("0.79");
  });
});
