import { describe, expect, it } from "vitest";
import type { CalculatedItem, OperationItem } from "@/features/calculations/calculation.dto.ts";
import { presentDanfe } from "./danfe.present.ts";
import { drawDanfe, renderDanfePdf } from "./danfe.render.ts";
import { buildNfeDocument, type NfeInput } from "./nfe.document.ts";
import { readNfeGoldenCase } from "./nfe.fixture.ts";

const MAX_ITEMS = 20;
const LONGEST_DESCRIPTION =
  "Notebook com processador de oito núcleos, tela de 15,6 polegadas, 16 GB de memória e SSD de 1 TB, cor grafite".padEnd(
    120,
    ".",
  );

function presentGoldenCase(caseName: string) {
  const { input } = readNfeGoldenCase(caseName);
  const presentation = presentDanfe(buildNfeDocument(input));
  return presentation;
}

// why: the largest note the form allows, every description at the 120 characters of xProd.
function presentLargestNote() {
  const { input } = readNfeGoldenCase("full-rate-goods-2027-nominal");
  const [operationItem] = input.operation.items as [OperationItem];
  const [calculatedItem] = input.calculatedItems as [CalculatedItem];
  const itemNumbers = Array.from({ length: MAX_ITEMS }, (_, position) => position + 1);
  const largestInput: NfeInput = {
    ...input,
    operation: {
      ...input.operation,
      items: itemNumbers.map((itemNumber) => ({ ...operationItem, itemNumber })),
    },
    calculatedItems: itemNumbers.map((itemNumber) => ({ ...calculatedItem, itemNumber })),
    itemDescriptions: itemNumbers.map(() => LONGEST_DESCRIPTION),
  };
  const presentation = presentDanfe(buildNfeDocument(largestInput));
  return presentation;
}

function readPdfText(pdfBytes: ArrayBuffer) {
  const text = new TextDecoder("latin1").decode(pdfBytes);
  return text;
}

function countOccurrences(text: string, fragment: string) {
  const count = text.split(fragment).length - 1;
  return count;
}

describe("drawDanfe", () => {
  it("draws a one-item note on one sheet, numbered FOLHA 1/1", () => {
    const pdf = drawDanfe(presentGoldenCase("full-rate-goods-2027-nominal"), { compress: false });
    const text = readPdfText(pdf.output("arraybuffer"));

    const expectedSheets = 1;
    const expectedTexts = [
      "(FOLHA 1/1)",
      "(4327 0312 3456 7800 0195 5500 1000 0000 0111 2345 6780)",
      "(TOTAL DO IBS / CBS / IS)",
      "(CBS 8,80%)",
      "(88,00)",
    ];
    const actualSheets = pdf.getNumberOfPages();
    const actualMissing = expectedTexts.filter((expectedText) => !text.includes(expectedText));

    expect(actualSheets).toBe(expectedSheets);
    expect(actualMissing).toStrictEqual([]);
  });

  it("continues twenty items on an additional sheet that repeats the header, as Anexo II 3.5 says", () => {
    const pdf = drawDanfe(presentLargestNote(), { compress: false });
    const text = readPdfText(pdf.output("arraybuffer"));

    const expectedSheets = 2;
    const expectedFolhas = ["(FOLHA 1/2)", "(FOLHA 2/2)"];
    const expectedHeaders = expectedSheets;
    const expectedItemCodes = MAX_ITEMS;
    const actualSheets = pdf.getNumberOfPages();
    const actualFolhas = expectedFolhas.filter((folha) => text.includes(folha));
    const actualHeaders = countOccurrences(text, "(DANFE)");
    const actualItemCodes = Array.from(
      { length: MAX_ITEMS },
      (_, position) => `(${position + 1} - Notebook`,
    ).filter((code) => text.includes(code)).length;

    expect(actualSheets).toBe(expectedSheets);
    expect(actualFolhas).toStrictEqual(expectedFolhas);
    expect(actualHeaders).toBe(expectedHeaders);
    expect(actualItemCodes).toBe(expectedItemCodes);
  });

  it("draws the no-fiscal-value watermark once per sheet, under the fields", () => {
    const pdf = drawDanfe(presentLargestNote(), { compress: false });
    const text = readPdfText(pdf.output("arraybuffer"));

    const expectedCount = pdf.getNumberOfPages();
    const actualCount = countOccurrences(text, "(SIMULAÇÃO · SEM VALOR FISCAL)");
    const actualIsUnderFields =
      text.indexOf("(SIMULAÇÃO · SEM VALOR FISCAL)") < text.indexOf("(DANFE)");

    expect(actualCount).toBe(expectedCount);
    expect(actualIsUnderFields).toBe(true);
  });

  it("prints the fixed recipient name at the 10 pt Anexo II 3.7.9 asks for", () => {
    const text = readPdfText(
      drawDanfe(presentGoldenCase("full-rate-goods-2026"), { compress: false }).output(
        "arraybuffer",
      ),
    );

    const expectedRun =
      /\/F9 10 Tf[^()]*\(NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL\)/;

    expect(text).toMatch(expectedRun);
  });

  it("prints the largest amount the form accepts at the full product size", () => {
    const { input } = readNfeGoldenCase("full-rate-goods-2026");
    const [operationItem] = input.operation.items as [OperationItem];
    const [calculatedItem] = input.calculatedItems as [CalculatedItem];
    const hugeAmount = "9999999999999.99";
    const hugeInput: NfeInput = {
      ...input,
      operation: { ...input.operation, items: [{ ...operationItem, baseAmount: hugeAmount }] },
      calculatedItems: [
        {
          ...calculatedItem,
          taxes: calculatedItem.taxes && { ...calculatedItem.taxes, baseAmount: hugeAmount },
        },
      ],
    };
    const text = readPdfText(
      drawDanfe(presentDanfe(buildNfeDocument(hugeInput)), { compress: false }).output(
        "arraybuffer",
      ),
    );

    const hugeRun = /\/F9 ([\d.]+) Tf[^()]*\((?:IBS\/CBS )?9\.999\.999\.999\.999,99\)/g;

    const expectedSizes = [6.5, 6.5, 6.5, 10, 10];
    const actualSizes = [...text.matchAll(hugeRun)]
      .map((match) => Number(match[1]))
      .sort((left, right) => left - right);

    expect(actualSizes).toStrictEqual(expectedSizes);
  });

  it("returns the bytes of a PDF file", () => {
    const bytes = new Uint8Array(renderDanfePdf(presentGoldenCase("multi-item-2026")));

    const expectedSignature = "%PDF-";
    const actualSignature = new TextDecoder("latin1").decode(bytes.slice(0, 5));

    expect(actualSignature).toBe(expectedSignature);
  });
});
