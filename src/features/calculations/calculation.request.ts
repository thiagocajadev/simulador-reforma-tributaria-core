// Reads the body of POST /api/calculations into an Operation, or every field it gets wrong, so
// a 400 lists all of them. Shapes follow the upstream input limits: amounts of up to 13 integer
// digits and 2 decimals, rates of up to 3 integer digits and 4 decimals (ArredondamentoUtils).
// Unknown fields are ignored; the rules that need the open data run later, per item.

import type { ValidationIssue } from "@/shared/http/envelope.ts";
import type {
  NominalRates,
  Operation,
  OperationItem,
  SelectiveTaxInput,
} from "./calculation.dto.ts";

type OperationParse =
  | { isValid: true; operation: Operation }
  | { isValid: false; issues: ValidationIssue[] };

type JsonObject = Record<string, unknown>;

const MAX_ITEMS = 20;
const MAX_ITEM_NUMBER = 999;
const TAX_EVENT_DATE =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const UF = /^[A-Z]{2}$/;
const MUNICIPALITY_CODE = /^\d{7}$/;
const DOCUMENT_TYPE = /^\d{2}$/;
const NCM_CODE = /^\d{2,8}$/;
const NBS_CODE = /^\d{1,9}$/;
const CST_CODE = /^\d{3}$/;
const CLASSIFICATION_CODE = /^\d{6}$/;
const AMOUNT = /^\d{1,13}(?:\.\d{1,2})?$/;
const RATE = /^\d{1,3}(?:\.\d{1,4})?$/;
// why: upstream caps none of the ad rem digits; quantity is TDec1104, the unit (uTrib) 1 to 6 characters.
const AD_REM_RATE = /^\d{1,13}(?:\.\d{1,4})?$/;
const QUANTITY = /^\d{1,11}(?:\.\d{1,4})?$/;
const UNIT = /^[\p{L}\p{N}]{1,6}$/u;

function parseOperation(body: unknown): OperationParse {
  if (!isObject(body)) {
    const notObject: OperationParse = {
      isValid: false,
      issues: [{ field: "body", message: "Must be a JSON object." }],
    };
    return notObject;
  }

  const issues: ValidationIssue[] = [];
  const operation: Operation = {
    taxEventDate: readTaxEventDate(body.taxEventDate, issues),
    uf: readPattern({
      value: body.uf,
      field: "uf",
      pattern: UF,
      shape: 'two capital letters, such as "RS"',
      issues,
    }),
    municipalityCode: Number(
      readPattern({
        value: numberText(body.municipalityCode),
        field: "municipalityCode",
        pattern: MUNICIPALITY_CODE,
        shape: "a 7-digit IBGE code",
        issues,
      }),
    ),
    documentType: readOptionalDocumentType(body.documentType, issues),
    items: readItems(body.items, issues),
  };
  const parsed: OperationParse =
    issues.length > 0 ? { isValid: false, issues } : { isValid: true, operation };
  return parsed;
}

function readTaxEventDate(value: unknown, issues: ValidationIssue[]) {
  const text = typeof value === "string" ? value : "";
  const match = TAX_EVENT_DATE.exec(text);
  const isCalendarDate = match !== null && isCalendarDay(text.slice(0, 10));

  if (!isCalendarDate) {
    issues.push({
      field: "taxEventDate",
      message: `Must be a date and time with offset, such as "2026-03-10T10:00:00-03:00", got ${describe(value)}.`,
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

function readOptionalDocumentType(value: unknown, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = readPattern({
    value: numberText(value),
    field: "documentType",
    pattern: DOCUMENT_TYPE,
    shape: "a 2-digit tpDoc code, such as 55 (NF-e) or 91 (NFS-e)",
    issues,
  });
  const documentType = Number(text);
  return documentType;
}

function readItems(value: unknown, issues: ValidationIssue[]) {
  const isWithinLimit = Array.isArray(value) && value.length >= 1 && value.length <= MAX_ITEMS;

  if (!isWithinLimit) {
    issues.push({
      field: "items",
      message: `Must be a list of 1 to ${MAX_ITEMS} items, got ${describe(value)}.`,
    });
    const noItems: OperationItem[] = [];
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
    const placeholder: OperationItem = {
      itemNumber: 0,
      cstCode: "",
      cClassTrib: "",
      baseAmount: "",
    };
    return placeholder;
  }

  const entry = value;
  const readCode = (field: string, pattern: RegExp, shape: string) =>
    readPattern({ value: entry[field], field: `${path}.${field}`, pattern, shape, issues });
  const operationItem: OperationItem = {
    itemNumber: readItemNumber(entry.itemNumber, `${path}.itemNumber`, issues),
    ncmCode: isBlank(entry.ncmCode) ? undefined : readCode("ncmCode", NCM_CODE, "2 to 8 digits"),
    nbsCode: isBlank(entry.nbsCode) ? undefined : readCode("nbsCode", NBS_CODE, "1 to 9 digits"),
    cstCode: readCode("cstCode", CST_CODE, "3 digits"),
    cClassTrib: readCode("cClassTrib", CLASSIFICATION_CODE, "6 digits"),
    baseAmount: readCode(
      "baseAmount",
      AMOUNT,
      'a decimal string with up to 2 places, such as "1200.00"',
    ),
    nominalRates: readNominalRates(entry.nominalRates, `${path}.nominalRates`, issues),
    selectiveTax: readSelectiveTax(entry.selectiveTax, `${path}.selectiveTax`, issues),
  };
  return operationItem;
}

function readSelectiveTax(value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const entry: JsonObject = isObject(value) ? value : {};
  const readCode = (field: string, pattern: RegExp, shape: string) =>
    readPattern({ value: entry[field], field: `${path}.${field}`, pattern, shape, issues });
  const readOptional = (field: string, pattern: RegExp, shape: string) =>
    isBlank(entry[field]) ? undefined : readCode(field, pattern, shape);
  const selectiveTax: SelectiveTaxInput = {
    cstCode: readCode("cstCode", CST_CODE, "3 digits"),
    cClassTrib: readCode("cClassTrib", CLASSIFICATION_CODE, "6 digits"),
    adValoremRate: readOptional(
      "adValoremRate",
      RATE,
      'a percentage string with up to 4 places, such as "13.5"',
    ),
    adRemRate: readOptional(
      "adRemRate",
      AD_REM_RATE,
      'an amount in reais per unit with up to 4 places, such as "21.30"',
    ),
    quantity: readOptional(
      "quantity",
      QUANTITY,
      'a decimal string with up to 4 places, such as "10"',
    ),
    unit: readOptional("unit", UNIT, 'a unit of 1 to 6 letters or digits, such as "VN"'),
  };
  return selectiveTax;
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

function readNominalRates(value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const entry: JsonObject = isObject(value) ? value : {};
  const readRate = (field: keyof NominalRates) =>
    readPattern({
      value: entry[field],
      field: `${path}.${field}`,
      pattern: RATE,
      shape: 'a percentage string with up to 4 places, such as "8.8123"',
      issues,
    });
  const rates: NominalRates = {
    cbsRate: readRate("cbsRate"),
    ibsUfRate: readRate("ibsUfRate"),
    ibsMunRate: readRate("ibsMunRate"),
  };
  return rates;
}

function readPattern(input: {
  value: unknown;
  field: string;
  pattern: RegExp;
  shape: string;
  issues: ValidationIssue[];
}) {
  const { value, field, pattern, shape, issues } = input;
  const text = typeof value === "string" ? value : "";

  if (!pattern.test(text)) {
    issues.push({ field, message: `Must be ${shape}, got ${describe(value)}.` });
  }

  return text;
}

// why: numeric codes may arrive as JSON numbers; only whole numbers keep their digits as text.
function numberText(value: unknown) {
  const text = Number.isInteger(value) ? String(value) : value;
  return text;
}

// why: upstream treats a null or blank NCM or NBS as not sent (StringUtils.isBlank).
function isBlank(value: unknown) {
  const isAbsent =
    value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  return isAbsent;
}

function isObject(value: unknown): value is JsonObject {
  const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
  return isPlainObject;
}

function describe(value: unknown) {
  const description = value === undefined ? "nothing" : JSON.stringify(value).slice(0, 40);
  return description;
}

export { MAX_ITEMS, parseOperation };
