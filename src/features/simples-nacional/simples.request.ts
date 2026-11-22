// Reads the body of POST /api/simples-nacional-calculations into a SimplesCalculationRequest, or
// every field it gets wrong, so a 400 lists all of them. Only the operation fields and the shape of
// each item are checked here; the values of an item (base, rates, codes) are checked per item with
// the upstream VSN codes, so one bad item does not hide the others. Which fields a document takes
// (CRT or the NFS-e ones) depends on the document type on the date, so operation.simples.ts checks
// that against the open data.

import { MAX_ITEMS } from "@/features/calculations/calculation.request.ts";
import type { ValidationIssue } from "@/shared/http/envelope.ts";
import type {
  SimplesAnnexRates,
  SimplesCalculationRequest,
  SimplesEffectiveRates,
  SimplesOperationItem,
  SimplesRatePair,
} from "./simples.dto.ts";

type SimplesOperationParse =
  | { isValid: true; operation: SimplesCalculationRequest }
  | { isValid: false; issues: ValidationIssue[] };

type JsonObject = Record<string, unknown>;

interface CodeRule {
  field: string;
  allowed: number[];
  shape: string;
}

const MAX_ITEM_NUMBER = 999;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_TYPE = /^\d{2}$/;
const CRT_RULE: CodeRule = { field: "crt", allowed: [1, 2, 3, 4], shape: "1, 2, 3 or 4" };
const IBS_CBS_REGIME_RULE: CodeRule = { field: "ibsCbsRegime", allowed: [1, 2], shape: "1 or 2" };
const SIMPLES_OPTION_RULE: CodeRule = {
  field: "simplesOption",
  allowed: [1, 2, 3, 4],
  shape: "1 (not opting), 2 (MEI), 3 (ME/EPP) or 4 (option pending)",
};
const ASSESSMENT_REGIME_SHAPE = "1, 2 or 3";
const IBS_CBS_ASSESSMENT_RULE: CodeRule = {
  field: "ibsCbsAssessmentRegime",
  allowed: [1, 2, 3],
  shape: ASSESSMENT_REGIME_SHAPE,
};
const SIMPLES_TAXES_ASSESSMENT_RULE: CodeRule = {
  field: "simplesTaxesAssessmentRegime",
  allowed: [1, 2, 3],
  shape: ASSESSMENT_REGIME_SHAPE,
};
const GOVERNMENT_ENTITY_RULE: CodeRule = {
  field: "governmentEntity",
  allowed: [1, 2, 3, 4],
  shape: "1 (Union), 2 (state), 3 (Federal District) or 4 (municipality)",
};
const TEXT_FIELDS = [
  "activityCode",
  "cClassTrib",
  "ncmCode",
  "nbsCode",
  "baseAmount",
  "selectiveTaxAmount",
  "cbsSimplesRate",
  "ibsSimplesRate",
] as const;
const ISS_FIELDS = ["issTaxation", "issWithholding", "municipalBenefit"] as const;
const SINGLE_PAIR_ANNEXES = ["annexI", "annexII"] as const;
const ISS_ANNEXES = ["annexIII", "annexIV", "annexV"] as const;
const EFFECTIVE_RATES = "effectiveRates";

function parseSimplesOperation(body: unknown): SimplesOperationParse {
  if (!isObject(body)) {
    const notObject: SimplesOperationParse = {
      isValid: false,
      issues: [{ field: "body", message: "Must be a JSON object." }],
    };
    return notObject;
  }

  const issues: ValidationIssue[] = [];
  const operation: SimplesCalculationRequest = {
    taxEventDate: readPlainDate(body.taxEventDate, issues),
    documentType: readDocumentType(body.documentType, issues),
    crt: readOptionalCode(body.crt, CRT_RULE, issues),
    ibsCbsRegime: readOptionalCode(body.ibsCbsRegime, IBS_CBS_REGIME_RULE, issues),
    simplesOption: readOptionalCode(body.simplesOption, SIMPLES_OPTION_RULE, issues),
    ibsCbsAssessmentRegime: readOptionalCode(
      body.ibsCbsAssessmentRegime,
      IBS_CBS_ASSESSMENT_RULE,
      issues,
    ),
    simplesTaxesAssessmentRegime: readOptionalCode(
      body.simplesTaxesAssessmentRegime,
      SIMPLES_TAXES_ASSESSMENT_RULE,
      issues,
    ),
    governmentEntity: readOptionalCode(body.governmentEntity, GOVERNMENT_ENTITY_RULE, issues),
    effectiveRates: readEffectiveRates(body.effectiveRates, issues),
    items: readItems(body.items, issues),
  };
  const parsed: SimplesOperationParse =
    issues.length > 0 ? { isValid: false, issues } : { isValid: true, operation };
  return parsed;
}

function readPlainDate(value: unknown, issues: ValidationIssue[]) {
  const text = typeof value === "string" ? value : "";
  const isCalendarDate = PLAIN_DATE.test(text) && isCalendarDay(text);

  if (!isCalendarDate) {
    issues.push({
      field: "taxEventDate",
      message: `Must be a date such as "2027-03-10", got ${describe(value)}.`,
    });
  }

  return text;
}

function isCalendarDay(isoDate: string) {
  const candidate = new Date(`${isoDate}T00:00:00Z`);
  const isSameDay =
    !Number.isNaN(candidate.getTime()) && candidate.toISOString().startsWith(isoDate);
  return isSameDay;
}

function readDocumentType(value: unknown, issues: ValidationIssue[]) {
  const text = Number.isInteger(value) ? String(value) : value;
  const isValid = typeof text === "string" && DOCUMENT_TYPE.test(text);

  if (!isValid) {
    issues.push({
      field: "documentType",
      message: `Must be a 2-digit tpDoc code, such as 55 (NF-e), 65 (NFC-e) or 91 (NFS-e), got ${describe(value)}.`,
    });
  }

  const documentType = Number(text);
  return documentType;
}

function readOptionalCode(value: unknown, rule: CodeRule, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const code = readCode(value, rule, issues);
  return code;
}

function readCode(value: unknown, rule: CodeRule, issues: ValidationIssue[]) {
  const code = Number.isInteger(value) ? Number(value) : null;

  if (code === null || !rule.allowed.includes(code)) {
    issues.push({ field: rule.field, message: `Must be ${rule.shape}, got ${describe(value)}.` });
    return undefined;
  }

  return code;
}

function readEffectiveRates(value: unknown, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isObject(value)) {
    issues.push({ field: EFFECTIVE_RATES, message: "Must be a JSON object." });
    return undefined;
  }

  const singlePairAnnexes = SINGLE_PAIR_ANNEXES.map((annex) => [
    annex,
    readRatePair(value[annex], `${EFFECTIVE_RATES}.${annex}`, issues),
  ]);
  const issAnnexes = ISS_ANNEXES.map((annex) => [
    annex,
    readAnnexRates(value[annex], `${EFFECTIVE_RATES}.${annex}`, issues),
  ]);
  const effectiveRates: SimplesEffectiveRates = {
    isFatorRAtLeast28: readOptionalBoolean(
      value.isFatorRAtLeast28,
      `${EFFECTIVE_RATES}.isFatorRAtLeast28`,
      issues,
    ),
    isSublimitExceeded: readOptionalBoolean(
      value.isSublimitExceeded,
      `${EFFECTIVE_RATES}.isSublimitExceeded`,
      issues,
    ),
    ...Object.fromEntries([...singlePairAnnexes, ...issAnnexes]),
  };
  return effectiveRates;
}

function readAnnexRates(value: unknown, path: string, issues: ValidationIssue[]) {
  const pair = readRatePair(value, path, issues);

  if (!pair || !isObject(value)) {
    return pair;
  }

  const annexRates: SimplesAnnexRates = {
    ...pair,
    withoutIssRedistribution: readRatePair(
      value.withoutIssRedistribution,
      `${path}.withoutIssRedistribution`,
      issues,
    ),
  };
  return annexRates;
}

function readRatePair(value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isObject(value)) {
    issues.push({ field: path, message: "Must be a JSON object." });
    return undefined;
  }

  const pair: SimplesRatePair = {
    cbsSimplesRate: readOptionalText(value.cbsSimplesRate, `${path}.cbsSimplesRate`, issues),
    ibsSimplesRate: readOptionalText(value.ibsSimplesRate, `${path}.ibsSimplesRate`, issues),
  };
  return pair;
}

function readOptionalBoolean(value: unknown, field: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    issues.push({ field, message: `Must be true or false, got ${describe(value)}.` });
    return undefined;
  }

  return value;
}

function readItems(value: unknown, issues: ValidationIssue[]) {
  const isWithinLimit = Array.isArray(value) && value.length >= 1 && value.length <= MAX_ITEMS;

  if (!isWithinLimit) {
    issues.push({
      field: "items",
      message: `Must be a list of 1 to ${MAX_ITEMS} items, got ${describe(value)}.`,
    });
    const noItems: SimplesOperationItem[] = [];
    return noItems;
  }

  const operationItems = value.map((entry, position) =>
    readItem(entry, `items[${position}]`, issues),
  );
  return operationItems;
}

function readItem(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isObject(value)) {
    issues.push({ field: path, message: "Must be a JSON object." });
    const placeholder: SimplesOperationItem = { itemNumber: 0, cClassTrib: "", baseAmount: "" };
    return placeholder;
  }

  const texts = Object.fromEntries(
    TEXT_FIELDS.map((field) => [field, readOptionalText(value[field], `${path}.${field}`, issues)]),
  );
  const issCodes = Object.fromEntries(
    ISS_FIELDS.map((field) => [
      field,
      readOptionalInteger(value[field], `${path}.${field}`, issues),
    ]),
  );
  const operationItem: SimplesOperationItem = {
    itemNumber: readItemNumber(value.itemNumber, `${path}.itemNumber`, issues),
    activityCode: texts.activityCode,
    cClassTrib: texts.cClassTrib ?? "",
    ncmCode: texts.ncmCode,
    nbsCode: texts.nbsCode,
    baseAmount: texts.baseAmount ?? "",
    selectiveTaxAmount: texts.selectiveTaxAmount,
    cbsSimplesRate: texts.cbsSimplesRate,
    ibsSimplesRate: texts.ibsSimplesRate,
    issTaxation: issCodes.issTaxation,
    issWithholding: issCodes.issWithholding,
    municipalBenefit: issCodes.municipalBenefit,
  };
  return operationItem;
}

function readItemNumber(value: unknown, field: string, issues: ValidationIssue[]) {
  const isValid = Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_ITEM_NUMBER;

  if (!isValid) {
    issues.push({
      field,
      message: `Must be an integer from 1 to ${MAX_ITEM_NUMBER}, got ${describe(value)}.`,
    });
  }

  const itemNumber = Number(value);
  return itemNumber;
}

// why: the ISS codes are checked against their domain per item (VSN-036 to VSN-038), as upstream does.
function readOptionalInteger(value: unknown, field: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    issues.push({ field, message: `Must be an integer, got ${describe(value)}.` });
    return undefined;
  }

  const integer = Number(value);
  return integer;
}

// why: upstream reads every item value as text, and a blank one counts as not sent (isBlank).
function readOptionalText(value: unknown, field: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: `Must be a string, got ${describe(value)}.` });
    return undefined;
  }

  const text = value.trim() === "" ? undefined : value;
  return text;
}

function isObject(value: unknown): value is JsonObject {
  const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
  return isPlainObject;
}

function describe(value: unknown) {
  const description = value === undefined ? "nothing" : JSON.stringify(value).slice(0, 40);
  return description;
}

export { parseSimplesOperation };
