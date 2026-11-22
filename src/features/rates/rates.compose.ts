// Combines a reference rate with a UF or municipality standard rate, as the upstream
// AliquotaResultadoDTO does: SUBSTITUICAO replaces it, ACRESCIMO adds to it, DECRESCIMO subtracts
// from it. Rates are percentages; the math is exact decimal, never binary floating point.

import type { RateSource } from "./rates.dto.ts";

type ApplicationMethod = "SUBSTITUICAO" | "ACRESCIMO" | "DECRESCIMO";

interface RateComponents {
  referenceRate: number;
  standardRate: number | null;
  applicationMethod: ApplicationMethod | null;
}

interface ComposedRate {
  rate: string;
  source: RateSource;
}

const DECIMAL_PLACES = 8;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);
const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;
const TRAILING_ZEROS = /\.?0+$/;

function composeRate(components: RateComponents) {
  const { referenceRate, standardRate, applicationMethod } = components;

  if (standardRate === null) {
    const reference: ComposedRate = {
      rate: formatScaled(toScaled(referenceRate)),
      source: "reference",
    };
    return reference;
  }

  const scaledRate = applyStandardRate({
    reference: toScaled(referenceRate),
    standard: toScaled(standardRate),
    applicationMethod,
  });

  if (scaledRate < 0n) {
    throw new Error(`Applicable rate is negative: ${JSON.stringify(components)}`);
  }

  const standard: ComposedRate = { rate: formatScaled(scaledRate), source: "standard" };
  return standard;
}

function applyStandardRate(input: {
  reference: bigint;
  standard: bigint;
  applicationMethod: ApplicationMethod | null;
}) {
  const { reference, standard, applicationMethod } = input;

  switch (applicationMethod) {
    case "SUBSTITUICAO": {
      return standard;
    }
    case "ACRESCIMO": {
      const increased = reference + standard;
      return increased;
    }
    case "DECRESCIMO": {
      const decreased = reference - standard;
      return decreased;
    }
    default: {
      throw new Error(`Standard rate without a known application method: ${applicationMethod}`);
    }
  }
}

function toScaled(rate: number) {
  const match = PLAIN_DECIMAL.exec(String(rate));

  if (!match) {
    throw new Error(`Rate must be a non-negative plain decimal, got ${rate}`);
  }

  const [, integerPart = "0", fractionPart = ""] = match;

  if (fractionPart.length > DECIMAL_PLACES) {
    throw new Error(`Rate has more than ${DECIMAL_PLACES} decimal places: ${rate}`);
  }

  const scaled = BigInt(integerPart) * SCALE + BigInt(fractionPart.padEnd(DECIMAL_PLACES, "0"));
  return scaled;
}

function formatScaled(scaled: bigint) {
  const integerPart = scaled / SCALE;
  const fractionPart = (scaled % SCALE).toString().padStart(DECIMAL_PLACES, "0");
  const formatted = `${integerPart}.${fractionPart}`.replace(TRAILING_ZEROS, "");
  return formatted;
}

export type { ApplicationMethod, RateComponents };
export { composeRate };
