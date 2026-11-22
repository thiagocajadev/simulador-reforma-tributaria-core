// CBS, IBS UF and IBS Mun of one item, as CalculoCbsIbsService.calcularCbsIbs computes them: the
// rate by rate type, then the treatment's formulas in order. Rates travel as fractions inside the
// calculation; the rate and the effective rate are published once, at 4 places in percentage
// points, and the published value is the one that multiplies the base (ADR003 upstream). Each
// formula that runs is recorded as a CalculationStep, so the screen can show what was executed.

import type { TaxName } from "@/features/rates/rates.dto.ts";
import {
  addDecimals,
  compareDecimals,
  type Decimal,
  formatDecimal,
  parseDecimal,
  roundDecimal,
  shiftDecimalPoint,
} from "@/shared/math/decimal.ts";
import type {
  CalculationStep,
  CalculationStepName,
  ItemTaxes,
  NominalRates,
  OperationItem,
  RateSource,
  TaxResult,
} from "./calculation.dto.ts";
import type { TaxPercents, TreatmentFacts } from "./calculation.facts.ts";
import { calculateFormula, type FormulaValues, listFormulaVariables } from "./formula.evaluate.ts";

interface LocationRate {
  applicable: string;
  reference: string;
}

type LocationRates = Record<TaxName, LocationRate | null>;

interface TaxInput {
  item: OperationItem;
  hasReductionGroup: boolean;
  rateType: string;
  treatment: TreatmentFacts;
  reductionPercents: TaxPercents;
  classificationRates: TaxPercents;
  locationRates: LocationRates;
  selectiveTaxAmount: Decimal;
}

interface ResolvedRate {
  rate: Decimal;
  source: RateSource;
  isPercentage: boolean;
}

interface TaxFigures {
  rate: Decimal;
  effectiveRate: Decimal | null;
  reduction: Decimal | null;
  base: Decimal;
  taxDue: Decimal;
  steps: CalculationStep[];
}

interface EvaluatedStep {
  value: Decimal;
  record: CalculationStep;
}

interface TaxComputation {
  base: Decimal;
  result: TaxResult;
}

type ItemTaxesOutcome =
  | { kind: "calculated"; taxes: ItemTaxes }
  | { kind: "missingRate"; tax: TaxName; rateType: string };

type TaxOutcome = { kind: "calculated"; computation: TaxComputation } | { kind: "missingRate" };

const TAX_ORDER: TaxName[] = ["CBS", "IBS_UF", "IBS_MUN"];
const NOMINAL_RATE_FIELD: Record<TaxName, keyof NominalRates> = {
  CBS: "cbsRate",
  IBS_UF: "ibsUfRate",
  IBS_MUN: "ibsMunRate",
};
const MONEY_PLACES = 2;
const PUBLISHED_RATE_PLACES = 4;
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const RATE = { minPlaces: 2, maxPlaces: 4 };
const EXACT = { minPlaces: 0, maxPlaces: 40 };
const PERCENT_TO_FRACTION = -2;
const FRACTION_TO_PERCENT = 2;
const ZERO = parseDecimal("0");
const ONE = parseDecimal("1");
const RATE_VARIABLE = /\baliquota\b/;
const FORCED_STANDARD_CLASSIFICATION = "510001";
const RATE_SOURCES: Record<string, RateSource> = {
  Padrão: "standard",
  "Uniforme nacional (referência)": "reference",
};

function calculateItemTaxes(input: TaxInput) {
  const outcomes = TAX_ORDER.map((tax) => calculateTax({ ...input, tax }));
  const missingPosition = outcomes.findIndex((outcome) => outcome.kind === "missingRate");

  if (missingPosition >= 0) {
    const missing: ItemTaxesOutcome = {
      kind: "missingRate",
      tax: TAX_ORDER[missingPosition] ?? "CBS",
      rateType: input.rateType,
    };
    return missing;
  }

  const [cbs, ibsUf, ibsMun] = outcomes.map(toComputation);
  const calculated: ItemTaxesOutcome = {
    kind: "calculated",
    taxes: assembleTaxes({ cbs, ibsUf, ibsMun }),
  };
  return calculated;
}

function calculateTax(input: TaxInput & { tax: TaxName }): TaxOutcome {
  const resolved = resolveRate(input);

  if (!resolved) {
    const missing: TaxOutcome = { kind: "missingRate" };
    return missing;
  }

  const computation = applyFormulas({ ...input, resolved });
  const calculated: TaxOutcome = { kind: "calculated", computation };
  return calculated;
}

// why: classification 510001 is forced to the standard rate (CalculoCbsIbsService.java:211).
function resolveRate(input: TaxInput & { tax: TaxName }) {
  const { tax, item } = input;
  const rateType = item.cClassTrib === FORCED_STANDARD_CLASSIFICATION ? "Padrão" : input.rateType;
  const nominalRate = item.nominalRates?.[NOMINAL_RATE_FIELD[tax]];

  if (nominalRate !== undefined) {
    const nominal: ResolvedRate = {
      rate: toFraction(nominalRate),
      source: "nominal",
      isPercentage: true,
    };
    return nominal;
  }

  if (rateType === "Sem alíquota") {
    const noRate: ResolvedRate = { rate: ZERO, source: "none", isPercentage: false };
    return noRate;
  }

  const storedRate = findStoredRate({ ...input, rateType });
  const source = RATE_SOURCES[rateType] ?? "classification";
  const resolved: ResolvedRate | null = storedRate
    ? { rate: toFraction(storedRate), source, isPercentage: true }
    : null;
  return resolved;
}

function findStoredRate(input: TaxInput & { tax: TaxName }) {
  const { tax, rateType, classificationRates, locationRates } = input;

  switch (rateType) {
    case "Padrão": {
      const standardRate = requireLocationRate(locationRates, tax).applicable;
      return standardRate;
    }
    case "Uniforme nacional (referência)": {
      const referenceRate = requireLocationRate(locationRates, tax).reference;
      return referenceRate;
    }
    default: {
      const classificationRate = classificationRates[tax];
      return classificationRate;
    }
  }
}

function requireLocationRate(locationRates: LocationRates, tax: TaxName) {
  const locationRate = locationRates[tax];

  if (!locationRate) {
    throw new Error(`No reference rate for ${tax} on the operation date`);
  }

  return locationRate;
}

function applyFormulas(input: TaxInput & { tax: TaxName; resolved: ResolvedRate }) {
  const figures = computeTaxFigures(input);
  const hasReductionGroup =
    input.hasReductionGroup && figures.reduction !== null && figures.effectiveRate !== null;
  const computation: TaxComputation = {
    base: figures.base,
    result: formatTaxResult({ figures, resolved: input.resolved, hasReductionGroup }),
  };
  return computation;
}

function computeTaxFigures(input: TaxInput & { tax: TaxName; resolved: ResolvedRate }) {
  const { tax, item, treatment, reductionPercents, resolved } = input;
  const { formulas } = treatment;
  const reduction = treatment.hasReduction ? requireReduction(reductionPercents, tax) : null;
  const shared: FormulaValues = { quantidade: ONE, percentualReducao: reduction ?? ZERO };
  const publish = (raw: Decimal) => publishIfPercentage(raw, resolved);
  const rate = calculateRate({ formula: formulas.rate, resolved, shared });
  const effectiveRate = formulas.effectiveRate
    ? evaluateStep({
        step: "effectiveRate",
        formula: formulas.effectiveRate,
        values: { ...shared, aliquota: rate.value },
        settle: publish,
      })
    : null;
  const informed: FormulaValues = {
    ...shared,
    aliquota: rate.value,
    aliquotaEfetiva: effectiveRate?.value ?? ZERO,
    baseCalculoInformada: parseDecimal(item.baseAmount),
    impostoSeletivoCalculado: input.selectiveTaxAmount,
  };
  const base = evaluateStep({
    step: "base",
    formula: formulas.base,
    values: informed,
    settle: (raw) => clampToZero(roundMoney(raw)),
  });
  const withBase: FormulaValues = { ...informed, baseCalculo: base.value };
  const calculatedTax = evaluateStep({
    step: "calculatedTax",
    formula: formulas.calculatedTax,
    values: withBase,
    settle: roundMoney,
  });
  const taxDue = formulas.taxDue
    ? evaluateStep({
        step: "taxDue",
        formula: formulas.taxDue,
        values: { ...withBase, tributoCalculado: calculatedTax.value },
        settle: roundMoney,
      })
    : null;
  const evaluated = [rate, effectiveRate, base, calculatedTax, taxDue].filter(isEvaluated);
  const figures: TaxFigures = {
    rate: rate.value,
    effectiveRate: effectiveRate?.value ?? null,
    reduction,
    base: base.value,
    taxDue: (taxDue ?? calculatedTax).value,
    steps: evaluated.map((step) => step.record),
  };
  return figures;
}

function formatTaxResult(input: {
  figures: TaxFigures;
  resolved: ResolvedRate;
  hasReductionGroup: boolean;
}) {
  const { figures, resolved, hasReductionGroup } = input;
  const { rate, effectiveRate, reduction, taxDue, steps } = figures;
  const result: TaxResult = {
    rate: formatDecimal(toPublishedScale(rate, resolved), RATE),
    reductionPercent:
      hasReductionGroup && reduction
        ? formatDecimal(shiftDecimalPoint(reduction, FRACTION_TO_PERCENT), RATE)
        : null,
    effectiveRate:
      hasReductionGroup && effectiveRate
        ? formatDecimal(toPublishedScale(effectiveRate, resolved), RATE)
        : null,
    amount: formatDecimal(taxDue, MONEY),
    rateSource: resolved.source,
    calculationSteps: steps,
  };
  return result;
}

// why: a nominal rate prevails over a fixed rate formula such as "0" (CalculoCbsIbsService.java:295).
function calculateRate(input: {
  formula: string | null;
  resolved: ResolvedRate;
  shared: FormulaValues;
}) {
  const { formula, resolved, shared } = input;
  const isRateUsed = formula !== null && RATE_VARIABLE.test(formula);
  const settle = (raw: Decimal) => publishIfPercentage(raw, resolved);

  if ((resolved.source === "nominal" && !isRateUsed) || formula === null) {
    const value = settle(resolved.rate);
    const given: EvaluatedStep = {
      value,
      record: { step: "rate", formula: null, values: {}, result: formatExact(value) },
    };
    return given;
  }

  const rate = evaluateStep({
    step: "rate",
    formula,
    values: { ...shared, aliquota: resolved.rate },
    settle,
  });
  return rate;
}

// Runs one formula, settles its value (publishing, rounding) and records what it consumed.
function evaluateStep(input: {
  step: CalculationStepName;
  formula: string;
  values: FormulaValues;
  settle: (raw: Decimal) => Decimal;
}) {
  const { step, formula, values, settle } = input;
  const value = settle(calculateFormula(formula, values));
  const record: CalculationStep = {
    step,
    formula,
    values: describeFormulaValues(formula, values),
    result: formatExact(value),
  };
  const evaluated: EvaluatedStep = { value, record };
  return evaluated;
}

function describeFormulaValues(formula: string, values: FormulaValues) {
  const entries = listFormulaVariables(formula).map((name) => [
    name,
    formatExact(values[name] ?? ZERO),
  ]);
  const described: Record<string, string> = Object.fromEntries(entries);
  return described;
}

function isEvaluated(step: EvaluatedStep | null): step is EvaluatedStep {
  const isPresent = step !== null;
  return isPresent;
}

function formatExact(value: Decimal) {
  const text = formatDecimal(value, EXACT);
  return text;
}

function publishIfPercentage(fraction: Decimal, resolved: ResolvedRate) {
  if (!resolved.isPercentage) {
    return fraction;
  }

  const percentage = roundDecimal(
    shiftDecimalPoint(fraction, FRACTION_TO_PERCENT),
    PUBLISHED_RATE_PLACES,
  );
  const published = shiftDecimalPoint(percentage, PERCENT_TO_FRACTION);
  return published;
}

function toPublishedScale(fraction: Decimal, resolved: ResolvedRate) {
  const published = resolved.isPercentage
    ? shiftDecimalPoint(fraction, FRACTION_TO_PERCENT)
    : fraction;
  return published;
}

function requireReduction(reductionPercents: TaxPercents, tax: TaxName) {
  const percent = reductionPercents[tax];

  if (percent === null) {
    throw new Error(`The treatment has a reduction, but PERCENTUAL_REDUCAO has none for ${tax}`);
  }

  const reduction = toFraction(percent);
  return reduction;
}

function roundMoney(value: Decimal) {
  const rounded = roundDecimal(value, MONEY_PLACES);
  return rounded;
}

function clampToZero(value: Decimal) {
  const clamped = compareDecimals(value, ZERO) < 0 ? ZERO : value;
  return clamped;
}

function toFraction(percent: string) {
  const fraction = shiftDecimalPoint(parseDecimal(percent), PERCENT_TO_FRACTION);
  return fraction;
}

function toComputation(outcome: TaxOutcome) {
  if (outcome.kind !== "calculated") {
    throw new Error("Every tax must be calculated before the item taxes are assembled");
  }

  return outcome.computation;
}

function assembleTaxes(input: {
  cbs?: TaxComputation;
  ibsUf?: TaxComputation;
  ibsMun?: TaxComputation;
}) {
  const { cbs, ibsUf, ibsMun } = input;

  if (!cbs || !ibsUf || !ibsMun) {
    throw new Error("CBS, IBS UF and IBS Mun must all be calculated");
  }

  const ibsAmount = addDecimals(
    parseDecimal(ibsUf.result.amount),
    parseDecimal(ibsMun.result.amount),
  );
  const taxes: ItemTaxes = {
    baseAmount: formatDecimal(cbs.base, MONEY),
    cbs: cbs.result,
    ibsUf: ibsUf.result,
    ibsMun: ibsMun.result,
    ibsAmount: formatDecimal(ibsAmount, MONEY),
  };
  return taxes;
}

export type { ItemTaxesOutcome, LocationRate, LocationRates };
export { calculateItemTaxes, evaluateStep };
