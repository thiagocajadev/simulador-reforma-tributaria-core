import { describe, expect, it } from "vitest";
import type { CalculationResult, Operation } from "@/features/calculations/calculation.dto.ts";
import { checkNfseEligibility } from "./nfse.eligibility.ts";

const NFSE_OPERATION: Operation = {
  taxEventDate: "2026-03-10T12:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 91,
  items: [
    {
      itemNumber: 1,
      nbsCode: "122011200",
      cstCode: "200",
      cClassTrib: "200028",
      baseAmount: "1200.00",
    },
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

function resultWith(items: CalculationResult["items"]) {
  const result: CalculationResult = { items, totals: TOTALS, dataVersion: "V0073" };
  return result;
}

describe("checkNfseEligibility", () => {
  it("is silent for a goods operation, which has no NFS-e", () => {
    const operation: Operation = { ...NFSE_OPERATION, documentType: 55 };
    const result = resultWith([{ itemNumber: 1, status: "notImplemented", reason: "adjustment" }]);

    const expected = { isEligible: false, reason: null };
    const actual = checkNfseEligibility(operation, result);

    expect(actual).toStrictEqual(expected);
  });

  it("explains why a rejected service or a service without IBS/CBS values has no NFS-e", () => {
    const rejected = resultWith([
      {
        itemNumber: 1,
        status: "rejected",
        violations: [{ ruleCode: "REG-012", field: "items[0]", message: "" }],
      },
    ]);
    const withoutTaxes = resultWith([
      {
        itemNumber: 1,
        status: "calculated",
        cstCode: "410",
        cClassTrib: "410001",
        treatmentDescription: "Imunidade",
        legalGround: null,
        selectiveTax: null,
        taxes: null,
      },
    ]);

    const expectedReasons = [
      "O serviço não foi calculado, então não há NFS-e para gerar.",
      "O CST escolhido não tem o grupo IBS/CBS, e a NFS-e simulada precisa desses valores para ser gerada.",
    ];
    const actualReasons = [rejected, withoutTaxes].map((result) => {
      const eligibility = checkNfseEligibility(NFSE_OPERATION, result);
      return eligibility.isEligible ? null : eligibility.reason;
    });

    expect(actualReasons).toStrictEqual(expectedReasons);
  });
});
