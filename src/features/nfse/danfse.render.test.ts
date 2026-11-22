import { describe, expect, it } from "vitest";
import type { Operation } from "@/features/calculations/calculation.dto.ts";
import { UNRECORDED_STEPS } from "@/features/calculations/calculation.fixture.ts";
import { presentDanfse } from "./danfse.present.ts";
import { drawDanfse, renderDanfsePdf } from "./danfse.render.ts";
import { buildNfseDocument, type NfseInput } from "./nfse.document.ts";

const OPERATION: Operation = {
  taxEventDate: "2026-03-10T10:00:00-03:00",
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

const INPUT: NfseInput = {
  operation: OPERATION,
  municipalityName: "Porto Alegre",
  calculatedItem: {
    itemNumber: 1,
    status: "calculated",
    cstCode: "200",
    cClassTrib: "200028",
    treatmentDescription: "Alíquota reduzida em 60%",
    legalGround: null,
    selectiveTax: null,
    taxes: {
      baseAmount: "1200.00",
      cbs: {
        ...UNRECORDED_STEPS,
        rate: "0.90",
        reductionPercent: "60.00",
        effectiveRate: "0.36",
        amount: "4.32",
      },
      ibsUf: {
        ...UNRECORDED_STEPS,
        rate: "0.10",
        reductionPercent: "60.00",
        effectiveRate: "0.04",
        amount: "0.48",
      },
      ibsMun: {
        ...UNRECORDED_STEPS,
        rate: "0.00",
        reductionPercent: "60.00",
        effectiveRate: "0.00",
        amount: "0.00",
      },
      ibsAmount: "0.48",
    },
  },
  service: {
    nationalTaxCode: "080101",
    nationalTaxDescription: "Ensino regular pré-escolar, fundamental, médio e superior.",
    indicatorCode: "030101",
    description: "Mensalidade escolar de março de 2026. ".repeat(40),
  },
};

const PRESENTATION = presentDanfse(buildNfseDocument(INPUT));

describe("renderDanfsePdf", () => {
  it("fits the DANFSe on one A4 page, even with the longest service description", () => {
    const pdf = drawDanfse(PRESENTATION, { compress: false });
    const longInformation = {
      ...PRESENTATION,
      blocks: PRESENTATION.blocks.map((block) =>
        block.kind === "text" ? { ...block, text: "x ".repeat(1000) } : block,
      ),
    };

    const expectedPages = 1;
    const expectedSize = { width: 210, height: 297 };
    const actualPages = pdf.getNumberOfPages();
    const actualSize = {
      width: Math.round(pdf.internal.pageSize.getWidth()),
      height: Math.round(pdf.internal.pageSize.getHeight()),
    };

    expect(actualPages).toBe(expectedPages);
    expect(actualSize).toStrictEqual(expectedSize);
    expect(() => drawDanfse(longInformation, { compress: false })).not.toThrow();
  });

  it("refuses content that would run into the receipt stub", () => {
    const overflowing = {
      ...PRESENTATION,
      blocks: [...PRESENTATION.blocks, ...PRESENTATION.blocks],
    };

    const expectedError = /past the receipt/;
    const actualDraw = () => drawDanfse(overflowing, { compress: false });

    expect(actualDraw).toThrow(expectedError);
  });

  it("prints the validity notice, the access key and the IBS/CBS values", () => {
    const text = new TextDecoder("latin1").decode(
      drawDanfse(PRESENTATION, { compress: false }).output("arraybuffer"),
    );

    const expectedTexts = [
      "(NFS-e SEM VALIDADE JURÍDICA)",
      "(43149022212345678000195000000000000126031234567890)",
      "(200 / 200028)",
      "(R$ 4,32)",
      "(R$ 1.204,80)",
    ];
    const actualMissing = expectedTexts.filter((expectedText) => !text.includes(expectedText));

    expect(actualMissing).toStrictEqual([]);
  });

  it("draws the diagonal no-fiscal-value watermark once per page, under the fields", () => {
    const pdf = drawDanfse(PRESENTATION, { compress: false });
    const text = new TextDecoder("latin1").decode(pdf.output("arraybuffer"));

    const expectedCount = pdf.getNumberOfPages();
    const expectedIsUnderFields = true;
    const actualCount = text.split("(SIMULAÇÃO · SEM VALOR FISCAL)").length - 1;
    const actualIsUnderFields =
      text.indexOf("(SIMULAÇÃO · SEM VALOR FISCAL)") <
      text.indexOf("(NFS-e SEM VALIDADE JURÍDICA)");

    expect(actualCount).toBe(expectedCount);
    expect(actualIsUnderFields).toBe(expectedIsUnderFields);
  });

  it("returns the bytes of a PDF file", () => {
    const bytes = new Uint8Array(renderDanfsePdf(PRESENTATION));

    const expectedSignature = "%PDF-";
    const actualSignature = new TextDecoder("latin1").decode(bytes.slice(0, 5));

    expect(actualSignature).toBe(expectedSignature);
  });
});
