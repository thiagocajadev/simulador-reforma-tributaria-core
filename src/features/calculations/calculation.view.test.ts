import { describe, expect, it } from "vitest";
import type { CalculationResult } from "./calculation.dto.ts";
import { UNRECORDED_STEPS } from "./calculation.fixture.ts";
import { toCalculationView } from "./calculation.view.ts";

const LAW = "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm";

const SCHOOL_RESULT: CalculationResult = {
  items: [
    {
      itemNumber: 1,
      status: "calculated",
      cstCode: "200",
      cClassTrib: "200028",
      treatmentDescription: "Redução de 60% das alíquotas",
      legalGround: { shortReference: "Art. 129", description: "Serviços de educação" },
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
    {
      itemNumber: 2,
      status: "rejected",
      violations: [{ ruleCode: "REG-011", field: "items[1].ncmCode", message: "Not linked." }],
    },
    { itemNumber: 3, status: "notImplemented", reason: "monophasic" },
  ],
  totals: {
    baseAmount: "1200.00",
    cbsAmount: "4.32",
    ibsUfAmount: "0.48",
    ibsMunAmount: "0.00",
    ibsAmount: "0.48",
    selectiveTaxAmount: "0.00",
  },
  dataVersion: "V0073",
};

describe("toCalculationView", () => {
  it("formats the totals in Brazilian notation", () => {
    const expected = [
      { label: "Base de cálculo", amount: "R$ 1.200,00" },
      { label: "CBS", amount: "R$ 4,32" },
      { label: "IBS estadual", amount: "R$ 0,48" },
      { label: "IBS municipal", amount: "R$ 0,00" },
      { label: "IBS total", amount: "R$ 0,48" },
    ];
    const actual = toCalculationView(SCHOOL_RESULT).totals;

    expect(actual).toStrictEqual(expected);
  });

  it("adds the CBS and the IBS to the value, per item and for the operation", () => {
    const view = toCalculationView(SCHOOL_RESULT);
    const [calculatedItem, rejectedItem] = view.itemViews;

    const expected = {
      operation: ["R$ 1.200,00", "R$ 4,80", "R$ 1.204,80"],
      calculatedItem: ["R$ 4,80", "R$ 1.204,80"],
      rejectedItem: [null, null],
    };
    const actual = {
      operation: [view.baseTotal, view.taxTotal, view.grandTotal],
      calculatedItem: [calculatedItem?.taxAmount, calculatedItem?.totalAmount],
      rejectedItem: [rejectedItem?.taxAmount, rejectedItem?.totalAmount],
    };

    expect(actual).toStrictEqual(expected);
  });

  it("shows each tax as rate, reduction, effective rate and amount", () => {
    const expectedCbsLine = {
      label: "CBS",
      tone: "cbs",
      hasReduction: true,
      rate: "0,90%",
      reduction: "60,00%",
      effectiveRate: "0,36%",
      amount: "R$ 4,32",
    };
    const expectedLegalGround = { label: "Art. 129 da LC 214/2025", url: `${LAW}#art129` };
    const expectedLegalText = "Art. 129: Serviços de educação";
    const [actualItem] = toCalculationView(SCHOOL_RESULT).itemViews;
    const actualCbsLine = actualItem?.taxLines[0];
    const actualLegalGround = actualItem?.legalGround;
    const actualLegalText = actualItem?.memory?.legalText;

    expect(actualCbsLine).toStrictEqual(expectedCbsLine);
    expect(actualLegalGround).toStrictEqual(expectedLegalGround);
    expect(actualLegalText).toBe(expectedLegalText);
  });

  it("builds the memory of each tax from its steps, with the official sources", () => {
    const [schoolItem] = SCHOOL_RESULT.items;
    const cbs = schoolItem && "taxes" in schoolItem ? schoolItem.taxes?.cbs : undefined;
    const result: CalculationResult = {
      ...SCHOOL_RESULT,
      items:
        schoolItem?.status === "calculated" && schoolItem.taxes && cbs
          ? [
              {
                ...schoolItem,
                taxes: {
                  ...schoolItem.taxes,
                  cbs: {
                    ...cbs,
                    calculationSteps: [
                      {
                        step: "rate",
                        formula: "aliquota",
                        values: { aliquota: "0.009" },
                        result: "0.009",
                      },
                    ],
                  },
                },
              },
            ]
          : [],
    };

    const expectedCbsMemory = {
      taxName: "CBS",
      tone: "cbs",
      steps: [
        {
          title: "Alíquota",
          plainFormula: null,
          substitutedFormula: null,
          rawFormula: "aliquota",
          result: "0,90%",
          note: "Publicada com até 4 casas decimais.",
          origin: "Alíquota de referência nacional do ano.",
        },
      ],
      story: {
        lines: [{ text: "Alíquota do ano", equation: null, value: "0,90%" }],
        total: null,
      },
      outcome: null,
    };
    const expectedTaxNames = ["CBS", "IBS estadual", "IBS municipal"];
    const expectedSourceUrls = [
      `${LAW}#art129`,
      "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular",
      "https://consumo.tributos.gov.br/",
    ];
    const memory = toCalculationView(result).itemViews[0]?.memory;
    const actualCbsMemory = memory?.taxes[0];
    const actualTaxNames = memory?.taxes.map((taxMemory) => taxMemory.taxName);
    const actualSourceUrls = memory?.sourceLinks.map((sourceLink) => sourceLink.url);

    expect(actualCbsMemory).toStrictEqual(expectedCbsMemory);
    expect(actualTaxNames).toStrictEqual(expectedTaxNames);
    expect(actualSourceUrls).toStrictEqual(expectedSourceUrls);
  });

  it("never says a UF or municipality adjusts the federal CBS", () => {
    const [schoolItem] = SCHOOL_RESULT.items;
    const rateStep = {
      step: "rate" as const,
      formula: "aliquota",
      values: { aliquota: "0.009" },
      result: "0.009",
    };
    const result: CalculationResult = {
      ...SCHOOL_RESULT,
      items:
        schoolItem?.status === "calculated" && schoolItem.taxes
          ? [
              {
                ...schoolItem,
                taxes: {
                  ...schoolItem.taxes,
                  cbs: {
                    ...schoolItem.taxes.cbs,
                    rateSource: "standard",
                    calculationSteps: [rateStep],
                  },
                  ibsUf: {
                    ...schoolItem.taxes.ibsUf,
                    rateSource: "standard",
                    calculationSteps: [rateStep],
                  },
                },
              },
            ]
          : [],
    };

    const expected = [
      "Alíquota de referência do ano.",
      "Alíquota de referência do ano, ajustada pela UF ou pelo município quando eles fixam a sua.",
    ];
    const memory = toCalculationView(result).itemViews[0]?.memory;
    const actual = memory?.taxes.slice(0, 2).map((taxMemory) => taxMemory.steps[0]?.origin);

    expect(actual).toStrictEqual(expected);
  });

  it("names the law once when the legal ground is the law itself", () => {
    const [schoolItem] = SCHOOL_RESULT.items;
    const result: CalculationResult = {
      ...SCHOOL_RESULT,
      items:
        schoolItem?.status === "calculated"
          ? [{ ...schoolItem, legalGround: { shortReference: "LC 214/2025", description: "Lei." } }]
          : [],
    };

    const expected = { label: "LC 214/2025", url: LAW };
    const actual = toCalculationView(result).itemViews[0]?.legalGround;

    expect(actual).toStrictEqual(expected);
  });

  it("points a rejected or out-of-scope item to the answer in the FAQ, without a memory", () => {
    const view = toCalculationView(SCHOOL_RESULT);

    const expectedHelpUrls = [null, "/duvidas/#item-rejeitado", "/duvidas/#fora-do-escopo"];
    const expectedMemories = [false, false];
    const actualHelpUrls = view.itemViews.map((itemView) => itemView.helpLink?.url ?? null);
    const actualMemories = view.itemViews.slice(1).map((itemView) => itemView.memory !== null);

    expect(actualHelpUrls).toStrictEqual(expectedHelpUrls);
    expect(actualMemories).toStrictEqual(expectedMemories);
  });

  it("explains a rejected item by its rule in Portuguese and keeps the other items", () => {
    const expectedViolations = [
      { ruleCode: "REG-011", explanation: "O NCM não está no anexo da classificação tributária." },
    ];
    const expectedStatuses = ["Calculado", "Rejeitado", "Fora do escopo"];
    const view = toCalculationView(SCHOOL_RESULT);
    const actualViolations = view.itemViews[1]?.violations;
    const actualStatuses = view.itemViews.map((itemView) => itemView.statusLabel);

    expect(actualViolations).toStrictEqual(expectedViolations);
    expect(actualStatuses).toStrictEqual(expectedStatuses);
  });

  it("falls back to the API message for a rule it has no explanation for", () => {
    const result: CalculationResult = {
      ...SCHOOL_RESULT,
      items: [
        {
          itemNumber: 1,
          status: "rejected",
          violations: [{ ruleCode: "REG-999", field: "items[0]", message: "Something new." }],
        },
      ],
    };

    const expectedExplanation = "Something new.";
    const actualExplanation = toCalculationView(result).itemViews[0]?.violations[0]?.explanation;

    expect(actualExplanation).toBe(expectedExplanation);
  });
});

describe("toCalculationView with the Imposto Seletivo", () => {
  const schoolItem = SCHOOL_RESULT.items[0];
  const cigarsResult: CalculationResult = {
    items:
      schoolItem?.status === "calculated" && schoolItem.taxes
        ? [
            {
              ...schoolItem,
              status: "simulated",
              taxes: { ...schoolItem.taxes, baseAmount: "2473.00" },
              selectiveTax: {
                cstCode: "000",
                cClassTrib: "000001",
                baseAmount: "2000.00",
                adValoremRate: "13.00",
                adRemRate: "21.30",
                unit: "VN",
                quantity: "10",
                amount: "473.00",
                treatmentDescription: "Tributação pelo Imposto Seletivo - Com Cálculo",
                rateSources: { adValorem: "nominal", adRem: "nominal" },
                calculationSteps: [],
              },
            },
          ]
        : [],
    totals: { ...SCHOOL_RESULT.totals, baseAmount: "2473.00", selectiveTaxAmount: "473.00" },
    dataVersion: "V0073",
  };

  it("shows the IS of the item with its rates, and the item value apart from it", () => {
    const expectedLine = { amount: "R$ 473,00", details: ["Alíq. 13,00%", "R$ 21,30 × 10 VN"] };
    const expectedValue = "R$ 2.000,00";
    const actual = toCalculationView(cigarsResult).itemViews[0];

    expect(actual?.selectiveTax).toStrictEqual(expectedLine);
    expect(actual?.valueAmount).toBe(expectedValue);
    expect(actual?.memory?.taxes[0]?.taxName).toBe("Imposto Seletivo");
  });

  it("adds the IS to the totals, and keeps it out of an operation without it", () => {
    const expectedTotal = { label: "IS", amount: "R$ 473,00" };
    const expectedBaseTotal = "R$ 2.000,00";
    const actual = toCalculationView(cigarsResult);
    const actualWithout = toCalculationView(SCHOOL_RESULT);

    expect(actual.totals.at(-1)).toStrictEqual(expectedTotal);
    expect(actual.baseTotal).toBe(expectedBaseTotal);
    expect(actualWithout.selectiveTaxTotal).toBeNull();
  });

  it("explains a rule about the IS group in its own words", () => {
    const result: CalculationResult = {
      ...SCHOOL_RESULT,
      items: [
        {
          itemNumber: 1,
          status: "rejected",
          violations: [
            {
              ruleCode: "REG-004",
              field: "items[0].selectiveTax.cstCode",
              message: "CST 000 does not exist for the Imposto Seletivo on 2026-03-10.",
            },
          ],
        },
      ],
    };

    const expected = "O CST do Imposto Seletivo não existe nessa data. O IS começa em 2027.";
    const actual = toCalculationView(result).itemViews[0]?.violations[0]?.explanation;

    expect(actual).toBe(expected);
  });
});
