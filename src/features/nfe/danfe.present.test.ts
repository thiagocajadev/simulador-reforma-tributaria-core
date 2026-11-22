import { describe, expect, it } from "vitest";
import type { CalculatedItem } from "@/features/calculations/calculation.dto.ts";
import { presentDanfe } from "./danfe.present.ts";
import { buildNfeDocument, type NfeInput } from "./nfe.document.ts";
import { readNfeGoldenCase } from "./nfe.fixture.ts";

function presentGoldenCase(caseName: string, change?: (input: NfeInput) => NfeInput) {
  const { input } = readNfeGoldenCase(caseName);
  const presentation = presentDanfe(buildNfeDocument(change ? change(input) : input));
  return presentation;
}

describe("presentDanfe", () => {
  it("prints the access key in eleven blocks of four digits", () => {
    const presentation = presentGoldenCase("full-rate-goods-2027-nominal");

    const expectedKey = "4327 0312 3456 7800 0195 5500 1000 0000 0111 2345 6780";
    const actualKey = presentation.accessKeyText;

    expect(actualKey).toBe(expectedKey);
  });

  it("fills the Total do IBS/CBS/IS block of NT 2026.010, the IS blank in a note without it", () => {
    const presentation = presentGoldenCase("full-rate-goods-2027-nominal");

    const expected = [
      { label: "VALOR DA CBS", value: "88,00", span: 1 },
      { label: "VALOR DO IBS UF", value: "0,50", span: 1 },
      { label: "VALOR DO IBS MUNICÍPIO", value: "0,50", span: 1 },
      { label: "VALOR DO IMPOSTO SELETIVO", value: "", span: 1 },
    ];
    const actual = presentation.reformTotals;

    expect(actual).toStrictEqual(expected);
  });

  it("prints the Imposto Seletivo total when the note has ISTot", () => {
    const presentation = presentGoldenCase("selective-tax-cigars-2027");

    const expected = { label: "VALOR DO IMPOSTO SELETIVO", value: "473,00", span: 1 };
    const actual = presentation.reformTotals.at(-1);

    expect(actual).toStrictEqual(expected);
  });

  it("prints the effective rate when the item has the reduction group", () => {
    const presentation = presentGoldenCase("basic-food-basket-2026");
    const [product] = presentation.products;

    const expectedRates = ["ICMS", "CBS 0,00%", "IBS UF 0,00%", "IBS MUN 0,00%"];
    const actualRates = product?.rates;

    expect(actualRates).toStrictEqual(expectedRates);
  });

  it("keeps the ICMS lines blank and only labels for an item without the IBS/CBS group", () => {
    const presentation = presentGoldenCase("full-rate-goods-2026", (input) => {
      const [firstItem] = input.calculatedItems as [CalculatedItem];
      const changed: NfeInput = {
        ...input,
        calculatedItems: [{ ...firstItem, cstCode: "410", cClassTrib: "410999", taxes: null }],
      };
      return changed;
    });
    const [product] = presentation.products;

    const expectedAmounts = ["ICMS", "CBS", "IBS UF", "IBS MUN"];
    const expectedCodes = "NCM 84713012 · cClassTrib 410999";
    const actualAmounts = product?.amounts;
    const actualCodes = product?.codes;

    expect(actualAmounts).toStrictEqual(expectedAmounts);
    expect(actualCodes).toBe(expectedCodes);
  });

  it("sends the total with IBS/CBS to the additional information, as Anexo II 3.10.5 allows", () => {
    const presentation = presentGoldenCase("full-rate-goods-2027-nominal");

    const expectedSentences = [
      "SEM VALOR FISCAL",
      "Valor total da NF-e com IBS/CBS/IS: R$ 1.089,00.",
    ];
    const actualMissing = expectedSentences.filter(
      (sentence) => !presentation.additionalInformation.includes(sentence),
    );

    expect(actualMissing).toStrictEqual([]);
  });
});
