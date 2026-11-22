// Parsers for the query parameters the open data routes share. Each returns a FieldResult, and
// combineFields turns a set of them into either every value or every issue, so a 400 lists all.

import { deriveBrasiliaDate } from "@/shared/format/brasilia.date.ts";
import type { ValidationIssue } from "./envelope.ts";

type FieldResult<Value> =
  | { isValid: true; value: Value }
  | { isValid: false; issue: ValidationIssue };

type FieldValues<Fields extends Record<string, FieldResult<unknown>>> = {
  [Key in keyof Fields]: Fields[Key] extends FieldResult<infer Value> ? Value : never;
};

type CombinedFields<Values> =
  | { isValid: true; values: Values }
  | { isValid: false; issues: ValidationIssue[] };

const SEARCH_TEXT_MIN_LENGTH = 2;
const SEARCH_TEXT_MAX_LENGTH = 60;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UF_PATTERN = /^[A-Z]{2}$/;
const MUNICIPALITY_CODE_PATTERN = /^\d{7}$/;
const INTEGER_PATTERN = /^\d+$/;

function accept<Value>(value: Value) {
  const result: FieldResult<Value> = { isValid: true, value };
  return result;
}

function reject<Value>(field: string, message: string) {
  const result: FieldResult<Value> = { isValid: false, issue: { field, message } };
  return result;
}

function parseSearchText(raw: string | undefined) {
  const text = (raw ?? "").trim();
  const isLengthValid =
    text.length >= SEARCH_TEXT_MIN_LENGTH && text.length <= SEARCH_TEXT_MAX_LENGTH;

  if (!isLengthValid) {
    const rejection = reject<string>(
      "q",
      `Must have ${SEARCH_TEXT_MIN_LENGTH} to ${SEARCH_TEXT_MAX_LENGTH} characters, got ${text.length}.`,
    );
    return rejection;
  }

  const accepted = accept(text);
  return accepted;
}

function parseReferenceDate(raw: string | undefined, now: Date) {
  if (raw === undefined || raw === "") {
    const today = accept(deriveBrasiliaDate(now));
    return today;
  }

  const isCalendarDate = isValidCalendarDate(raw);

  if (!isCalendarDate) {
    const rejection = reject<string>(
      "date",
      `Must be a calendar date as YYYY-MM-DD, got "${raw}".`,
    );
    return rejection;
  }

  const accepted = accept(raw);
  return accepted;
}

function isValidCalendarDate(raw: string) {
  const match = ISO_DATE_PATTERN.exec(raw);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const isSameDate = candidate.toISOString().slice(0, 10) === raw;
  return isSameDate;
}

function parseLimit(raw: string | undefined) {
  if (raw === undefined || raw === "") {
    const defaultLimit = accept(DEFAULT_LIMIT);
    return defaultLimit;
  }

  const limit = Number(raw);
  const isInRange = INTEGER_PATTERN.test(raw) && limit >= 1 && limit <= MAX_LIMIT;

  if (!isInRange) {
    const rejection = reject<number>(
      "limit",
      `Must be an integer from 1 to ${MAX_LIMIT}, got "${raw}".`,
    );
    return rejection;
  }

  const accepted = accept(limit);
  return accepted;
}

function parseUf(raw: string | undefined) {
  const uf = (raw ?? "").trim().toUpperCase();

  if (!UF_PATTERN.test(uf)) {
    const rejection = reject<string>(
      "uf",
      `Must be a two-letter state code such as RS, got "${raw ?? ""}".`,
    );
    return rejection;
  }

  const accepted = accept(uf);
  return accepted;
}

// why: a blank UF means a nationwide search; anything else must be a valid state code.
function parseOptionalUf(raw: string | undefined) {
  const isBlank = (raw ?? "").trim() === "";

  if (isBlank) {
    const absent = accept<string | null>(null);
    return absent;
  }

  const parsed: FieldResult<string | null> = parseUf(raw);
  return parsed;
}

function parseMunicipalityCode(raw: string | undefined) {
  const code = (raw ?? "").trim();

  if (!MUNICIPALITY_CODE_PATTERN.test(code)) {
    const rejection = reject<number>(
      "municipalityCode",
      `Must be the 7-digit IBGE municipality code, got "${raw ?? ""}".`,
    );
    return rejection;
  }

  const accepted = accept(Number(code));
  return accepted;
}

function parseOptionalCode(field: string, raw: string | undefined, pattern: RegExp) {
  const code = (raw ?? "").trim();

  if (code === "") {
    const absent = accept<string | null>(null);
    return absent;
  }

  if (!pattern.test(code)) {
    const rejection = reject<string | null>(field, `Must match ${pattern.source}, got "${code}".`);
    return rejection;
  }

  const accepted = accept<string | null>(code);
  return accepted;
}

function parseRequiredCode(field: string, raw: string | undefined, pattern: RegExp) {
  const code = (raw ?? "").trim();

  if (!pattern.test(code)) {
    const rejection = reject<string>(field, `Must match ${pattern.source}, got "${code}".`);
    return rejection;
  }

  const accepted = accept(code);
  return accepted;
}

function combineFields<Fields extends Record<string, FieldResult<unknown>>>(fields: Fields) {
  const results = Object.entries(fields);
  const issues = results.flatMap(([, result]) => (result.isValid ? [] : [result.issue]));

  if (issues.length > 0) {
    const invalid: CombinedFields<FieldValues<Fields>> = { isValid: false, issues };
    return invalid;
  }

  const values = Object.fromEntries(
    results.map(([key, result]) => [key, result.isValid ? result.value : null]),
  ) as FieldValues<Fields>;
  const valid: CombinedFields<FieldValues<Fields>> = { isValid: true, values };
  return valid;
}

export type { FieldResult };
export {
  combineFields,
  parseLimit,
  parseMunicipalityCode,
  parseOptionalCode,
  parseOptionalUf,
  parseReferenceDate,
  parseRequiredCode,
  parseSearchText,
  parseUf,
};
