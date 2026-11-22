// The Imposto Seletivo of one item, as CalculoImpostoSeletivoService.calcularImpostoSeletivo
// computes it since 1.7.2: the base is the item value rounded to 2 places; the ad valorem rate
// (percent) and the ad rem rate (reais per unit) are rounded to 4 places; the treatment's
// formulas run exactly (baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem for TRTR 1, 0 for
// TRTR 2) and the tax is rounded once, to 2 places, HALF_EVEN. A missing rate counts as zero.

import {
  compareDecimals,
  type Decimal,
  formatDecimal,
  parseDecimal,
  roundDecimal,
  shiftDecimalPoint,
} from "@/shared/math/decimal.ts";
import type { OperationItem, SelectiveTaxResult } from "./calculation.dto.ts";
import type { SelectiveTaxRatesFacts, SelectiveTaxTreatmentFacts } from "./calculation.facts.ts";
import type { FormulaValues } from "./formula.evaluate.ts";
import { resolveSelectiveTaxRates } from "./selective.tax.rates.ts";
import { evaluateStep } from "./tax.calculate.ts";

interface SelectiveTaxCalculationInput {
  item: OperationItem;
  treatment: SelectiveTaxTreatmentFacts;
  rates: SelectiveTaxRatesFacts;
}

const MONEY_PLACES = 2;
const RATE_PLACES = 4;
const QUANTITY_PLACES = 4;
const PERCENT_TO_FRACTION = -2;
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const RATE = { minPlaces: 2, maxPlaces: 4 };
const WHOLE = { minPlaces: 0, maxPlaces: 0 };
const FRACTIONAL = { minPlaces: QUANTITY_PLACES, maxPlaces: QUANTITY_PLACES };
const ZERO = parseDecimal("0");

function calculateSelectiveTax(input: SelectiveTaxCalculationInput) {
  const { item, treatment, rates } = input;
  const group = item.selectiveTax;

  if (!group) {
    throw new Error(`Item ${item.itemNumber} has no Imposto Seletivo group to calculate`);
  }

  const resolved = resolveSelectiveTaxRates(item, rates);
  const adValorem = resolved.adValorem ? roundRate(parseDecimal(resolved.adValorem.rate)) : null;
  const adRem = resolved.adRem ? roundRate(parseDecimal(resolved.adRem.rate)) : null;
  const quantity = group.quantity ? parseDecimal(group.quantity) : ZERO;
  const steps = evaluateSelectiveTaxFormulas({
    treatment,
    values: {
      baseCalculoInformada: parseDecimal(item.baseAmount),
      aliquotaAdValorem: adValorem ? shiftDecimalPoint(adValorem, PERCENT_TO_FRACTION) : ZERO,
      aliquotaAdRem: adRem ?? ZERO,
      quantidade: quantity,
    },
  });
  const result: SelectiveTaxResult = {
    cstCode: group.cstCode,
    cClassTrib: group.cClassTrib,
    baseAmount: formatDecimal(steps.base, MONEY),
    adValoremRate: adValorem ? formatDecimal(adValorem, RATE) : null,
    adRemRate: adRem ? formatDecimal(adRem, RATE) : null,
    unit: adRem ? (group.unit ?? null) : null,
    quantity: adRem ? formatQuantity(quantity) : null,
    amount: formatDecimal(steps.taxDue, MONEY),
    treatmentDescription: treatment.description,
    rateSources: {
      adValorem: resolved.adValorem?.source ?? null,
      adRem: resolved.adRem?.source ?? null,
    },
    calculationSteps: steps.records,
  };
  return result;
}

function evaluateSelectiveTaxFormulas(input: {
  treatment: SelectiveTaxTreatmentFacts;
  values: FormulaValues;
}) {
  const { treatment, values } = input;
  const { formulas } = treatment;
  const base = evaluateStep({
    step: "base",
    formula: formulas.base,
    values,
    settle: roundMoney,
  });
  const withBase: FormulaValues = { ...values, baseCalculo: base.value };
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
  const evaluated = [base, calculatedTax, taxDue].flatMap((step) => (step ? [step] : []));
  const figures = {
    base: base.value,
    taxDue: (taxDue ?? calculatedTax).value,
    records: evaluated.map((step) => step.record),
  };
  return figures;
}

// why: qTrib is TDec1104, printed as a whole number or with 4 places (BigDecimalTDec1104Serializer).
function formatQuantity(quantity: Decimal) {
  const isWhole = compareDecimals(roundDecimal(quantity, 0), quantity) === 0;
  const text = formatDecimal(quantity, isWhole ? WHOLE : FRACTIONAL);
  return text;
}

function roundRate(rate: Decimal) {
  const rounded = roundDecimal(rate, RATE_PLACES);
  return rounded;
}

function roundMoney(value: Decimal) {
  const rounded = roundDecimal(value, MONEY_PLACES);
  return rounded;
}

export { calculateSelectiveTax };
