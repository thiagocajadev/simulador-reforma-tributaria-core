import { describe, expect, it } from "vitest";
import type { OperationItem } from "./calculation.dto.ts";
import type {
  AnnexFacts,
  DocumentTypeFacts,
  ItemFacts,
  SelectiveTaxFacts,
} from "./calculation.facts.ts";
import { assessItem, type ItemContext } from "./item.validate.ts";

const NO_SELECTIVE_TAX: SelectiveTaxFacts = {
  isCstFound: false,
  classification: null,
  rates: { adValorem: null, adRem: null },
};

const NO_ANNEX: AnnexFacts = {
  hasAnnex: false,
  isListed: false,
  hasException: false,
  isListedWithoutException: false,
};

const LISTED: AnnexFacts = {
  hasAnnex: true,
  isListed: true,
  hasException: false,
  isListedWithoutException: true,
};

const NFE: DocumentTypeFacts = { id: 2, acronym: "NFE", allowsZeroNcm: true, isSupported: true };
const NFSE: DocumentTypeFacts = {
  id: 10,
  acronym: "NFSE",
  allowsZeroNcm: false,
  isSupported: true,
};

function buildFacts(overrides: Partial<ItemFacts> = {}) {
  const facts: ItemFacts = {
    isNcmFound: true,
    isNbsFound: true,
    cst: { hasTaxGroup: true },
    classification: {
      cstCode: "000",
      hasReductionGroup: false,
      rateType: "Padrão",
      linkedDocumentTypeIds: [2, 10],
    },
    treatment: {
      description: "Tributação integral",
      formulas: {
        rate: "aliquota",
        effectiveRate: "aliquota",
        base: "baseCalculoInformada",
        calculatedTax: "baseCalculo*aliquotaEfetiva",
        taxDue: "tributoCalculado",
      },
      hasReduction: false,
      hasAdjustment: false,
      hasDeferral: false,
      isMonophasic: false,
      requiresTaxRelief: false,
    },
    reductionPercents: { CBS: null, IBS_UF: null, IBS_MUN: null },
    classificationRates: { CBS: null, IBS_UF: null, IBS_MUN: null },
    ncmAnnex: NO_ANNEX,
    nbsAnnex: NO_ANNEX,
    selectiveTax: NO_SELECTIVE_TAX,
    legalGround: null,
    ...overrides,
  };
  return facts;
}

function buildContext(input: {
  item?: Partial<OperationItem>;
  facts?: Partial<ItemFacts>;
  date?: string;
  documentType?: DocumentTypeFacts | null;
}) {
  const context: ItemContext = {
    position: 0,
    item: {
      itemNumber: 1,
      ncmCode: "84713012",
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "100.00",
      ...input.item,
    },
    facts: buildFacts(input.facts),
    date: input.date ?? "2026-03-10",
    documentType: input.documentType === undefined ? NFE : input.documentType,
  };
  return context;
}

function findRule(context: ItemContext) {
  const assessment = assessItem(context);
  const rule =
    assessment.kind === "rejected"
      ? `${assessment.violation.ruleCode} ${assessment.violation.field}`
      : assessment.kind;
  return rule;
}

describe("assessItem", () => {
  it("lets a full-rate item with a known NCM through as calculable", () => {
    const context = buildContext({});

    const expected = "calculable";
    const actual = findRule(context);

    expect(actual).toBe(expected);
  });

  it("rejects the nomenclature codes in the upstream order", () => {
    const contexts = [
      buildContext({ item: { nbsCode: "122011200" } }),
      buildContext({ facts: { isNcmFound: false } }),
      buildContext({
        item: { ncmCode: undefined, nbsCode: "122011200" },
        facts: { isNbsFound: false },
      }),
    ];

    const expected = ["REG-001 items[0]", "REG-002 items[0].ncmCode", "REG-003 items[0].nbsCode"];
    const actual = contexts.map(findRule);

    expect(actual).toStrictEqual(expected);
  });

  it("rejects an unknown CST, then the nominal rates by year", () => {
    const contexts = [
      buildContext({ facts: { cst: null } }),
      buildContext({
        item: { nominalRates: { cbsRate: "8.8", ibsUfRate: "0.1", ibsMunRate: "0" } },
      }),
      buildContext({ date: "2027-03-10" }),
    ];

    const expected = [
      "REG-004 items[0].cstCode",
      "REG-036 items[0].nominalRates",
      "REG-037 items[0].nominalRates",
    ];
    const actual = contexts.map(findRule);

    expect(actual).toStrictEqual(expected);
  });

  it("asks no nominal rates from 2027 when the CST has no IBS/CBS group", () => {
    const context = buildContext({
      date: "2027-03-10",
      facts: { cst: { hasTaxGroup: false } },
    });

    const expected = "calculable";
    const actual = findRule(context);

    expect(actual).toBe(expected);
  });

  it("rejects the classification, its CST, its document type and its treatment", () => {
    const contexts = [
      buildContext({ facts: { classification: null } }),
      buildContext({ item: { cstCode: "200" } }),
      buildContext({
        facts: {
          classification: {
            cstCode: "000",
            hasReductionGroup: false,
            rateType: "Padrão",
            linkedDocumentTypeIds: [10],
          },
        },
      }),
      buildContext({ facts: { treatment: null } }),
    ];

    const expected = [
      "REG-005 items[0].cClassTrib",
      "REG-006 items[0].cClassTrib",
      "REG-029 items[0].cClassTrib",
      "REG-008 items[0].cClassTrib",
    ];
    const actual = contexts.map(findRule);

    expect(actual).toStrictEqual(expected);
  });

  it("criticizes the NCM against the annex the NF-e requires", () => {
    const contexts = [
      buildContext({ facts: { ncmAnnex: LISTED } }),
      buildContext({ facts: { ncmAnnex: { ...LISTED, isListed: false } } }),
      buildContext({
        facts: { ncmAnnex: { ...LISTED, hasException: true, isListedWithoutException: false } },
      }),
      buildContext({ item: { ncmCode: "8471" }, facts: { ncmAnnex: LISTED } }),
      buildContext({
        item: { nbsCode: "122011200", ncmCode: undefined },
        facts: { ncmAnnex: LISTED },
      }),
    ];

    const expected = [
      "calculable",
      "REG-011 items[0].ncmCode",
      "REG-011 items[0].ncmCode",
      "REG-015 items[0].ncmCode",
      "REG-030 items[0]",
    ];
    const actual = contexts.map(findRule);

    expect(actual).toStrictEqual(expected);
  });

  it("applies the NFS-e nomenclature rules", () => {
    const either = { ncmAnnex: LISTED, nbsAnnex: LISTED };
    const contexts = [
      buildContext({ documentType: NFSE, item: { ncmCode: undefined }, facts: either }),
      buildContext({ documentType: NFSE }),
      buildContext({ documentType: NFSE, item: { ncmCode: undefined, nbsCode: "122011200" } }),
    ];

    const expected = ["REG-033 items[0]", "REG-030 items[0]", "calculable"];
    const actual = contexts.map(findRule);

    expect(actual).toStrictEqual(expected);
  });

  it("requires a full code when no document type is given and the annex exists", () => {
    const context = buildContext({
      documentType: null,
      item: { ncmCode: undefined },
      facts: { nbsAnnex: LISTED },
    });

    const expected = "REG-016 items[0].nbsCode";
    const actual = findRule(context);

    expect(actual).toBe(expected);
  });

  it("leaves out the treatments the port does not implement", () => {
    const treatment = buildFacts().treatment;
    const contexts = treatment
      ? [
          buildContext({ facts: { treatment: { ...treatment, requiresTaxRelief: true } } }),
          buildContext({ facts: { treatment: { ...treatment, hasAdjustment: true } } }),
          buildContext({ facts: { treatment: { ...treatment, isMonophasic: true } } }),
          buildContext({ facts: { treatment: { ...treatment, hasDeferral: true } } }),
          buildContext({
            facts: {
              classification: {
                cstCode: "000",
                hasReductionGroup: false,
                rateType: "Alíquotas Combinadas (Ad Valorem e Ad Rem)",
                linkedDocumentTypeIds: [2],
              },
            },
          }),
        ]
      : [];

    const expected = ["taxRelief", "adjustment", "monophasic", "deferral", "combinedRates"];
    const actual = contexts.map((context) => {
      const assessment = assessItem(context);
      const reason = assessment.kind === "notImplemented" ? assessment.reason : assessment.kind;
      return reason;
    });

    expect(actual).toStrictEqual(expected);
  });
});
