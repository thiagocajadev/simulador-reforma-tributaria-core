// The regime fields an operation must carry, in the vocabulary of its document (CalculoSimplesUnificado
// Service.validarRegime): CRT and ibsCbsRegime on the NF-e and NFC-e, the provider's Simples option
// and assessment regimes on the NFS-e. A field of the other vocabulary is refused (VSN-033). Every
// issue is an operation rule upstream answers with 422, so the message starts with the code.

import type { ValidationIssue } from "@/shared/http/envelope.ts";
import type { SimplesCalculationRequest } from "./simples.dto.ts";
import type { SimplesDocumentFacts } from "./simples.facts.ts";

interface RegimeFieldRule {
  field: "ibsCbsAssessmentRegime" | "simplesTaxesAssessmentRegime";
  ruleCode: string;
}

const SIMPLES_CRT = 1;
const SUBLIMIT_CRT = 2;
const PURE_REGULAR_REGIME = 3;
const MEI = 4;
const REGULAR_IBS_CBS_REGIME = 1;
const PENDING_SIMPLES_OPTION = 2;
const OPTING_SIMPLES_OPTIONS = new Set([3, 4]);
const NFSE_REGIME_FIELDS: RegimeFieldRule[] = [
  { field: "ibsCbsAssessmentRegime", ruleCode: "VSN-031" },
  { field: "simplesTaxesAssessmentRegime", ruleCode: "VSN-032" },
];
const CRT_ONLY_FIELDS = ["crt", "ibsCbsRegime"] as const;
const NFSE_ONLY_FIELDS = [
  "simplesOption",
  "ibsCbsAssessmentRegime",
  "simplesTaxesAssessmentRegime",
] as const;
const ITEM_RATE_FIELDS = ["cbsSimplesRate", "ibsSimplesRate"] as const;
const ITEM_ISS_FIELDS = ["issTaxation", "issWithholding", "municipalBenefit"] as const;

// why: rules C21a-10/20/30 of NT 2026.005; only CRT 1, CRT 2 and CRT 3 with a pending option count.
function checkCrtRegimeFields(operation: SimplesCalculationRequest) {
  const { crt, ibsCbsRegime } = operation;
  const issues = [...refuseForeignFields(operation, NFSE_ONLY_FIELDS, "documents with CRT")];

  if (crt === undefined) {
    issues.push({ field: "crt", message: "VSN-016: required on documents with CRT." });
  }

  const hasRegime = ibsCbsRegime !== undefined;
  const isIncoherent =
    (crt === MEI && hasRegime) ||
    ((crt === SIMPLES_CRT || crt === SUBLIMIT_CRT) && ibsCbsRegime === PENDING_SIMPLES_OPTION) ||
    (crt === PURE_REGULAR_REGIME && ibsCbsRegime === REGULAR_IBS_CBS_REGIME);

  if (isIncoherent) {
    issues.push({
      field: "ibsCbsRegime",
      message: `VSN-018: ibsCbsRegime ${ibsCbsRegime} does not fit CRT ${crt}.`,
    });
  }

  const scopeIssues = [...issues, ...findOutOfScopeCrt(operation), ...refuseNfseValues(operation)];
  return scopeIssues;
}

function findOutOfScopeCrt(operation: SimplesCalculationRequest) {
  const { crt, ibsCbsRegime } = operation;
  const issues: ValidationIssue[] = [];

  if (crt === MEI) {
    issues.push({
      field: "crt",
      message: "VSN-019: the MEI (CRT 4) is out of the Simples calculation.",
    });
  }

  if (ibsCbsRegime === REGULAR_IBS_CBS_REGIME) {
    issues.push({
      field: "ibsCbsRegime",
      message: "VSN-019: ibsCbsRegime 1 is calculated under the regular regime.",
    });
  }

  if (crt === PURE_REGULAR_REGIME && ibsCbsRegime === undefined) {
    issues.push({
      field: "crt",
      message: "VSN-019: CRT 3 without ibsCbsRegime 2 is the regular regime, not the Simples.",
    });
  }

  return issues;
}

// why: the rate line and the ISS facts drive the NFS-e calculation only; elsewhere they would be
// silently ignored, so they are refused instead.
function refuseNfseValues(operation: SimplesCalculationRequest) {
  const lineIssues: ValidationIssue[] = operation.effectiveRates
    ? [{ field: "effectiveRates", message: "Only on the NFS-e: here each item sends its rates." }]
    : [];
  const itemIssues = listSentItemFields(operation, ITEM_ISS_FIELDS).map((field) => ({
    field,
    message: "Only on the NFS-e.",
  }));
  const issues = [...lineIssues, ...itemIssues];
  return issues;
}

// why: validarRegimeNfse (rules 313, E0162 and E0166 of the NFS-e) and validarQuantidadeItens.
function checkNfseRegimeFields(
  operation: SimplesCalculationRequest,
  document: SimplesDocumentFacts,
) {
  const { simplesOption, items } = operation;
  const issues = [...refuseForeignFields(operation, CRT_ONLY_FIELDS, "the NFS-e")];

  if (simplesOption === undefined) {
    issues.push({ field: "simplesOption", message: "VSN-030: required on the NFS-e." });
  } else {
    issues.push(...NFSE_REGIME_FIELDS.flatMap((rule) => checkAssessmentRegime(operation, rule)));
  }

  if (document.maxItems !== null && items.length > document.maxItems) {
    issues.push({
      field: "items",
      message: `VSN-034: the ${document.acronym} takes at most ${document.maxItems} item, got ${items.length}.`,
    });
  }

  const itemRateIssues = listSentItemFields(operation, ITEM_RATE_FIELDS).map((field) => ({
    field,
    message: "Not used on the NFS-e: the rates come from effectiveRates.",
  }));
  const allIssues = [...issues, ...itemRateIssues];
  return allIssues;
}

function checkAssessmentRegime(operation: SimplesCalculationRequest, rule: RegimeFieldRule) {
  const { field, ruleCode } = rule;
  const value = operation[field];
  const isOpting = OPTING_SIMPLES_OPTIONS.has(operation.simplesOption ?? 0);
  const issues: ValidationIssue[] = [];

  if (value !== undefined && !isOpting) {
    issues.push({
      field,
      message: `${ruleCode}: not allowed with simplesOption ${operation.simplesOption} (not opting or MEI).`,
    });
  }

  if (value === undefined && isOpting) {
    issues.push({
      field,
      message: `${ruleCode}: required with simplesOption ${operation.simplesOption}.`,
    });
  }

  return issues;
}

function refuseForeignFields(
  operation: SimplesCalculationRequest,
  fields: readonly (keyof SimplesCalculationRequest)[],
  documentName: string,
) {
  const issues: ValidationIssue[] = fields
    .filter((field) => operation[field] !== undefined)
    .map((field) => ({
      field,
      message: `VSN-033: ${field} is not a regime field of ${documentName}.`,
    }));
  return issues;
}

function listSentItemFields(
  operation: SimplesCalculationRequest,
  fields: readonly (keyof SimplesCalculationRequest["items"][number])[],
) {
  const paths = operation.items.flatMap((operationItem, position) =>
    fields
      .filter((field) => operationItem[field] !== undefined)
      .map((field) => `items[${position}].${field}`),
  );
  return paths;
}

export { checkCrtRegimeFields, checkNfseRegimeFields };
