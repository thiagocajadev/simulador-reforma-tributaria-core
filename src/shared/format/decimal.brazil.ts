// Decimal strings ("1200.00", "0.9") to and from the Brazilian notation people read and type
// ("R$ 1.200,00", "0,90%"). Exact: text in, text out, through the BigInt decimals, never a float.

import { formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";

interface BrazilianFormat {
  minPlaces: number;
  maxPlaces: number;
}

const MONEY_FORMAT: BrazilianFormat = { minPlaces: 2, maxPlaces: 2 };
const PERCENT_FORMAT: BrazilianFormat = { minPlaces: 2, maxPlaces: 4 };
const THOUSANDS_GROUP = /\B(?=(\d{3})+(?!\d))/g;
const TYPED_DECIMAL = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;

function formatMoney(text: string) {
  const money = `R$ ${formatBrazilianDecimal(text, MONEY_FORMAT)}`;
  return money;
}

function formatPercent(text: string) {
  const percent = `${formatBrazilianDecimal(text, PERCENT_FORMAT)}%`;
  return percent;
}

function formatBrazilianDecimal(text: string, format: BrazilianFormat) {
  const plain = formatDecimal(parseDecimal(text), format);
  const [integerPart = "0", fractionPart = ""] = plain.split(".");
  const groupedInteger = integerPart.replace(THOUSANDS_GROUP, ".");
  const paddedFraction = fractionPart.padEnd(format.minPlaces, "0");
  const brazilian = paddedFraction === "" ? groupedInteger : `${groupedInteger},${paddedFraction}`;
  return brazilian;
}

// why: people type "1.200,50", "1200,5" or "1200"; the API takes "1200.50". Null when unreadable.
function parseTypedDecimal(typed: string, maxPlaces: number) {
  const match = TYPED_DECIMAL.exec(typed.trim());

  if (!match) {
    return null;
  }

  const [, integerPart = "", fractionPart = ""] = match;

  if (fractionPart.length > maxPlaces) {
    return null;
  }

  const integerDigits = integerPart.replaceAll(".", "");
  const plain = fractionPart === "" ? integerDigits : `${integerDigits}.${fractionPart}`;
  return plain;
}

export type { BrazilianFormat };
export { formatBrazilianDecimal, formatMoney, formatPercent, parseTypedDecimal };
