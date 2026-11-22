import { describe, expect, it } from "vitest";
import type { CalculationStep } from "@/features/calculations/calculation.dto.ts";
import { tellTaxStory } from "./memory.story.ts";

function buildRegularSteps(input: { reduction: string; selectiveTax: string; due?: string }) {
  const { reduction, selectiveTax, due = "3.60" } = input;
  const steps: CalculationStep[] = [
    { step: "rate", formula: "aliquota", values: { aliquota: "0.009" }, result: "0.009" },
    {
      step: "effectiveRate",
      formula: "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
      values: { aliquota: "0.009", percentualReducao: reduction, pRedutorCompraGov: "0" },
      result: "0.0036",
    },
    {
      step: "base",
      formula: "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado",
      values: {
        baseCalculoInformada: "1000",
        impostoSeletivoInformado: selectiveTax,
        impostoSeletivoCalculado: "0",
      },
      result: "1000",
    },
    {
      step: "calculatedTax",
      formula: "baseCalculo*aliquotaEfetiva",
      values: { baseCalculo: "1000", aliquotaEfetiva: "0.0036" },
      result: "3.60",
    },
    {
      step: "taxDue",
      formula: "tributoCalculado",
      values: { tributoCalculado: "3.60" },
      result: due,
    },
  ];
  return steps;
}

describe("tellTaxStory", () => {
  it("tells a reduced tax in four sentences, with the due amount as the total", () => {
    const expected = {
      lines: [
        { text: "Alíquota do ano", equation: null, value: "0,90%" },
        { text: "Redução de 60% para este item", equation: "0,90% * (1 − 60%)", value: "0,36%" },
        { text: "Base de cálculo: o valor da operação", equation: null, value: "R$ 1.000,00" },
        { text: "A base vezes a alíquota", equation: "R$ 1.000,00 * 0,36%", value: "R$ 3,60" },
      ],
      total: "R$ 3,60",
    };
    const actual = tellTaxStory(
      buildRegularSteps({ reduction: "0.6", selectiveTax: "0" }),
      "regular",
    );

    expect(actual).toStrictEqual(expected);
  });

  it("leaves out a reduction of zero", () => {
    const steps = buildRegularSteps({ reduction: "0", selectiveTax: "0" });

    const expected = [
      "Alíquota do ano",
      "Base de cálculo: o valor da operação",
      "A base vezes a alíquota",
    ];
    const actual = tellTaxStory(steps, "regular").lines.map((line) => line.text);

    expect(actual).toStrictEqual(expected);
  });

  it("shows the Imposto Seletivo in the base only when there is one", () => {
    const steps = buildRegularSteps({ reduction: "0", selectiveTax: "50" });

    const expected = {
      text: "Base de cálculo, com o Imposto Seletivo",
      equation: "R$ 1.000,00 − R$ 50,00 + R$ 0,00",
      value: "R$ 1.000,00",
    };
    const actual = tellTaxStory(steps, "regular").lines[1];

    expect(actual).toStrictEqual(expected);
  });

  it("tells the Imposto Seletivo as its ad valorem part plus its ad rem part", () => {
    const steps: CalculationStep[] = [
      {
        step: "calculatedTax",
        formula: "baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem",
        values: {
          baseCalculo: "2000",
          aliquotaAdValorem: "0.13",
          quantidade: "10",
          aliquotaAdRem: "21.3",
        },
        result: "473",
      },
    ];
    const adValoremOnly: CalculationStep[] = [
      {
        ...steps[0],
        step: "calculatedTax",
        formula: "baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem",
        values: {
          baseCalculo: "2000",
          aliquotaAdValorem: "0.13",
          quantidade: "0",
          aliquotaAdRem: "0",
        },
        result: "260",
      },
    ];

    const expectedText = "A base vezes a alíquota ad valorem, mais a quantidade vezes a ad rem";
    const expectedOnlyText = "A base vezes a alíquota ad valorem";
    const actual = tellTaxStory(steps, "regular").lines[0];
    const actualOnly = tellTaxStory(adValoremOnly, "regular").lines[0];

    expect(actual?.text).toBe(expectedText);
    expect(actual?.equation).toContain(" + 10 * ");
    expect(actualOnly?.text).toBe(expectedOnlyText);
    expect(actualOnly?.equation).not.toContain("+");
  });

  it("adds the due amount as its own sentence when it differs from the calculated one", () => {
    const steps = buildRegularSteps({ reduction: "0", selectiveTax: "0", due: "0" });

    const expected = { text: "Valor devido", equation: null, value: "R$ 0,00" };
    const actual = tellTaxStory(steps, "regular").lines.at(-1);

    expect(actual).toStrictEqual(expected);
  });

  it("has no total when the steps stop at the rate", () => {
    const steps = buildRegularSteps({ reduction: "0", selectiveTax: "0" }).slice(0, 1);

    const expected = null;
    const actual = tellTaxStory(steps, "regular").total;

    expect(actual).toBe(expected);
  });

  it("keeps the Simples revenue factor in the equation and names the rate the visitor typed", () => {
    const steps: CalculationStep[] = [
      { step: "rate", formula: null, values: {}, result: "0.023591" },
      {
        step: "calculatedTax",
        formula: "receitaBruta*fatorReceita*aliquota",
        values: { receitaBruta: "1000", fatorReceita: "0.5", aliquota: "0.023591" },
        result: "11.80",
      },
    ];

    const expected = [
      {
        text: "Alíquota efetiva do Simples, a que você informou",
        equation: null,
        value: "2,3591%",
      },
      {
        text: "A base vezes a alíquota",
        equation: "R$ 1.000,00 * 0,5 * 2,3591%",
        value: "R$ 11,80",
      },
    ];
    const actual = tellTaxStory(steps, "simples").lines;

    expect(actual).toStrictEqual(expected);
  });

  it("writes the government reducer in Brazilian notation", () => {
    const steps = buildRegularSteps({ reduction: "0", selectiveTax: "0" }).map((step) =>
      step.step === "effectiveRate"
        ? { ...step, values: { ...step.values, pRedutorCompraGov: "12.5" } }
        : step,
    );

    const expected = "Redutor de compra governamental de 12,5%";
    const actual = tellTaxStory(steps, "regular").lines[1]?.text;

    expect(actual).toBe(expected);
  });
});
