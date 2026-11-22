// The calculation memory told as a short story, for a reader who does not know the formulas: one
// numbered sentence per step that changed the amount, with its value, and at most one short
// equation. Steps that changed nothing (no reduction, no Imposto Seletivo, a due amount equal to the
// calculated one) stay out; the full formulas remain one click away (formula.present.ts).

import type { CalculationStep } from "@/features/calculations/calculation.dto.ts";
import { type CalculationRegime, formatStepValue } from "./formula.present.ts";

interface StoryLine {
  text: string;
  equation: string | null;
  value: string;
}

interface TaxStory {
  lines: StoryLine[];
  total: string | null;
}

const TRAILING_ZERO_DECIMALS = /,0+%$/;
const RATE_TEXTS = {
  regular: "Alíquota do ano",
  typed: "Alíquota efetiva do Simples, a que você informou",
  shifted: "Alíquota ajustada para a compra governamental",
};
const AMOUNT_STEPS = new Set<CalculationStep["step"]>(["calculatedTax", "taxDue"]);

function tellTaxStory(steps: CalculationStep[], regime: CalculationRegime) {
  const lines = steps.flatMap((step, position) => {
    const told = tellStep(step, { previous: steps[position - 1] ?? null, regime });
    const kept = told ? [told] : [];
    return kept;
  });
  const amountStep = steps.findLast((step) => AMOUNT_STEPS.has(step.step));
  const story: TaxStory = {
    lines,
    total: amountStep ? formatStepValue(amountStep.result, "money") : null,
  };
  return story;
}

function tellStep(
  step: CalculationStep,
  context: { previous: CalculationStep | null; regime: CalculationRegime },
) {
  const { previous, regime } = context;

  switch (step.step) {
    case "rate": {
      const line = tellRate(step, regime);
      return line;
    }
    case "effectiveRate": {
      const line = tellEffectiveRate(step);
      return line;
    }
    case "base": {
      const line = tellBase(step);
      return line;
    }
    case "calculatedTax": {
      const line = tellCalculatedTax(step);
      return line;
    }
    case "taxDue": {
      const isSameAsCalculated = previous !== null && previous.result === step.result;
      const line = isSameAsCalculated ? null : tellPlain("Valor devido", step, "money");
      return line;
    }
  }
}

// why: the Simples rate is the PGDAS-D one the visitor typed, unless a government purchase shifts
// it by a formula; the regular rate is the reference of the year (or the one typed from 2027).
function tellRate(step: CalculationStep, regime: CalculationRegime) {
  const isShifted = regime === "simples" && step.formula !== null;
  const text = RATE_TEXTS[regime === "simples" ? (isShifted ? "shifted" : "typed") : "regular"];
  const line = tellPlain(text, step, "fraction");
  return line;
}

function tellEffectiveRate(step: CalculationStep) {
  const { aliquota, percentualReducao, pRedutorCompraGov } = step.values;

  if (aliquota === undefined || percentualReducao === undefined) {
    const generic = tellPlain("Alíquota efetiva", step, "fraction");
    return generic;
  }

  const hasReduction = !isZero(percentualReducao);
  const hasGovernmentReducer = pRedutorCompraGov !== undefined && !isZero(pRedutorCompraGov);

  if (!hasReduction && !hasGovernmentReducer) {
    return null;
  }

  const reduction = toFriendlyPercent(percentualReducao);
  const clauses = [
    hasReduction ? `Redução de ${reduction} para este item` : null,
    hasGovernmentReducer
      ? `redutor de compra governamental de ${formatStepValue(pRedutorCompraGov ?? "0", "number")}%`
      : null,
  ].filter((clause) => clause !== null);
  const rate = formatStepValue(aliquota, "fraction");
  const value = formatStepValue(step.result, "fraction");
  const line: StoryLine = {
    text: capitalize(clauses.join(", e ")),
    equation: hasReduction && !hasGovernmentReducer ? `${rate} * (1 − ${reduction})` : null,
    value,
  };
  return line;
}

function tellBase(step: CalculationStep) {
  const { baseCalculoInformada, impostoSeletivoInformado, impostoSeletivoCalculado } = step.values;
  const hasSelectiveTax = [impostoSeletivoInformado, impostoSeletivoCalculado].some(
    (amount) => amount !== undefined && !isZero(amount),
  );
  const value = formatStepValue(step.result, "money");

  if (!hasSelectiveTax || baseCalculoInformada === undefined) {
    const line: StoryLine = { text: "Base de cálculo: o valor da operação", equation: null, value };
    return line;
  }

  const equation = [
    formatStepValue(baseCalculoInformada, "money"),
    `− ${formatStepValue(impostoSeletivoInformado ?? "0", "money")}`,
    `+ ${formatStepValue(impostoSeletivoCalculado ?? "0", "money")}`,
  ].join(" ");
  const line: StoryLine = { text: "Base de cálculo, com o Imposto Seletivo", equation, value };
  return line;
}

// why: the Simples multiplies the gross revenue by a revenue factor too; a factor of 1 says nothing.
function tellCalculatedTax(step: CalculationStep) {
  if (step.values.aliquotaAdValorem !== undefined) {
    const selectiveTaxLine = tellSelectiveTax(step);
    return selectiveTaxLine;
  }

  const { baseCalculo, aliquotaEfetiva, receitaBruta, fatorReceita, aliquota } = step.values;
  const base = baseCalculo ?? receitaBruta;
  const rate = aliquotaEfetiva ?? aliquota;
  const factor =
    fatorReceita !== undefined && Number(fatorReceita) !== 1
      ? [formatStepValue(fatorReceita, "number")]
      : [];
  const equation =
    base !== undefined && rate !== undefined
      ? [formatStepValue(base, "money"), ...factor, formatStepValue(rate, "fraction")].join(" * ")
      : null;
  const line: StoryLine = {
    text: "A base vezes a alíquota",
    equation,
    value: formatStepValue(step.result, "money"),
  };
  return line;
}

// why: the Imposto Seletivo adds an ad valorem part (on the base) and an ad rem part (per unit);
// a part whose rate is zero says nothing, so it stays out of the sentence and the equation.
function tellSelectiveTax(step: CalculationStep) {
  const { baseCalculo, aliquotaAdValorem, quantidade, aliquotaAdRem } = step.values;
  const hasAdValorem = aliquotaAdValorem !== undefined && !isZero(aliquotaAdValorem);
  const hasAdRem = aliquotaAdRem !== undefined && !isZero(aliquotaAdRem);
  const adValorem = hasAdValorem
    ? [
        `${formatStepValue(baseCalculo ?? "0", "money")} * ${formatStepValue(aliquotaAdValorem ?? "0", "fraction")}`,
      ]
    : [];
  const adRem = hasAdRem
    ? [
        `${formatStepValue(quantidade ?? "0", "number")} * ${formatStepValue(aliquotaAdRem ?? "0", "money")}`,
      ]
    : [];
  const text =
    hasAdValorem && hasAdRem
      ? "A base vezes a alíquota ad valorem, mais a quantidade vezes a ad rem"
      : hasAdRem
        ? "A quantidade vezes a alíquota ad rem"
        : "A base vezes a alíquota ad valorem";
  const parts = [...adValorem, ...adRem];
  const line: StoryLine = {
    text,
    equation: parts.length > 0 ? parts.join(" + ") : null,
    value: formatStepValue(step.result, "money"),
  };
  return line;
}

function tellPlain(text: string, step: CalculationStep, kind: "money" | "fraction") {
  const line: StoryLine = { text, equation: null, value: formatStepValue(step.result, kind) };
  return line;
}

function capitalize(text: string) {
  const capitalized = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  return capitalized;
}

function isZero(value: string) {
  const zero = Number(value) === 0;
  return zero;
}

// why: "60%" reads better than "60,00%" in a sentence; a rate like 0,90% keeps its places.
function toFriendlyPercent(fraction: string) {
  const friendly = formatStepValue(fraction, "fraction").replace(TRAILING_ZERO_DECIMALS, "%");
  return friendly;
}

export type { StoryLine, TaxStory };
export { tellTaxStory };
