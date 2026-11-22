// Calculates one Simples item, as SimplesNacionalCalculoService.calcularItem does: the gross
// revenue, the government purchase shift of the rates, then the revenue type and the regime decide
// how much of the revenue is taxed and whether the tax is due or pending. Every value is exact and
// rounded once, to 2 places HALF_EVEN; the item total adds the rounded values. A document with fixed
// rate places (the NFS-e: 2) rounds each rate to them after the government purchase shift. Each
// tax records its steps as formulas, so the screen can show what was executed.

import type { CalculationStep } from "@/features/calculations/calculation.dto.ts";
import {
  addDecimals,
  compareDecimals,
  type Decimal,
  formatDecimal,
  multiplyDecimals,
  parseDecimal,
  roundDecimal,
  shiftDecimalPoint,
  subtractDecimals,
} from "@/shared/math/decimal.ts";
import type {
  NotCalculatedReason,
  SimplesCalculatedItem,
  SimplesNotCalculatedItem,
  SimplesTax,
} from "./simples.dto.ts";
import type { SimplesRegimeFacts, ValueDestination } from "./simples.facts.ts";
import type { CalculableSimplesItem } from "./simples.validate.ts";

interface SimplesItemInput {
  itemNumber: number;
  calculable: CalculableSimplesItem;
  regime: SimplesRegimeFacts;
  governmentEntity: number | null;
  governmentPurchaseFactor: Decimal | null;
  rateDecimalPlaces: number | null;
}

interface RatePair {
  cbsRate: Decimal | null;
  ibsRate: Decimal | null;
}

interface TaxSplit {
  due: Decimal;
  pending: Decimal;
}

type SimplesTaxName = "cbs" | "ibs";

interface StepFormula {
  formula: string;
  variables: string[];
}

interface SimplesTaxInput {
  item: SimplesItemInput;
  tax: SimplesTaxName;
  rate: Decimal | null;
  grossRevenue: Decimal;
  revenueFactor: Decimal;
  destination: ValueDestination;
}

const ZERO = parseDecimal("0");
const ONE = parseDecimal("1");
const UNION = 1;
const MONEY_PLACES = 2;
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const REVENUE_ONLY_REGIME: NotCalculatedReason = "revenueOnlyRegime";
const RATE = { minPlaces: 2, maxPlaces: 4 };
const PERCENT_PLACES = -2;
const EXACT = { minPlaces: 0, maxPlaces: 40 };
const TAX_VALUE_FORMULA: StepFormula = {
  formula: "receitaBruta*fatorReceita*aliquota",
  variables: ["receitaBruta", "fatorReceita", "aliquota"],
};
const SHIFT_FORMULAS: Record<"union" | "otherEntity", Record<SimplesTaxName, StepFormula>> = {
  union: {
    cbs: { formula: "aliquotaCbs+aliquotaIbs", variables: ["aliquotaCbs", "aliquotaIbs"] },
    ibs: { formula: "0", variables: [] },
  },
  otherEntity: {
    cbs: {
      formula: "aliquotaCbs*(1-fatorCompraGov)",
      variables: ["aliquotaCbs", "fatorCompraGov"],
    },
    ibs: {
      formula: "aliquotaIbs+fatorCompraGov*aliquotaCbs",
      variables: ["aliquotaIbs", "fatorCompraGov", "aliquotaCbs"],
    },
  },
};

function calculateSimplesItem(input: SimplesItemInput) {
  const { itemNumber, calculable, regime } = input;
  const { revenueType } = calculable;
  const grossRevenue = computeGrossRevenue(calculable);
  const reason = regime.hasTaxCalculation ? calculable.notCalculatedReason : REVENUE_ONLY_REGIME;

  if (reason) {
    const notCalculated: SimplesNotCalculatedItem = {
      itemNumber,
      status: "notCalculated",
      reason,
      grossRevenue: formatDecimal(grossRevenue, MONEY),
      revenueType: { code: revenueType.code, description: revenueType.description },
    };
    return notCalculated;
  }

  const calculated = computeTaxes({ input, grossRevenue });
  return calculated;
}

// why: TRBS_IN_IS_COMPOE_RECEITA is 0 in every period, so the IS stays out of the revenue for now.
function computeGrossRevenue(calculable: CalculableSimplesItem) {
  const { revenueType, baseAmount, selectiveTaxAmount } = calculable;

  if (!revenueType.isRevenue) {
    return ZERO;
  }

  const revenue =
    revenueType.isSelectiveTaxRevenue && selectiveTaxAmount
      ? addDecimals(baseAmount, selectiveTaxAmount)
      : baseAmount;
  const grossRevenue = roundDecimal(revenue, MONEY_PLACES);
  return grossRevenue;
}

function computeTaxes(input: { input: SimplesItemInput; grossRevenue: Decimal }) {
  const { grossRevenue } = input;
  const { itemNumber, calculable, regime } = input.input;
  const { revenueType, selectiveTaxAmount } = calculable;
  const rates = roundLayoutRates(shiftGovernmentPurchaseRates(input.input), input.input);
  const revenueFactor = parseDecimal(revenueType.revenueFactor);
  const destination = revenueType.isPending ? regime.pendingDestination : regime.dueDestination;
  const shared = { item: input.input, grossRevenue, revenueFactor, destination };
  const cbs = computeSimplesTax({ ...shared, tax: "cbs", rate: rates.cbsRate });
  const ibs = regime.hasIbs
    ? computeSimplesTax({ ...shared, tax: "ibs", rate: rates.ibsRate })
    : null;
  const itemTotal = [ibs?.split.due ?? ZERO, cbs.split.due, selectiveTaxAmount ?? ZERO].reduce(
    addDecimals,
  );
  const calculated: SimplesCalculatedItem = {
    itemNumber,
    status: "calculated",
    grossRevenue: formatDecimal(grossRevenue, MONEY),
    revenueType: { code: revenueType.code, description: revenueType.description },
    baseAmount: formatDecimal(
      roundDecimal(multiplyDecimals(grossRevenue, revenueFactor), MONEY_PLACES),
      MONEY,
    ),
    cbs: cbs.result,
    ibs: ibs ? ibs.result : null,
    selectiveTaxAmount: selectiveTaxAmount ? formatDecimal(selectiveTaxAmount, MONEY) : null,
    itemTotal: formatDecimal(itemTotal, MONEY),
  };
  return calculated;
}

function computeSimplesTax(input: SimplesTaxInput) {
  const { rate, grossRevenue, revenueFactor, destination } = input;
  const value = computeTaxValue({ grossRevenue, revenueFactor, rate });
  const split = splitTax(value, destination);
  const result: SimplesTax = {
    rate: rate === null ? null : formatDecimal(rate, RATE),
    dueAmount: formatDecimal(split.due, MONEY),
    pendingAmount: formatDecimal(split.pending, MONEY),
    calculationSteps: describeSimplesSteps({ ...input, value }),
  };
  const computed = { split, result };
  return computed;
}

function describeSimplesSteps(input: SimplesTaxInput & { value: Decimal }) {
  const { rate, grossRevenue, revenueFactor, value } = input;

  if (rate === null) {
    const none: CalculationStep[] = [];
    return none;
  }

  const valueStep = describeStep({
    step: "calculatedTax",
    stepFormula: TAX_VALUE_FORMULA,
    values: { receitaBruta: grossRevenue, fatorReceita: revenueFactor, aliquota: toFraction(rate) },
    result: value,
  });
  const steps = [describeRateStep({ ...input, rate }), valueStep];
  return steps;
}

// why: the rate is the PGDAS effective rate the visitor typed; only a government buyer shifts it.
function describeRateStep(input: SimplesTaxInput & { rate: Decimal }) {
  const { item, tax, rate } = input;
  const { governmentEntity, governmentPurchaseFactor, calculable, rateDecimalPlaces } = item;
  const layoutRounding = rateDecimalPlaces === null ? {} : { roundedToPlaces: rateDecimalPlaces };

  if (governmentEntity === null) {
    const given: CalculationStep = {
      step: "rate",
      formula: null,
      values: {},
      result: formatDecimal(toFraction(rate), EXACT),
      ...layoutRounding,
    };
    return given;
  }

  const entityKind = governmentEntity === UNION ? "union" : "otherEntity";
  const rateStep = describeStep({
    step: "rate",
    stepFormula: SHIFT_FORMULAS[entityKind][tax],
    values: {
      aliquotaCbs: toFraction(calculable.cbsRate ?? ZERO),
      aliquotaIbs: toFraction(calculable.ibsRate ?? ZERO),
      fatorCompraGov: governmentPurchaseFactor ?? ZERO,
    },
    result: toFraction(rate),
  });
  const roundedStep: CalculationStep = { ...rateStep, ...layoutRounding };
  return roundedStep;
}

function describeStep(input: {
  step: CalculationStep["step"];
  stepFormula: StepFormula;
  values: Record<string, Decimal>;
  result: Decimal;
}) {
  const { step, stepFormula, values, result } = input;
  const entries = stepFormula.variables.map((name) => [
    name,
    formatDecimal(values[name] ?? ZERO, EXACT),
  ]);
  const described: CalculationStep = {
    step,
    formula: stepFormula.formula,
    values: Object.fromEntries(entries),
    result: formatDecimal(result, EXACT),
  };
  return described;
}

function toFraction(percent: Decimal) {
  const fraction = shiftDecimalPoint(percent, PERCENT_PLACES);
  return fraction;
}

// why: arts. 372 and 473 of LC 214/2025; the Union takes it all as CBS, other buyers a share.
function shiftGovernmentPurchaseRates(input: SimplesItemInput): RatePair {
  const { calculable, governmentEntity, governmentPurchaseFactor } = input;
  const { cbsRate, ibsRate } = calculable;

  if (governmentEntity === null || (cbsRate === null && ibsRate === null)) {
    const unshifted: RatePair = { cbsRate, ibsRate };
    return unshifted;
  }

  const cbs = cbsRate ?? ZERO;
  const ibs = ibsRate ?? ZERO;

  if (governmentEntity === UNION) {
    const unionRates: RatePair = { cbsRate: addDecimals(cbs, ibs), ibsRate: ZERO };
    return unionRates;
  }

  if (governmentPurchaseFactor === null) {
    throw new Error(`No government purchase factor for tpEnteGov ${governmentEntity}`);
  }

  const shifted: RatePair = {
    cbsRate: multiplyDecimals(subtractDecimals(ONE, governmentPurchaseFactor), cbs),
    ibsRate: addDecimals(ibs, multiplyDecimals(governmentPurchaseFactor, cbs)),
  };
  return shifted;
}

// why: AnexoVI of the NFS-e (rules 200 to 206): the value is base × the rate the layout prints.
function roundLayoutRates(rates: RatePair, input: SimplesItemInput) {
  const { rateDecimalPlaces } = input;

  if (rateDecimalPlaces === null) {
    return rates;
  }

  const roundRate = (rate: Decimal | null) =>
    rate === null ? null : roundDecimal(rate, rateDecimalPlaces);
  const rounded: RatePair = {
    cbsRate: roundRate(rates.cbsRate),
    ibsRate: roundRate(rates.ibsRate),
  };
  return rounded;
}

function computeTaxValue(input: {
  grossRevenue: Decimal;
  revenueFactor: Decimal;
  rate: Decimal | null;
}) {
  const { grossRevenue, revenueFactor, rate } = input;

  if (rate === null || compareDecimals(revenueFactor, ZERO) === 0) {
    return ZERO;
  }

  const exactValue = multiplyDecimals(
    multiplyDecimals(grossRevenue, revenueFactor),
    shiftDecimalPoint(rate, PERCENT_PLACES),
  );
  const taxValue = roundDecimal(exactValue, MONEY_PLACES);
  return taxValue;
}

function splitTax(value: Decimal, destination: ValueDestination) {
  const splitsByDestination: Record<ValueDestination, TaxSplit> = {
    DEVIDO: { due: value, pending: ZERO },
    PENDENTE_SUSPENSO: { due: ZERO, pending: value },
    ZERO: { due: ZERO, pending: ZERO },
  };
  const split = splitsByDestination[destination];
  return split;
}

export type { SimplesItemInput };
export { calculateSimplesItem, MONEY };
