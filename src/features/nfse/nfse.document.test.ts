import { describe, expect, it } from "vitest";
import type { CalculatedItem, Operation } from "@/features/calculations/calculation.dto.ts";
import { UNRECORDED_STEPS } from "@/features/calculations/calculation.fixture.ts";
import { buildNfseDocument, type NfseInput } from "./nfse.document.ts";

const TAX_FREE = {
  ...UNRECORDED_STEPS,
  rate: "0.00",
  reductionPercent: null,
  effectiveRate: null,
  amount: "0.00",
};

const OPERATION: Operation = {
  taxEventDate: "2026-11-21T12:00:00-03:00",
  uf: "SP",
  municipalityCode: 3550308,
  documentType: 91,
  items: [
    {
      itemNumber: 1,
      nbsCode: "122011200",
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "99.9",
    },
  ],
};

const CALCULATED_ITEM: CalculatedItem = {
  itemNumber: 1,
  status: "calculated",
  cstCode: "000",
  cClassTrib: "000001",
  treatmentDescription: "Tributação integral",
  legalGround: null,
  selectiveTax: null,
  taxes: {
    baseAmount: "99.90",
    cbs: { ...TAX_FREE, rate: "0.90", amount: "0.90" },
    ibsUf: { ...TAX_FREE, rate: "0.10", amount: "0.10" },
    ibsMun: TAX_FREE,
    ibsAmount: "0.10",
  },
};

const INPUT: NfseInput = {
  operation: OPERATION,
  calculatedItem: CALCULATED_ITEM,
  municipalityName: "São Paulo",
  service: {
    nationalTaxCode: "080101",
    nationalTaxDescription: "Ensino regular pré-escolar, fundamental, médio e superior.",
    indicatorCode: "030101",
    description: "Aula avulsa",
  },
};

describe("buildNfseDocument", () => {
  it("adds IBS and CBS to the service value for the total with taxes", () => {
    const expected = {
      serviceAmount: "99.90",
      ibsCbsAmount: "1.00",
      totalWithTaxes: "100.90",
      baseDeductions: "0.00",
    };
    const nfseDocument = buildNfseDocument(INPUT);
    const actual = {
      serviceAmount: nfseDocument.serviceAmount,
      ibsCbsAmount: nfseDocument.ibsCbs.ibsCbsAmount,
      totalWithTaxes: nfseDocument.ibsCbs.totalWithTaxes,
      baseDeductions: nfseDocument.baseDeductions,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("builds the fictitious access key from the municipality and the competence month", () => {
    const expectedAccessKey = "NFS35503082212345678000195000000000000126111234567890";
    const actualAccessKey = buildNfseDocument(INPUT).accessKey;

    expect(actualAccessKey).toBe(expectedAccessKey);
    expect(actualAccessKey).toHaveLength(53);
  });

  it("refuses an item without IBS/CBS values or an operation with more than one item", () => {
    const withoutTaxes: NfseInput = {
      ...INPUT,
      calculatedItem: { ...CALCULATED_ITEM, taxes: null },
    };
    const twoItems: NfseInput = {
      ...INPUT,
      operation: { ...OPERATION, items: [...OPERATION.items, ...OPERATION.items] },
    };

    const expectedErrors = [/no IBS\/CBS values/, /exactly one item/];
    const actualBuilds = [withoutTaxes, twoItems].map((input) => () => buildNfseDocument(input));

    expect(actualBuilds[0]).toThrow(expectedErrors[0]);
    expect(actualBuilds[1]).toThrow(expectedErrors[1]);
  });
});
