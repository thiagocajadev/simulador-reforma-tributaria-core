// Decimal text as the fiscal document layouts write it: money with exactly two places ("1200.00")
// and rates with two to four ("0.90", "8.8123"), plus sums and differences of money. Shared by the
// NFS-e and NF-e documents; every value stays a string and never passes through binary floats.

import {
  addDecimals,
  formatDecimal,
  parseDecimal,
  subtractDecimals,
} from "@/shared/math/decimal.ts";

const MONEY_FORMAT = { minPlaces: 2, maxPlaces: 2 };
const RATE_FORMAT = { minPlaces: 2, maxPlaces: 4 };

function formatDocumentMoney(text: string) {
  const plain = formatDecimal(parseDecimal(text), MONEY_FORMAT);
  const money = padPlaces(plain, MONEY_FORMAT.minPlaces);
  return money;
}

function formatDocumentRate(text: string) {
  const plain = formatDecimal(parseDecimal(text), RATE_FORMAT);
  const rate = padPlaces(plain, RATE_FORMAT.minPlaces);
  return rate;
}

function sumDocumentMoney(amounts: string[]) {
  const total = amounts.reduce(
    (sum, amount) => addDecimals(sum, parseDecimal(amount)),
    parseDecimal("0"),
  );
  const money = formatDocumentMoney(formatDecimal(total, MONEY_FORMAT));
  return money;
}

function subtractDocumentMoney(left: string, right: string) {
  const difference = subtractDecimals(parseDecimal(left), parseDecimal(right));
  const money = formatDocumentMoney(formatDecimal(difference, MONEY_FORMAT));
  return money;
}

function padPlaces(plain: string, minPlaces: number) {
  const [integerPart = "0", fractionPart = ""] = plain.split(".");
  const padded = `${integerPart}.${fractionPart.padEnd(minPlaces, "0")}`;
  return padded;
}

export { formatDocumentMoney, formatDocumentRate, subtractDocumentMoney, sumDocumentMoney };
