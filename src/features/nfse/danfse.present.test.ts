import { describe, expect, it } from "vitest";
import type { Operation } from "@/features/calculations/calculation.dto.ts";
import { UNRECORDED_STEPS } from "@/features/calculations/calculation.fixture.ts";
import { type DanfseField, presentDanfse } from "./danfse.present.ts";
import { buildNfseDocument, type NfseInput } from "./nfse.document.ts";

const SCHOOL_OPERATION: Operation = {
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

const SCHOOL_INPUT: NfseInput = {
  operation: SCHOOL_OPERATION,
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
    description: "Mensalidade escolar de março de 2026.",
  },
};

function findBlockFields(title: string) {
  const presentation = presentDanfse(buildNfseDocument(SCHOOL_INPUT));
  const block = presentation.blocks.find((entry) => entry.kind === "grid" && entry.title === title);
  const fields = block?.kind === "grid" ? block.fields : [];
  return fields;
}

function toValues(fields: DanfseField[]) {
  const values = Object.fromEntries(fields.map((field) => [field.label, field.value]));
  return values;
}

describe("presentDanfse", () => {
  it("prints the IBS/CBS block as the sample DANFSe, with a dash for zero values", () => {
    const expected = {
      "CST / cClassTrib": "200 / 200028",
      "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF":
        "030101 / 4314902 / Porto Alegre / RS",
      "Exclusões e Reduções da Base de Cálculo": "-",
      "Base de Cálculo Após Exclusões e Reduções": "R$ 1.200,00",
      "Red. Alíquota IBS / Red. Alíquota CBS": "60,00% / 60,00% / 60,00%",
      "Alíquota IBS UF / IBS Mun": "0,10% / -",
      "Alíq. Efetiva Municipal - IBS": "-",
      "Valor Apurado Municipal - IBS": "-",
      "Alíq. Efetiva Estadual - IBS": "0,04%",
      "Valor Apurado Estadual - IBS": "R$ 0,48",
      "Valor Total Apurado - IBS": "R$ 0,48",
      "Alíquota - CBS": "0,90%",
      "Alíquota Efetiva - CBS": "0,36%",
      "Valor Total Apurado - CBS": "R$ 4,32",
    };
    const actual = toValues(findBlockFields("TRIBUTAÇÃO IBS / CBS"));

    expect(actual).toStrictEqual(expected);
  });

  it("adds IBS and CBS to the net value in the totals", () => {
    const expectedTotal = "R$ 4,80";
    const expectedNetPlusTaxes = "R$ 1.204,80";
    const actual = toValues(findBlockFields("VALOR TOTAL DA NFS-E"));
    const actualTotal = actual["Total do IBS/CBS"];
    const actualNetPlusTaxes = actual["VALOR LÍQUIDO DA NFS-e + IBS/CBS"];

    expect(actualTotal).toBe(expectedTotal);
    expect(actualNetPlusTaxes).toBe(expectedNetPlusTaxes);
  });

  it("formats the codes, documents and dates as NT 008 prints them", () => {
    const presentation = presentDanfse(buildNfseDocument(SCHOOL_INPUT));

    const expected = {
      accessKey: "43149022212345678000195000000000000126031234567890",
      issuedAt: "10/03/2026 10:00:00",
      providerTaxId: "12.345.678/0001-95",
      takerTaxId: "123.456.789-00",
      nationalTaxCode: "08.01.01",
      nbsCode: "1.2201.12.00",
    };
    const actual = {
      accessKey: presentation.accessKey,
      issuedAt: toValues(presentation.identification)["DATA E HORA DA EMISSÃO DA DPS"],
      providerTaxId: toValues(findBlockFields("PRESTADOR / FORNECEDOR"))["CNPJ / CPF / NIF"],
      takerTaxId: toValues(findBlockFields("TOMADOR / ADQUIRENTE"))["CNPJ / CPF / NIF"],
      nationalTaxCode: toValues(findBlockFields("SERVIÇO PRESTADO"))[
        "Código de Tributação Nacional / Municipal"
      ],
      nbsCode: toValues(findBlockFields("SERVIÇO PRESTADO"))["Código da NBS"],
    };

    expect(actual).toStrictEqual(expected);
  });

  it("cuts a long service description at 1,300 characters, ellipsis included", () => {
    const input: NfseInput = {
      ...SCHOOL_INPUT,
      service: { ...SCHOOL_INPUT.service, description: "a".repeat(2000) },
    };

    const expectedLength = 1300;
    const fields = presentDanfse(buildNfseDocument(input)).blocks.flatMap((block) =>
      block.kind === "grid" ? block.fields : [],
    );
    const actualDescription =
      fields.find((field) => field.label === "Descrição do Serviço")?.value ?? "";

    expect(actualDescription).toHaveLength(expectedLength);
    expect(actualDescription.endsWith("...")).toBe(true);
  });
});

describe("presentDanfse typed text", () => {
  it("prints the description on one line, with a question mark for what the font cannot draw", () => {
    const input: NfseInput = {
      ...SCHOOL_INPUT,
      service: { ...SCHOOL_INPUT.service, description: "Aula 1\n\nAula 2 🎓 — “bônus”\tfinal" },
    };

    const expectedDescription = "Aula 1 Aula 2 ? — “bônus” final";
    const fields = presentDanfse(buildNfseDocument(input)).blocks.flatMap((block) =>
      block.kind === "grid" ? block.fields : [],
    );
    const actualDescription = fields.find((field) => field.label === "Descrição do Serviço")?.value;

    expect(actualDescription).toBe(expectedDescription);
  });
});
