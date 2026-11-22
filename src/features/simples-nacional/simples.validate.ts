// The upstream item rules of the Simples endpoints, in the order ProcessadorItemSimples.processarItem
// applies them. Unlike the regular regime, upstream collects every error of an item before it gives
// up, so an item can carry several violations. Codes come from CodigoValidacaoSimples.java; the NCM
// and NBS rules live in simples.nomenclature.ts. On the NF-e and NFC-e the rates come with the item;
// on the NFS-e they come from the rate pair simples.pair.choose.ts picks in the company's line.

import type { RuleViolation } from "@/features/calculations/calculation.dto.ts";
import { compareDecimals, type Decimal, parseDecimal } from "@/shared/math/decimal.ts";
import type { NotCalculatedReason, SimplesOperationItem } from "./simples.dto.ts";
import type {
  IssSituationFacts,
  RevenueTypeFacts,
  SimplesDocumentFacts,
  SimplesItemFacts,
  SimplesRegimeFacts,
} from "./simples.facts.ts";
import {
  checkClassificationNomenclature,
  checkNomenclatureStructure,
  type ViolationInput,
} from "./simples.nomenclature.ts";
import {
  assessIssFields,
  chooseRatePair,
  type EffectiveRateLine,
  type PairFacts,
} from "./simples.pair.choose.ts";

// why: the rate line is null when the regime calculates no taxes, since it is then never read.
interface NfseItemContext {
  rateLine: EffectiveRateLine | null;
  situations: IssSituationFacts[];
  operationFacts: PairFacts;
}

interface SimplesItemContext {
  position: number;
  item: SimplesOperationItem;
  facts: SimplesItemFacts;
  document: SimplesDocumentFacts;
  regime: SimplesRegimeFacts;
  revenueTypes: Map<number, RevenueTypeFacts>;
  allowsSelectiveTax: boolean;
  nfse: NfseItemContext | null;
}

interface CalculableSimplesItem {
  kind: "calculable";
  revenueType: RevenueTypeFacts;
  baseAmount: Decimal;
  selectiveTaxAmount: Decimal | null;
  cbsRate: Decimal | null;
  ibsRate: Decimal | null;
  notCalculatedReason: NotCalculatedReason | null;
}

type SimplesItemAssessment =
  | { kind: "notImplemented" }
  | { kind: "rejected"; violations: RuleViolation[] }
  | CalculableSimplesItem;

interface ActivityCheck {
  reason: NotCalculatedReason | null;
}

interface ItemRates {
  cbsRate: Decimal | null;
  ibsRate: Decimal | null;
}

interface PairRatesInput {
  context: SimplesItemContext;
  nfse: NfseItemContext;
  needsCbsRate: boolean;
  needsIbsRate: boolean;
  reject: (input: ViolationInput) => void;
}

const ZERO_NCM_CODES = new Set(["00", "00000000"]);
const AMOUNT = /^\d{1,13}(?:\.\d{1,2})?$/;
const RATE = /^\d{1,3}(?:\.\d{1,34})?$/;
const ZERO = parseDecimal("0");
const NO_RATES: ItemRates = { cbsRate: null, ibsRate: null };
const EFFECTIVE_RATES = "effectiveRates";

function assessSimplesItem(context: SimplesItemContext): SimplesItemAssessment {
  if (context.facts.hasAdjustment) {
    const notImplemented: SimplesItemAssessment = { kind: "notImplemented" };
    return notImplemented;
  }

  const violations: RuleViolation[] = [];
  const reject = (input: ViolationInput) => violations.push(toViolation(context, input));
  const codes = clearZeroNcm(context);
  const baseAmount = readAmount(context.item.baseAmount, {
    field: "baseAmount",
    missingCode: "VSN-001",
    invalidCode: "VSN-002",
    reject,
  });
  const isStructureValid = checkNomenclatureStructure({ context, codes, reject });
  const selectiveTaxAmount = context.allowsSelectiveTax
    ? readAmount(context.item.selectiveTaxAmount ?? "0.00", {
        field: "selectiveTaxAmount",
        missingCode: "VSN-003",
        invalidCode: "VSN-003",
        reject,
      })
    : refuseSelectiveTax(context.item.selectiveTaxAmount, reject);
  const revenueType = resolveRevenueType(context, reject);

  if (isStructureValid && violations.length === 0 && context.facts.classification) {
    checkClassificationNomenclature({ context, codes, reject });
  }

  const rates = context.regime.hasTaxCalculation
    ? readCalculationInputs({ context, revenueType, reject })
    : { reason: null, cbsRate: null, ibsRate: null };

  if (violations.length > 0 || !revenueType || !baseAmount) {
    const rejected: SimplesItemAssessment = { kind: "rejected", violations };
    return rejected;
  }

  const calculable: CalculableSimplesItem = {
    kind: "calculable",
    revenueType,
    baseAmount,
    selectiveTaxAmount,
    cbsRate: rates.cbsRate,
    ibsRate: rates.ibsRate,
    notCalculatedReason: rates.reason,
  };
  return calculable;
}

// why: an NF-e or NFC-e may carry NCM "00" for goods without one (TPDF_B_PERMITE_NCM_ZERO).
function clearZeroNcm(context: SimplesItemContext) {
  const { item, document } = context;
  const isZeroNcm = document.allowsZeroNcm && ZERO_NCM_CODES.has(item.ncmCode ?? "");
  const codes = { ncmCode: isZeroNcm ? undefined : item.ncmCode, nbsCode: item.nbsCode };
  return codes;
}

function readAmount(
  text: string | undefined,
  input: {
    field: string;
    missingCode: string;
    invalidCode: string;
    reject: (input: ViolationInput) => void;
  },
) {
  const { field, missingCode, invalidCode, reject } = input;

  if (!text) {
    reject({ ruleCode: missingCode, field, message: "Required, and not sent." });
    return null;
  }

  const amount = readFormatted({ text, pattern: AMOUNT, field, invalidCode, reject });
  return amount;
}

function readFormatted(input: {
  text: string;
  pattern: RegExp;
  field: string;
  invalidCode: string;
  reject: (input: ViolationInput) => void;
}) {
  const { pattern, field, invalidCode, reject } = input;
  const text = input.text.trim();

  if (pattern.test(text)) {
    const value = parseDecimal(text);
    return value;
  }

  const isNegative = text.startsWith("-") && pattern.test(text.slice(1));
  const message = isNegative
    ? `Must not be negative, got "${input.text}".`
    : `Must be a plain decimal, got "${input.text}".`;

  reject({ ruleCode: invalidCode, field, message });
  return null;
}

// why: a document without the IS (the NFS-e) takes it absent or zero, and leaves it out (VSN-035).
function refuseSelectiveTax(text: string | undefined, reject: (input: ViolationInput) => void) {
  if (!text) {
    return null;
  }

  const field = "selectiveTaxAmount";
  const amount = readFormatted({ text, pattern: AMOUNT, field, invalidCode: "VSN-003", reject });

  if (amount && compareDecimals(amount, ZERO) !== 0) {
    reject({
      ruleCode: "VSN-035",
      field,
      message: `The document has no Imposto Seletivo: send zero or nothing, got "${text}".`,
    });
  }

  return null;
}

function resolveRevenueType(context: SimplesItemContext, reject: (input: ViolationInput) => void) {
  const { item, facts, revenueTypes } = context;

  if (!item.cClassTrib) {
    reject({ ruleCode: "VSN-020", field: "cClassTrib", message: "Required, and not sent." });
    return null;
  }

  if (!facts.classification) {
    reject({
      ruleCode: "VSN-021",
      field: "cClassTrib",
      message: `cClassTrib ${item.cClassTrib} does not exist on the operation date.`,
    });
    return null;
  }

  if (!facts.classification.isAllowedOnDocument) {
    reject({
      ruleCode: "VSN-022",
      field: "cClassTrib",
      message: `cClassTrib ${item.cClassTrib} is not allowed on ${context.document.acronym}.`,
    });
    return null;
  }

  const revenueType = revenueTypes.get(facts.classification.revenueTypeCode) ?? null;

  if (!revenueType) {
    reject({
      ruleCode: "VSN-026",
      field: "cClassTrib",
      message: `No revenue type ${facts.classification.revenueTypeCode} on the operation date.`,
    });
  }

  return revenueType;
}

// why: the classic endpoint takes cAtivSN as sent (no zero padding); a bad one is no error.
function readCalculationInputs(input: {
  context: SimplesItemContext;
  revenueType: RevenueTypeFacts | null;
  reject: (input: ViolationInput) => void;
}) {
  const { context, revenueType, reject } = input;
  const activity = checkActivity(context, revenueType, reject);
  const requiresRates = activity.reason === null && revenueType?.needsRates === true;
  const requiresIbs = requiresRates && context.regime.hasIbs;

  if (context.nfse) {
    const nfse = context.nfse;
    const pairRates = resolvePairRates({
      context,
      nfse,
      needsCbsRate: requiresRates,
      needsIbsRate: requiresIbs,
      reject,
    });
    const pairInputs = { reason: activity.reason, ...pairRates };
    return pairInputs;
  }

  const cbsRate = readRate(context.item.cbsSimplesRate, {
    isRequired: requiresRates,
    field: "cbsSimplesRate",
    codes: ["VSN-004", "VSN-005"],
    reject,
  });
  const ibsRate = readRate(context.item.ibsSimplesRate, {
    isRequired: requiresIbs,
    field: "ibsSimplesRate",
    codes: ["VSN-006", "VSN-007"],
    reject,
  });
  const inputs = { reason: activity.reason, cbsRate, ibsRate };
  return inputs;
}

function checkActivity(
  context: SimplesItemContext,
  revenueType: RevenueTypeFacts | null,
  reject: (input: ViolationInput) => void,
): ActivityCheck {
  const { item, facts } = context;
  const reason = findNotCalculatedReason(item.activityCode, facts.activity);

  if (reason !== null || !facts.activity) {
    const ruledOut: ActivityCheck = { reason };
    return ruledOut;
  }

  if (facts.activity.isNonTaxable && revenueType?.isNonTaxableActivityRefused) {
    reject({
      ruleCode: "VSN-023",
      field: "activityCode",
      message: `Activity ${item.activityCode} (non-taxable operations) does not fit revenue type ${revenueType.code}.`,
    });
  }

  const allowed: ActivityCheck = { reason: null };
  return allowed;
}

function findNotCalculatedReason(
  activityCode: string | undefined,
  activity: SimplesItemFacts["activity"],
): NotCalculatedReason | null {
  if (!activityCode) {
    return "activityMissing";
  }

  if (!activity) {
    return "activityUnknown";
  }

  const reason = activity.isAllowedOnDocument ? null : "activityNotAllowed";
  return reason;
}

// why: the resolver of CalculoSimplesUnificadoService; a rate missing in the chosen pair is the
// item's error, pointing inside effectiveRates.
function resolvePairRates(input: PairRatesInput): ItemRates {
  const { context, nfse, needsCbsRate, needsIbsRate, reject } = input;
  const { activity } = context.facts;

  if (!activity || !nfse.rateLine) {
    return NO_RATES;
  }

  const issFacts = activity.isAllowedOnDocument
    ? assessIssFields({ item: context.item, activity, reject })
    : {};
  const choice = chooseRatePair({
    activity,
    rateLine: nfse.rateLine,
    facts: { ...nfse.operationFacts, ...issFacts },
    situations: nfse.situations,
  });

  if (choice.kind === "fatorRMissing") {
    reject({
      ruleCode: "VSN-040",
      field: `${EFFECTIVE_RATES}.isFatorRAtLeast28`,
      isOperationField: true,
      message: `Required: activity ${activity.code} is subject to the Fator R (annex III or V).`,
    });
  }

  if (choice.kind === "zero") {
    const zeroRates: ItemRates = { cbsRate: ZERO, ibsRate: ZERO };
    return zeroRates;
  }

  if (choice.kind !== "chosen") {
    return NO_RATES;
  }

  const pairRates: ItemRates = {
    cbsRate: choice.pair?.cbsRate ?? null,
    ibsRate: choice.pair?.ibsRate ?? null,
  };
  const missingRates = [
    { isMissing: needsCbsRate && !pairRates.cbsRate, ruleCode: "VSN-004", rate: "cbsSimplesRate" },
    { isMissing: needsIbsRate && !pairRates.ibsRate, ruleCode: "VSN-006", rate: "ibsSimplesRate" },
  ].filter((rate) => rate.isMissing);

  for (const { ruleCode, rate } of missingRates) {
    reject({
      ruleCode,
      field: `${EFFECTIVE_RATES}.${choice.path}.${rate}`,
      isOperationField: true,
      message: `Required for this item (annex ${choice.annex}, rule ${choice.rule}), and not in the line.`,
    });
  }

  return pairRates;
}

function readRate(
  text: string | undefined,
  input: {
    isRequired: boolean;
    field: string;
    codes: [string, string];
    reject: (input: ViolationInput) => void;
  },
) {
  const { isRequired, field, codes, reject } = input;
  const [missingCode, invalidCode] = codes;

  if (!text) {
    if (isRequired) {
      reject({ ruleCode: missingCode, field, message: "Required for this item, and not sent." });
    }

    return null;
  }

  const rate = readFormatted({ text, pattern: RATE, field, invalidCode, reject });
  return rate;
}

// why: an item error can point at the operation's rate line (#/aliquotasEfetivas/... upstream).
function toViolation(context: SimplesItemContext, input: ViolationInput) {
  const { ruleCode, field, message, isOperationField } = input;
  const itemPath = `items[${context.position}]`;
  const itemField = field ? `${itemPath}.${field}` : itemPath;
  const violation: RuleViolation = {
    ruleCode,
    field: isOperationField && field ? field : itemField,
    message,
  };
  return violation;
}

export type { CalculableSimplesItem, NfseItemContext, SimplesItemAssessment, SimplesItemContext };
export { assessSimplesItem, RATE };
