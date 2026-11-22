// The Simples Nacional part of the form, and its conversion into the body of
// POST /api/simples-nacional-calculations from the operation the regular regime already checked.
// One activity and one rate pair for the whole operation. The NF-e and NFC-e send the pair on each
// item with the CRT; the NFS-e sends it in the activity's annex (simples.nfse.draft.ts). Pure.
// An item with the Imposto Seletivo waits for the regular regime: the IS it calculated goes into the
// Simples item as upstream's valorImpostoSeletivo, so both columns count the same IS.

import type { CalculationResult, Operation } from "@/features/calculations/calculation.dto.ts";
import type { FieldErrors } from "@/features/calculations/operation.draft.ts";
import type { SimplesActivity } from "@/features/simples-activities/simples-activities.dto.ts";
import type { NfseSimplesOperation, SimplesOperation } from "./simples.dto.ts";
import {
  createNfseSimplesFields,
  describeNfseFields,
  findNfseFieldErrors,
  isNfseDocument,
  type NfseSimplesFields,
  needsNfseIbsRate,
  toNfseSimplesOperation,
} from "./simples.nfse.draft.ts";
import { findRateError, readRate } from "./simples.rate.read.ts";

type SimplesCrt = "1" | "2";

type SimplesSubmission = SimplesOperation | NfseSimplesOperation;

interface SimplesDraft {
  crt: SimplesCrt;
  activityCode: string;
  cbsRate: string;
  ibsRate: string;
  nfse: NfseSimplesFields;
}

type ReadySimplesCheck = { kind: "ready"; operation: SimplesSubmission };

type SimplesDraftCheck =
  | { kind: "unavailable" }
  | { kind: "skipped" }
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | ReadySimplesCheck;

interface ReadyCheckInput {
  draft: SimplesDraft;
  operation: Operation;
  date: string;
  isIbsNeeded: boolean;
  activity: SimplesActivity | null;
}

const SIMPLES_FROM = "2027-01-01";
const SIMPLES_DOCUMENT_TYPES = new Set([55, 65, 91]);
const DEFAULT_ACTIVITY_CODE = "01";
const NO_SELECTIVE_TAX = "0.00";
const ISO_DATE_LENGTH = 10;
const CRT_WITHOUT_IBS: SimplesCrt = "2";
const SUBLIMIT_CRT = 2;
const SUBLIMIT_ASSESSMENT_REGIME = 2;

const SIMPLES_CRT_OPTIONS: Record<SimplesCrt, string> = {
  "1": "Simples Nacional (CRT 1)",
  "2": "Simples Nacional com sublimite excedido (CRT 2)",
};

const SIMPLES_FIELD_KEYS = {
  activityCode: "simples.activityCode",
  cbsRate: "simples.cbsRate",
  ibsRate: "simples.ibsRate",
} as const;

const MESSAGES = {
  activityRequired: "Escolha a atividade do Simples Nacional.",
};

function createSimplesDraft() {
  const draft: SimplesDraft = {
    crt: "1",
    activityCode: DEFAULT_ACTIVITY_CODE,
    cbsRate: "",
    ibsRate: "",
    nfse: createNfseSimplesFields(),
  };
  return draft;
}

// why: the Simples enters the CBS and IBS calculation in 2027.
function isSimplesAvailable(taxEventDate: string, documentType: number) {
  const isAvailable = taxEventDate >= SIMPLES_FROM && SIMPLES_DOCUMENT_TYPES.has(documentType);
  return isAvailable;
}

function needsIbsRate(draft: SimplesDraft, documentType: number) {
  const isNeeded = isNfseDocument(documentType)
    ? needsNfseIbsRate(draft.nfse)
    : draft.crt !== CRT_WITHOUT_IBS;
  return isNeeded;
}

// why: the activity comes from the activity list, since the NFS-e sends the rates by its annex.
function checkSimplesDraft(
  draft: SimplesDraft,
  operation: Operation,
  activity: SimplesActivity | null,
) {
  const date = operation.taxEventDate.slice(0, ISO_DATE_LENGTH);
  const documentType = operation.documentType ?? 0;

  if (!isSimplesAvailable(date, documentType)) {
    const unavailable: SimplesDraftCheck = { kind: "unavailable" };
    return unavailable;
  }

  const isIbsNeeded = needsIbsRate(draft, documentType);
  const typedRates = isIbsNeeded ? [draft.cbsRate, draft.ibsRate] : [draft.cbsRate];

  if (typedRates.every((typed) => typed.trim() === "")) {
    const skipped: SimplesDraftCheck = { kind: "skipped" };
    return skipped;
  }

  const nfseErrors = isNfseDocument(documentType)
    ? findNfseFieldErrors(draft.nfse, describeNfseFields(activity, draft.nfse).needsPairWithoutIss)
    : {};
  const fieldErrors = { ...findFieldErrors(draft, isIbsNeeded), ...nfseErrors };

  if (Object.keys(fieldErrors).length > 0) {
    const invalid: SimplesDraftCheck = { kind: "invalid", fieldErrors };
    return invalid;
  }

  const ready: SimplesDraftCheck = {
    kind: "ready",
    operation: toSubmission({ draft, operation, date, isIbsNeeded, activity }),
  };
  return ready;
}

function findFieldErrors(draft: SimplesDraft, isIbsNeeded: boolean) {
  const fieldErrors: FieldErrors = {};

  if (draft.activityCode === "") {
    fieldErrors[SIMPLES_FIELD_KEYS.activityCode] = MESSAGES.activityRequired;
  }

  const cbsError = findRateError(draft.cbsRate);
  const ibsError = isIbsNeeded ? findRateError(draft.ibsRate) : null;

  if (cbsError) {
    fieldErrors[SIMPLES_FIELD_KEYS.cbsRate] = cbsError;
  }

  if (ibsError) {
    fieldErrors[SIMPLES_FIELD_KEYS.ibsRate] = ibsError;
  }

  return fieldErrors;
}

function toSubmission(input: ReadyCheckInput) {
  const { draft, operation, date, isIbsNeeded, activity } = input;

  if (isNfseDocument(operation.documentType ?? 0)) {
    const nfseOperation: SimplesSubmission = toNfseSimplesOperation(operation, date, {
      fields: draft.nfse,
      activity,
      cbsRate: readRate(draft.cbsRate),
      ibsRate: isIbsNeeded ? readRate(draft.ibsRate) : null,
    });
    return nfseOperation;
  }

  const simplesOperation: SimplesSubmission = toSimplesOperation(input);
  return simplesOperation;
}

function toSimplesOperation(input: ReadyCheckInput) {
  const { draft, operation, date, isIbsNeeded } = input;
  const cbsSimplesRate = readRate(draft.cbsRate) ?? "";
  const ibsSimplesRate = isIbsNeeded ? (readRate(draft.ibsRate) ?? "") : undefined;
  const simplesOperation: SimplesOperation = {
    taxEventDate: date,
    documentType: operation.documentType ?? 0,
    crt: Number(draft.crt),
    items: operation.items.map((operationItem) => ({
      itemNumber: operationItem.itemNumber,
      activityCode: draft.activityCode,
      cClassTrib: operationItem.cClassTrib,
      ncmCode: operationItem.ncmCode,
      nbsCode: operationItem.nbsCode,
      baseAmount: operationItem.baseAmount,
      selectiveTaxAmount: NO_SELECTIVE_TAX,
      cbsSimplesRate,
      ibsSimplesRate,
    })),
  };
  return simplesOperation;
}

// why: only an NF-e or NFC-e item carries the IS; the NFS-e has none.
function needsSelectiveTaxAmounts(
  draftCheck: SimplesDraftCheck,
  operation: Operation,
): draftCheck is ReadySimplesCheck {
  const isWaiting =
    draftCheck.kind === "ready" &&
    "crt" in draftCheck.operation &&
    operation.items.some((operationItem) => operationItem.selectiveTax !== undefined);
  return isWaiting;
}

// why: an item the regular regime rejected or did not calculate has no IS to carry.
function fillSelectiveTaxAmounts(draftCheck: ReadySimplesCheck, result: CalculationResult) {
  const submission = draftCheck.operation;

  if (!("crt" in submission)) {
    return draftCheck;
  }

  const amounts = new Map(
    result.items.map((itemResult) => [
      itemResult.itemNumber,
      "selectiveTax" in itemResult ? itemResult.selectiveTax?.amount : undefined,
    ]),
  );
  const filledCheck: ReadySimplesCheck = {
    kind: "ready",
    operation: {
      ...submission,
      items: submission.items.map((simplesItem) => ({
        ...simplesItem,
        selectiveTaxAmount: amounts.get(simplesItem.itemNumber) ?? NO_SELECTIVE_TAX,
      })),
    },
  };
  return filledCheck;
}

// why: CRT 2 on the NF-e and assessment regime 2 on the NFS-e both take the IBS out of the Simples.
function isSublimitSubmission(submission: SimplesSubmission) {
  const isSublimit =
    "crt" in submission
      ? submission.crt === SUBLIMIT_CRT
      : submission.ibsCbsAssessmentRegime === SUBLIMIT_ASSESSMENT_REGIME;
  return isSublimit;
}

export type { ReadySimplesCheck, SimplesCrt, SimplesDraft, SimplesDraftCheck, SimplesSubmission };
export {
  checkSimplesDraft,
  createSimplesDraft,
  fillSelectiveTaxAmounts,
  isSimplesAvailable,
  isSublimitSubmission,
  needsIbsRate,
  needsSelectiveTaxAmounts,
  SIMPLES_CRT_OPTIONS,
  SIMPLES_FIELD_KEYS,
};
