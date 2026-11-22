// Reads an effective rate as the visitor types it from the PGDAS extract: a percentage with up to
// 3 integer digits and every place the extract prints. Shared by the NF-e and the NFS-e drafts.

import { parseTypedDecimal } from "@/shared/format/decimal.brazil.ts";

// why: the PGDAS publishes effective rates with many places, and upstream uses them all.
const MAX_RATE_PLACES = 34;
const MAX_RATE_INTEGER_DIGITS = 3;

const RATE_MESSAGES = {
  rateInvalid: "Informe um percentual com até 3 dígitos inteiros. Exemplo: 2,3591.",
  rateRequired: "Informe também esta alíquota, ou deixe as duas em branco para não comparar.",
};

function readRate(typed: string) {
  const plain = parseTypedDecimal(typed, MAX_RATE_PLACES);
  const integerDigits = plain?.split(".")[0] ?? "";
  const isUsable = plain !== null && integerDigits.length <= MAX_RATE_INTEGER_DIGITS;
  const rate = isUsable ? plain : null;
  return rate;
}

function findRateError(typed: string) {
  if (typed.trim() === "") {
    return RATE_MESSAGES.rateRequired;
  }

  const error = readRate(typed) === null ? RATE_MESSAGES.rateInvalid : null;
  return error;
}

export { findRateError, readRate };
