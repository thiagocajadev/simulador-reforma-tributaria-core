// Text as a simulated fiscal PDF prints it: one WinAnsi line (the standard PDF fonts are not
// embedded), cuts with an ellipsis, zero and absent values as "-", dates as the XML writes them,
// and CPF or CNPJ with their masks. Pure, so the presenters stay testable without jsPDF.

import { formatMoney, formatPercent } from "@/shared/format/decimal.brazil.ts";
import { compareDecimals, parseDecimal } from "@/shared/math/decimal.ts";

const DASH = "-";
const ELLIPSIS = "...";
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/;
const LINE_BREAKS_AND_SPACES = /\s+/g;
const UNPRINTABLE_CHARACTER = "?";
const WIN_ANSI_EXTRAS = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
const CPF_DIGITS = /^(\d{3})(\d{3})(\d{3})(\d{2})$/;
const CNPJ_DIGITS = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/;

// why: line breaks would push content out of its box, and jsPDF prints non-WinAnsi as garbage.
function toPrintableLine(text: string) {
  const singleLine = text.replace(LINE_BREAKS_AND_SPACES, " ").trim();
  const printable = [...singleLine].map(toWinAnsiCharacter).join("");
  return printable;
}

function toWinAnsiCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  const isAscii = codePoint >= 0x20 && codePoint <= 0x7e;
  const isLatin1Letter = codePoint >= 0xa0 && codePoint <= 0xff;
  const isPrintable = isAscii || isLatin1Letter || WIN_ANSI_EXTRAS.has(character);
  const printable = isPrintable ? character : UNPRINTABLE_CHARACTER;
  return printable;
}

function truncateText(text: string, limit: number) {
  const characters = [...text];

  if (characters.length <= limit) {
    return text;
  }

  const truncated = `${characters.slice(0, limit - ELLIPSIS.length).join("")}${ELLIPSIS}`;
  return truncated;
}

function isZeroAmount(text: string) {
  const isZeroValue = compareDecimals(parseDecimal(text), parseDecimal("0")) === 0;
  return isZeroValue;
}

function formatMoneyOrDash(text: string) {
  const money = isZeroAmount(text) ? DASH : formatMoney(text);
  return money;
}

function formatPercentOrDash(text: string | null) {
  const percent = text === null || isZeroAmount(text) ? DASH : formatPercent(text);
  return percent;
}

function formatPrintedDate(isoDate: string) {
  const [, year, month, day] = ISO_DATE_TIME.exec(isoDate) ?? [];
  const date = `${day}/${month}/${year}`;
  return date;
}

// why: prints the issuer's local time as written in the XML, without converting time zones.
function formatPrintedDateTime(isoDateTime: string) {
  const [, year, month, day, time = ""] = ISO_DATE_TIME.exec(isoDateTime) ?? [];
  const dateTime = `${day}/${month}/${year} ${time}`.trim();
  return dateTime;
}

function formatTaxId(taxId: string) {
  const formatted = CPF_DIGITS.test(taxId)
    ? taxId.replace(CPF_DIGITS, "$1.$2.$3-$4")
    : taxId.replace(CNPJ_DIGITS, "$1.$2.$3/$4-$5");
  return formatted;
}

export {
  DASH,
  formatMoneyOrDash,
  formatPercentOrDash,
  formatPrintedDate,
  formatPrintedDateTime,
  formatTaxId,
  isZeroAmount,
  toPrintableLine,
  truncateText,
};
