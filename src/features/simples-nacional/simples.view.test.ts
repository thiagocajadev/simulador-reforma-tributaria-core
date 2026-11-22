import { describe, expect, it } from "vitest";
import type { CalculationResult } from "@/features/calculations/calculation.dto.ts";
import type { SimplesCalculationResult } from "./simples.dto.ts";
import { toComparisonView, toSimplesView } from "./simples.view.ts";

const REGULAR_RESULT: CalculationResult = {
  items: [],
  totals: {
    baseAmount: "1000.00",
    cbsAmount: "88.00",
    ibsUfAmount: "0.50",
    ibsMunAmount: "0.50",
    ibsAmount: "1.00",
    selectiveTaxAmount: "0.00",
  },
  dataVersion: "V0073",
};

const SIMPLES_RESULT: SimplesCalculationResult = {
  items: [
    {
      itemNumber: 1,
      status: "calculated",
      grossRevenue: "1000.00",
      revenueType: { code: 1, description: "Receita bruta - interna" },
      baseAmount: "1000.00",
      cbs: { rate: "2.3591", dueAmount: "23.59", pendingAmount: "0.00", calculationSteps: [] },
      ibs: { rate: "0.026", dueAmount: "0.26", pendingAmount: "0.00", calculationSteps: [] },
      selectiveTaxAmount: "0.00",
      itemTotal: "23.85",
    },
    {
      itemNumber: 2,
      status: "notCalculated",
      reason: "activityNotAllowed",
      grossRevenue: "500.00",
      revenueType: { code: 1, description: "Receita bruta - interna" },
    },
  ],
  totals: {
    grossRevenue: "1500.00",
    baseAmount: "1000.00",
    ibsDueAmount: "0.26",
    ibsPendingAmount: "0.00",
    cbsDueAmount: "23.59",
    cbsPendingAmount: "11.80",
    selectiveTaxAmount: "0.00",
    taxTotal: "23.85",
  },
  dataVersion: "V0073",
};

describe("toSimplesView", () => {
  it("shows the totals in Brazilian notation, pending values added up", () => {
    const result = SIMPLES_RESULT;

    const expected = [
      { label: "Receita bruta", amount: "R$ 1.500,00" },
      { label: "CBS devida", amount: "R$ 23,59" },
      { label: "IBS devido", amount: "R$ 0,26" },
      { label: "Pendente ou suspenso", amount: "R$ 11,80" },
    ];
    const actual = toSimplesView(result).totals;

    expect(actual).toStrictEqual(expected);
  });

  it("sums the due taxes for the comparison column, on its own", () => {
    const result = SIMPLES_RESULT;

    const expected = [
      { label: "CBS", amount: "R$ 23,59" },
      { label: "IBS", amount: "R$ 0,26" },
      { label: "Total", amount: "R$ 23,85" },
    ];
    const actual = toSimplesView(result).summaryLines;

    expect(actual).toStrictEqual(expected);
  });

  it("explains an item the activity left out, with its revenue", () => {
    const result = SIMPLES_RESULT;

    const expected = {
      statusLabel: "Não calculado",
      grossRevenue: "R$ 500,00",
      notice: "A atividade não é admitida neste documento; a receita entra só no total.",
    };
    const itemView = toSimplesView(result).itemViews[1];
    const actual = {
      statusLabel: itemView?.statusLabel,
      grossRevenue: itemView?.grossRevenue,
      notice: itemView?.notice,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("shows a dash for the IBS of CRT 2, which the Simples does not have", () => {
    const result: SimplesCalculationResult = {
      ...SIMPLES_RESULT,
      totals: SIMPLES_RESULT.totals
        ? { ...SIMPLES_RESULT.totals, ibsDueAmount: null, ibsPendingAmount: null }
        : null,
    };

    const expected = "-";
    const actual = toSimplesView(result).totals[2]?.amount;

    expect(actual).toBe(expected);
  });
});

describe("toSimplesView memory", () => {
  it("shows the steps of each tax that has them, with the Simples sources", () => {
    const [calculatedItem, ...otherItems] = SIMPLES_RESULT.items;
    const result: SimplesCalculationResult = {
      ...SIMPLES_RESULT,
      items:
        calculatedItem?.status === "calculated"
          ? [
              {
                ...calculatedItem,
                cbs: {
                  ...calculatedItem.cbs,
                  calculationSteps: [
                    {
                      step: "calculatedTax",
                      formula: "receitaBruta*fatorReceita*aliquota",
                      values: { receitaBruta: "1000", fatorReceita: "1", aliquota: "0.023591" },
                      result: "23.59",
                    },
                  ],
                },
              },
              ...otherItems,
            ]
          : [],
    };

    const expectedTaxNames = ["CBS"];
    const expectedSubstituted = "R$ 1.000,00 * 1 * 2,3591%";
    const expectedSourceUrls = [
      "https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional",
      "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm",
    ];
    const [itemView, notCalculatedView] = toSimplesView(result).itemViews;
    const actualTaxNames = itemView?.memory?.taxes.map((taxMemory) => taxMemory.taxName);
    const actualSubstituted = itemView?.memory?.taxes[0]?.steps[0]?.substitutedFormula;
    const actualSourceUrls = itemView?.memory?.sourceLinks.map((sourceLink) => sourceLink.url);
    const actualNotCalculatedMemory = notCalculatedView?.memory;

    expect(actualTaxNames).toStrictEqual(expectedTaxNames);
    expect(actualSubstituted).toBe(expectedSubstituted);
    expect(actualSourceUrls).toStrictEqual(expectedSourceUrls);
    expect(actualNotCalculatedMemory).toBeNull();
  });
});

describe("toSimplesView outcome", () => {
  it("says when the regime leaves the calculated value pending or drops it", () => {
    const [calculatedItem] = SIMPLES_RESULT.items;
    const step = {
      step: "calculatedTax" as const,
      formula: "receitaBruta*fatorReceita*aliquota",
      values: { receitaBruta: "1000", fatorReceita: "1", aliquota: "0.023591" },
      result: "23.59",
    };
    const result: SimplesCalculationResult = {
      ...SIMPLES_RESULT,
      items:
        calculatedItem?.status === "calculated"
          ? [
              {
                ...calculatedItem,
                cbs: {
                  rate: "2.3591",
                  dueAmount: "0.00",
                  pendingAmount: "23.59",
                  calculationSteps: [step],
                },
                ibs: {
                  rate: "0.026",
                  dueAmount: "0.00",
                  pendingAmount: "0.00",
                  calculationSteps: [step],
                },
              },
            ]
          : [],
    };

    const expected = [
      "Neste regime o valor calculado fica pendente (suspenso): não é devido nesta nota.",
      "Neste regime o valor calculado não é cobrado: fica zerado.",
    ];
    const actual = toSimplesView(result).itemViews[0]?.memory?.taxes.map(
      (taxMemory) => taxMemory.outcome,
    );

    expect(actual).toStrictEqual(expected);
  });
});

describe("toComparisonView", () => {
  it("compares the due totals and notes what stays pending", () => {
    const regular = REGULAR_RESULT;
    const simples = SIMPLES_RESULT;

    const expected = {
      regularLines: [
        { label: "CBS", amount: "R$ 88,00" },
        { label: "IBS", amount: "R$ 1,00" },
        { label: "Total", amount: "R$ 89,00" },
      ],
      difference: "No Simples Nacional, a operação recolhe R$ 65,15 a menos de CBS e IBS.",
      pendingNote: "Outros R$ 11,80 ficam pendentes ou suspensos no Simples Nacional.",
      coverageNote:
        "Algum item não foi calculado em um dos regimes; a comparação soma só os itens calculados.",
      sublimitNote: null,
    };
    const actual = toComparisonView({ regular, simples, isSublimitExceeded: false });

    expect(actual).toStrictEqual(expected);
  });

  it("says when the Simples collects more", () => {
    const regular = {
      ...REGULAR_RESULT,
      totals: { ...REGULAR_RESULT.totals, cbsAmount: "9.00", ibsAmount: "1.00" },
    };

    const expected = "No Simples Nacional, a operação recolhe R$ 13,85 a mais de CBS e IBS.";
    const actual = toComparisonView({
      regular,
      simples: SIMPLES_RESULT,
      isSublimitExceeded: false,
    }).difference;

    expect(actual).toBe(expected);
  });
});

describe("toComparisonView with CRT 2", () => {
  it("notes that the IBS leaves the Simples total", () => {
    const simples: SimplesCalculationResult = {
      ...SIMPLES_RESULT,
      totals: SIMPLES_RESULT.totals
        ? { ...SIMPLES_RESULT.totals, ibsDueAmount: null, ibsPendingAmount: null }
        : null,
    };

    const expected =
      "Com o sublimite excedido, o IBS sai do Simples e é recolhido pelo regime regular, fora deste total.";
    const actual = toComparisonView({
      regular: REGULAR_RESULT,
      simples,
      isSublimitExceeded: true,
    }).sublimitNote;

    expect(actual).toBe(expected);
  });

  it("leaves the note out for CRT 1, even when no item has IBS", () => {
    const simples: SimplesCalculationResult = {
      ...SIMPLES_RESULT,
      totals: SIMPLES_RESULT.totals
        ? { ...SIMPLES_RESULT.totals, ibsDueAmount: null, ibsPendingAmount: null }
        : null,
    };

    const expected = null;
    const actual = toComparisonView({
      regular: REGULAR_RESULT,
      simples,
      isSublimitExceeded: false,
    }).sublimitNote;

    expect(actual).toBe(expected);
  });
});
