import { describe, expect, it } from "vitest";
import type {
  CalculatedItem,
  CalculationResult,
  Operation,
} from "@/features/calculations/calculation.dto.ts";
import { checkNfeEligibility } from "./nfe.eligibility.ts";

const NFE_OPERATION: Operation = {
  taxEventDate: "2027-03-10T12:00:00-03:00",
  uf: "SP",
  municipalityCode: 3550308,
  documentType: 55,
  items: [
    { itemNumber: 1, ncmCode: "10063021", cstCode: "200", cClassTrib: "200003", baseAmount: "100" },
    { itemNumber: 2, ncmCode: "84713012", cstCode: "410", cClassTrib: "410999", baseAmount: "50" },
  ],
};

const TOTALS = {
  baseAmount: "0.00",
  cbsAmount: "0.00",
  ibsUfAmount: "0.00",
  ibsMunAmount: "0.00",
  ibsAmount: "0.00",
  selectiveTaxAmount: "0.00",
};

const WITHOUT_TAX_GROUP: CalculatedItem = {
  itemNumber: 2,
  status: "calculated",
  cstCode: "410",
  cClassTrib: "410999",
  treatmentDescription: "Imunidade",
  legalGround: null,
  selectiveTax: null,
  taxes: null,
};

function resultWith(items: CalculationResult["items"]) {
  const result: CalculationResult = { items, totals: TOTALS, dataVersion: "V0073" };
  return result;
}

describe("checkNfeEligibility", () => {
  it("is silent for a service note, which has no NF-e", () => {
    const operation: Operation = { ...NFE_OPERATION, documentType: 91 };
    const result = resultWith([WITHOUT_TAX_GROUP]);

    const expected = { isEligible: false, reason: null };
    const actual = checkNfeEligibility(operation, result);

    expect(actual).toStrictEqual(expected);
  });

  it("is silent for an NFC-e, whose DANFE is another layout", () => {
    const operation: Operation = { ...NFE_OPERATION, documentType: 65 };
    const result = resultWith([WITHOUT_TAX_GROUP, WITHOUT_TAX_GROUP]);

    const expected = { isEligible: false, reason: null };
    const actual = checkNfeEligibility(operation, result);

    expect(actual).toStrictEqual(expected);
  });

  it("explains that a rejected item keeps the note from being generated", () => {
    const result = resultWith([
      {
        itemNumber: 1,
        status: "rejected",
        violations: [{ ruleCode: "REG-012", field: "items[0]", message: "" }],
      },
      WITHOUT_TAX_GROUP,
    ]);

    const expectedReason = /não pode deixar item de fora/;
    const actual = checkNfeEligibility(NFE_OPERATION, result);
    const actualReason = actual.isEligible ? null : actual.reason;

    expect(actualReason).toMatch(expectedReason);
  });

  it("explains that a note cannot leave out an item that was not calculated", () => {
    const result = resultWith([
      { itemNumber: 1, status: "notImplemented", reason: "deferral" },
      WITHOUT_TAX_GROUP,
    ]);

    const expectedEligibility = false;
    const actual = checkNfeEligibility(NFE_OPERATION, result);
    const actualReason = actual.isEligible ? null : actual.reason;

    expect(actual.isEligible).toBe(expectedEligibility);
    expect(actualReason).toMatch(/não pode deixar item de fora/);
  });

  it("accepts every item calculated, including a CST without the IBS/CBS group", () => {
    const withTaxes: CalculatedItem = { ...WITHOUT_TAX_GROUP, itemNumber: 1, status: "simulated" };
    const result = resultWith([withTaxes, WITHOUT_TAX_GROUP]);

    const expected = { isEligible: true, calculatedItems: [withTaxes, WITHOUT_TAX_GROUP] };
    const actual = checkNfeEligibility(NFE_OPERATION, result);

    expect(actual).toStrictEqual(expected);
  });
});
