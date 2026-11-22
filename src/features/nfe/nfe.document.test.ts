import { describe, expect, it } from "vitest";
import type { CalculatedItem } from "@/features/calculations/calculation.dto.ts";
import { buildNfeDocument, type NfeInput } from "./nfe.document.ts";
import { readNfeGoldenCase } from "./nfe.fixture.ts";

function withoutTaxGroup(input: NfeInput) {
  const [firstItem] = input.calculatedItems as [CalculatedItem];
  const immune: CalculatedItem = {
    ...firstItem,
    cstCode: "410",
    cClassTrib: "410999",
    taxes: null,
  };
  const changed: NfeInput = { ...input, calculatedItems: [immune] };
  return changed;
}

describe("buildNfeDocument", () => {
  it("builds a 44-digit access key from the UF, the month, the CNPJ and the placeholders", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2027-nominal");

    const keyParts = [
      "43",
      "2703",
      "12345678000195",
      "55",
      "001",
      "000000001",
      "1",
      "12345678",
      "0",
    ];
    const expectedKey = keyParts.join("");
    const actualKey = buildNfeDocument(input).accessKey;

    expect(actualKey).toBe(expectedKey);
    expect(actualKey).toHaveLength(44);
  });

  it("adds IBS and CBS to the item total from 2027", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2027-nominal");
    const nfeDocument = buildNfeDocument(input);
    const [nfeItem] = nfeDocument.items;

    const expectedTotals = ["1000.00", "1089.00", "1089.00"];
    const actualTotals = [
      nfeItem?.productAmount,
      nfeItem?.itemTotal,
      nfeDocument.totals.totalWithTaxes,
    ];

    expect(actualTotals).toStrictEqual(expectedTotals);
  });

  it("leaves IBS and CBS out of the item total in 2026, as NT 2025.002 VB01-10 says", () => {
    const { input } = readNfeGoldenCase("multi-item-2026");
    const nfeDocument = buildNfeDocument(input);

    const expectedItemTotals = nfeDocument.items.map((nfeItem) => nfeItem.productAmount);
    const actualItemTotals = nfeDocument.items.map((nfeItem) => nfeItem.itemTotal);
    const expectedNoteTotal = nfeDocument.totals.productAmount;
    const actualNoteTotal = nfeDocument.totals.totalWithTaxes;

    expect(actualItemTotals).toStrictEqual(expectedItemTotals);
    expect(actualNoteTotal).toBe(expectedNoteTotal);
  });

  it("keeps an item without the IBS/CBS group out of the IBS/CBS totals", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2027-nominal");
    const nfeDocument = buildNfeDocument(withoutTaxGroup(input));

    const expected = { taxGroup: null, ibsCbsBase: "0.00", totalWithTaxes: "1000.00" };
    const actual = {
      taxGroup: nfeDocument.items[0]?.taxGroup,
      ibsCbsBase: nfeDocument.totals.ibsCbsBase,
      totalWithTaxes: nfeDocument.totals.totalWithTaxes,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("cuts the product description at the 120 characters of xProd", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2026");
    const longInput: NfeInput = { ...input, itemDescriptions: ["Notebook ".repeat(20)] };

    const expectedLength = 120;
    const actualLength = buildNfeDocument(longInput).items[0]?.description.length;

    expect(actualLength).toBe(expectedLength);
  });

  it("collapses spaces in the description and never ends it with one", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2026");
    const spacedInput: NfeInput = {
      ...input,
      itemDescriptions: [
        `  Cabo   USB
${"x".repeat(106)} fim de linha`,
      ],
    };

    const expectedDescription = /^Cabo USB x+ fim$/;
    const expectedMaxLength = 120;
    const actualDescription = buildNfeDocument(spacedInput).items[0]?.description ?? "";

    expect(actualDescription).toMatch(expectedDescription);
    expect(actualDescription.length).toBeLessThanOrEqual(expectedMaxLength);
  });

  it("refuses an operation whose items were not all calculated", () => {
    const { input } = readNfeGoldenCase("multi-item-2026");
    const partialInput: NfeInput = { ...input, calculatedItems: input.calculatedItems.slice(1) };

    const expectedMessage = /every item calculated/;
    const actualBuild = () => buildNfeDocument(partialInput);

    expect(actualBuild).toThrow(expectedMessage);
  });
});
