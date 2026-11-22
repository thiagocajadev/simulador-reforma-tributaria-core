// Exact decimal arithmetic over BigInt, with the numeric policy of the upstream calculator
// (ArredondamentoUtils.java): addition, subtraction and multiplication are exact, division is
// the only operation that rounds (34 significant digits), and every rounding is HALF_EVEN.
// A value is unscaled * 10^-scale, with scale >= 0.

interface Decimal {
  unscaled: bigint;
  scale: number;
}

interface DecimalFormat {
  minPlaces: number;
  maxPlaces: number;
}

const DIVISION_SIGNIFICANT_DIGITS = 34;
const PLAIN_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function parseDecimal(text: string) {
  const match = PLAIN_DECIMAL.exec(text);

  if (!match) {
    throw new Error(`Expected a plain decimal such as "-12.34", got "${text}"`);
  }

  const [, sign = "", integerPart = "0", fractionPart = ""] = match;
  const magnitude = BigInt(`${integerPart}${fractionPart}`);
  const unscaled = sign === "-" ? -magnitude : magnitude;
  const parsed: Decimal = { unscaled, scale: fractionPart.length };
  return parsed;
}

function addDecimals(augend: Decimal, addend: Decimal) {
  const [left, right] = alignScales(augend, addend);
  const sum: Decimal = { unscaled: left.unscaled + right.unscaled, scale: left.scale };
  return sum;
}

function subtractDecimals(minuend: Decimal, subtrahend: Decimal) {
  const [left, right] = alignScales(minuend, subtrahend);
  const difference: Decimal = { unscaled: left.unscaled - right.unscaled, scale: left.scale };
  return difference;
}

function multiplyDecimals(multiplicand: Decimal, multiplier: Decimal) {
  const unscaled = multiplicand.unscaled * multiplier.unscaled;
  const product: Decimal = { unscaled, scale: multiplicand.scale + multiplier.scale };
  return product;
}

// why: Java's divide(divisor, MathContext(34, HALF_EVEN)), the only internal rounding upstream.
function divideDecimals(dividend: Decimal, divisor: Decimal) {
  if (divisor.unscaled === 0n) {
    throw new Error("Division by zero");
  }

  const isNegative = dividend.unscaled < 0n !== divisor.unscaled < 0n;
  const numerator = absolute(dividend.unscaled);
  const denominator = absolute(divisor.unscaled);
  const extraDigits = Math.max(
    0,
    DIVISION_SIGNIFICANT_DIGITS + 1 + countDigits(denominator) - countDigits(numerator),
  );
  const scaledNumerator = numerator * 10n ** BigInt(extraDigits);
  const quotient = scaledNumerator / denominator;
  const hasRemainder = scaledNumerator % denominator !== 0n;
  const droppedDigits = Math.max(0, countDigits(quotient) - DIVISION_SIGNIFICANT_DIGITS);
  const rounded = roundUnscaled({ magnitude: quotient, droppedDigits, hasRemainder });
  const signed = isNegative ? -rounded : rounded;
  const scale = dividend.scale - divisor.scale + extraDigits - droppedDigits;
  const result = normalizeScale({ unscaled: signed, scale });
  return result;
}

function roundDecimal(value: Decimal, places: number) {
  if (value.scale <= places) {
    const padded = rescale(value, places);
    return padded;
  }

  const droppedDigits = value.scale - places;
  const magnitude = roundUnscaled({
    magnitude: absolute(value.unscaled),
    droppedDigits,
    hasRemainder: false,
  });
  const unscaled = value.unscaled < 0n ? -magnitude : magnitude;
  const rounded: Decimal = { unscaled, scale: places };
  return rounded;
}

// why: positive places move the point right (fraction to percentage), as Java's movePointRight.
function shiftDecimalPoint(value: Decimal, places: number) {
  const shifted = normalizeScale({ unscaled: value.unscaled, scale: value.scale - places });
  return shifted;
}

function compareDecimals(left: Decimal, right: Decimal) {
  const [alignedLeft, alignedRight] = alignScales(left, right);
  const difference = alignedLeft.unscaled - alignedRight.unscaled;
  const comparison = Number(difference > 0n) - Number(difference < 0n);
  return comparison;
}

function formatDecimal(value: Decimal, format: DecimalFormat) {
  const { minPlaces, maxPlaces } = format;
  const rounded = roundDecimal(value, maxPlaces);
  const stripped = stripTrailingZeros(rounded, minPlaces);
  const text = toPlainText(stripped);
  return text;
}

function alignScales(left: Decimal, right: Decimal) {
  const scale = Math.max(left.scale, right.scale);
  const aligned: [Decimal, Decimal] = [rescale(left, scale), rescale(right, scale)];
  return aligned;
}

function rescale(value: Decimal, scale: number) {
  const factor = 10n ** BigInt(scale - value.scale);
  const rescaled: Decimal = { unscaled: value.unscaled * factor, scale };
  return rescaled;
}

function normalizeScale(value: Decimal) {
  if (value.scale >= 0) {
    return value;
  }

  const normalized = rescale(value, 0);
  return normalized;
}

// why: HALF_EVEN; a remainder beyond the kept digits turns an exact tie into "more than half".
function roundUnscaled(input: { magnitude: bigint; droppedDigits: number; hasRemainder: boolean }) {
  const { magnitude, droppedDigits, hasRemainder } = input;
  const divisor = 10n ** BigInt(droppedDigits);
  const kept = magnitude / divisor;
  const twiceDropped = (magnitude % divisor) * 2n;
  const isAboveHalf = twiceDropped > divisor || (twiceDropped === divisor && hasRemainder);
  const isTieToOdd = twiceDropped === divisor && !hasRemainder && kept % 2n === 1n;
  const shouldRoundUp = droppedDigits > 0 && (isAboveHalf || isTieToOdd);
  const rounded = shouldRoundUp ? kept + 1n : kept;
  return rounded;
}

function stripTrailingZeros(value: Decimal, minPlaces: number) {
  let { unscaled, scale } = value;

  while (scale > minPlaces && unscaled % 10n === 0n) {
    unscaled /= 10n;
    scale -= 1;
  }

  const stripped: Decimal = { unscaled, scale };
  return stripped;
}

function toPlainText(value: Decimal) {
  const sign = value.unscaled < 0n ? "-" : "";
  const digits = absolute(value.unscaled)
    .toString()
    .padStart(value.scale + 1, "0");
  const integerPart = digits.slice(0, digits.length - value.scale);
  const fractionPart = digits.slice(digits.length - value.scale);
  const text = value.scale > 0 ? `${sign}${integerPart}.${fractionPart}` : `${sign}${integerPart}`;
  return text;
}

function absolute(value: bigint) {
  const magnitude = value < 0n ? -value : value;
  return magnitude;
}

function countDigits(magnitude: bigint) {
  const digitCount = magnitude.toString().length;
  return digitCount;
}

export type { Decimal, DecimalFormat };
export {
  addDecimals,
  compareDecimals,
  divideDecimals,
  formatDecimal,
  multiplyDecimals,
  parseDecimal,
  roundDecimal,
  shiftDecimalPoint,
  subtractDecimals,
};
