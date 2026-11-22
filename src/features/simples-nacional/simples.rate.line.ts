// Reads the company's effective rate line of an NFS-e operation into decimals, as the request source
// of SimplesNacionalNaoAssistidoService does. The line belongs to the operation, so a missing line
// (VSN-039) or a rate out of format (VSN-005, VSN-007) refuses the whole operation. A pair no item
// uses may be missing; a missing rate of the pair an item uses is that item's error.

import type { ValidationIssue } from "@/shared/http/envelope.ts";
import { parseDecimal } from "@/shared/math/decimal.ts";
import type { SimplesEffectiveRates, SimplesRatePair } from "./simples.dto.ts";
import type {
  Annex,
  AnnexRateValues,
  EffectiveRateLine,
  RatePairValues,
} from "./simples.pair.choose.ts";
import { RATE } from "./simples.validate.ts";

type RateLineOutcome =
  | { isValid: true; rateLine: EffectiveRateLine }
  | { isValid: false; issues: ValidationIssue[] };

const EFFECTIVE_RATES = "effectiveRates";
const ANNEXES: Annex[] = ["I", "II", "III", "IV", "V"];

function readEffectiveRateLine(effectiveRates: SimplesEffectiveRates | undefined): RateLineOutcome {
  if (!effectiveRates) {
    const missing: RateLineOutcome = {
      isValid: false,
      issues: [
        {
          field: EFFECTIVE_RATES,
          message: "VSN-039: required on the NFS-e when the regime calculates taxes.",
        },
      ],
    };
    return missing;
  }

  const issues: ValidationIssue[] = [];
  const annexEntries = ANNEXES.map((annex) => [
    annex,
    readAnnex(effectiveRates, annex, issues),
  ]).filter(([, annexRates]) => annexRates !== null);
  const rateLine: EffectiveRateLine = {
    isFatorRAtLeast28: effectiveRates.isFatorRAtLeast28 ?? null,
    isSublimitExceeded: effectiveRates.isSublimitExceeded === true,
    annexes: Object.fromEntries(annexEntries),
  };
  const outcome: RateLineOutcome =
    issues.length > 0 ? { isValid: false, issues } : { isValid: true, rateLine };
  return outcome;
}

// why: a pair without redistribution with no rate sent counts as not sent (semInformado).
function readAnnex(effectiveRates: SimplesEffectiveRates, annex: Annex, issues: ValidationIssue[]) {
  const annexRates = effectiveRates[`annex${annex}`];

  if (!annexRates) {
    return null;
  }

  const path = `${EFFECTIVE_RATES}.annex${annex}`;
  const withoutRedistribution =
    "withoutIssRedistribution" in annexRates ? annexRates.withoutIssRedistribution : undefined;
  const isWithoutSent =
    withoutRedistribution?.cbsSimplesRate !== undefined ||
    withoutRedistribution?.ibsSimplesRate !== undefined;
  const pair = readPair(annexRates, path, issues);
  const values: AnnexRateValues = {
    pair,
    withoutIssRedistribution:
      isWithoutSent && withoutRedistribution
        ? readPair(withoutRedistribution, `${path}.withoutIssRedistribution`, issues)
        : null,
  };
  return values;
}

function readPair(pair: SimplesRatePair, path: string, issues: ValidationIssue[]) {
  const values: RatePairValues = {
    cbsRate: readRate(
      pair.cbsSimplesRate,
      { field: `${path}.cbsSimplesRate`, ruleCode: "VSN-005" },
      issues,
    ),
    ibsRate: readRate(
      pair.ibsSimplesRate,
      { field: `${path}.ibsSimplesRate`, ruleCode: "VSN-007" },
      issues,
    ),
  };
  return values;
}

function readRate(
  text: string | undefined,
  rule: { field: string; ruleCode: string },
  issues: ValidationIssue[],
) {
  if (text === undefined) {
    return null;
  }

  const trimmed = text.trim();

  if (RATE.test(trimmed)) {
    const rate = parseDecimal(trimmed);
    return rate;
  }

  const isNegative = trimmed.startsWith("-") && RATE.test(trimmed.slice(1));
  const problem = isNegative ? "must not be negative" : "must be a plain decimal";

  issues.push({ field: rule.field, message: `${rule.ruleCode}: ${problem}, got "${text}".` });
  return null;
}

export type { RateLineOutcome };
export { readEffectiveRateLine };
