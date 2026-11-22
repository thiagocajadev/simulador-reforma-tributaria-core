// Turns what the visitor typed into a search the repositories can run: a code prefix when the
// text is only digits and separators ("0713.33"), otherwise an FTS5 MATCH expression.
// Every word is quoted, so FTS5 operators typed by the visitor stay plain text.

import type { ValidationIssue } from "@/shared/http/envelope.ts";
import { type FieldResult, parseSearchText } from "@/shared/http/query.params.ts";

type SearchQuery =
  | { kind: "code"; codePrefix: string; codeUpperBound: string }
  | { kind: "text"; matchExpression: string; quotedWords: string[] };

const CODE_QUERY_PATTERN = /^[\d.\-\s]+$/;
const NON_DIGITS = /\D/g;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const MAX_WORDS = 6;

function parseSearchQuery(raw: string | undefined) {
  const text = parseSearchText(raw);

  if (!text.isValid) {
    const rejection: FieldResult<SearchQuery> = text;
    return rejection;
  }

  const query = interpretSearchText(text.value);
  return query;
}

function interpretSearchText(text: string) {
  const digits = text.replace(NON_DIGITS, "");
  const isCodeQuery = CODE_QUERY_PATTERN.test(text) && digits.length > 0;

  if (isCodeQuery) {
    const codeQuery = toCodeQuery(digits);
    return codeQuery;
  }

  const words = (text.match(WORD_PATTERN) ?? []).slice(0, MAX_WORDS);

  if (words.length === 0) {
    const issue: ValidationIssue = { field: "q", message: "Must contain letters or digits." };
    const rejection: FieldResult<SearchQuery> = { isValid: false, issue };
    return rejection;
  }

  const quotedWords = words.map((word) => `"${word}"*`);
  const matchExpression = quotedWords.join(" ");
  const textQuery: FieldResult<SearchQuery> = {
    isValid: true,
    value: { kind: "text", matchExpression, quotedWords },
  };
  return textQuery;
}

// why: codes are digit strings, so every code starting with the prefix sorts in [prefix, upper bound).
function toCodeQuery(codePrefix: string) {
  const lastCharacter = codePrefix.charCodeAt(codePrefix.length - 1);
  const codeUpperBound = `${codePrefix.slice(0, -1)}${String.fromCharCode(lastCharacter + 1)}`;
  const codeQuery: FieldResult<SearchQuery> = {
    isValid: true,
    value: { kind: "code", codePrefix, codeUpperBound },
  };
  return codeQuery;
}

export type { SearchQuery };
export { parseSearchQuery };
