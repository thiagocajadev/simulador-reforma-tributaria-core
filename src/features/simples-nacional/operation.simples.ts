// Calculates one Simples operation. The document type on the date picks the upstream path: the
// classic one (SimplesNacionalObservabilidadeService.processarOperacao) for documents with CRT, the
// non-assisted one (CalculoSimplesUnificadoService.processar) for the NFS-e. The document, the
// regime, the government purchase and the NFS-e rate line are operation rules (a 400, where
// upstream answers 422); then each item is assessed and calculated on its own.

import type { ValidationIssue } from "@/shared/http/envelope.ts";
import { addDecimals, type Decimal, formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";
import { calculateSimplesItem, MONEY } from "./simples.calculate.ts";
import type {
  SimplesCalculationRequest,
  SimplesCalculationResult,
  SimplesItemResult,
  SimplesOperationItem,
  SimplesTotals,
} from "./simples.dto.ts";
import type {
  RegimeVocabulary,
  SimplesDocumentFacts,
  SimplesItemFacts,
  SimplesOperationFacts,
  SimplesRegimeFacts,
} from "./simples.facts.ts";
import type { PairFacts } from "./simples.pair.choose.ts";
import { readEffectiveRateLine } from "./simples.rate.line.ts";
import { checkCrtRegimeFields, checkNfseRegimeFields } from "./simples.regime.check.ts";
import { findOperationFacts, findSimplesItemsFacts } from "./simples.repository.ts";
import { assessSimplesItem, type NfseItemContext } from "./simples.validate.ts";

type SimplesOperationOutcome =
  | { kind: "invalid"; issues: ValidationIssue[] }
  | { kind: "calculated"; result: SimplesCalculationResult; rowsRead: number };

interface SimplesScope {
  facts: SimplesOperationFacts;
  document: SimplesDocumentFacts;
  regime: SimplesRegimeFacts;
  governmentPurchaseFactor: Decimal | null;
  nfse: NfseItemContext | null;
}

type ScopeOutcome =
  | { isValid: true; scope: SimplesScope }
  | { isValid: false; issues: ValidationIssue[] };

type NfseOutcome =
  | { isValid: true; nfse: NfseItemContext | null }
  | { isValid: false; issues: ValidationIssue[] };

const NFSE_VOCABULARY: RegimeVocabulary = "NFSE";
const UNION = 1;
const SINGLE_DIGIT = /^\d$/;

async function calculateSimplesOperation(
  database: D1Database,
  operation: SimplesCalculationRequest,
) {
  const operationFacts = await findOperationFacts(database, {
    date: operation.taxEventDate,
    documentType: operation.documentType,
    crt: operation.crt ?? null,
    ibsCbsRegime: operation.ibsCbsRegime ?? null,
    simplesOption: operation.simplesOption ?? null,
    ibsCbsAssessmentRegime: operation.ibsCbsAssessmentRegime ?? null,
  });
  const scopeOutcome = resolveScope(operation, operationFacts.facts);

  if (!scopeOutcome.isValid) {
    const invalid: SimplesOperationOutcome = { kind: "invalid", issues: scopeOutcome.issues };
    return invalid;
  }

  const { scope } = scopeOutcome;
  const isNfse = scope.nfse !== null;
  const trimmedOperation: SimplesCalculationRequest = {
    ...operation,
    items: operation.items.map((operationItem) => trimLookupCodes(operationItem, isNfse)),
  };
  const itemsFacts = await findSimplesItemsFacts(
    database,
    trimmedOperation.items.map((operationItem) => ({
      date: operation.taxEventDate,
      documentType: operation.documentType,
      cClassTrib: operationItem.cClassTrib || null,
      activityCode: operationItem.activityCode ?? null,
      ncmCode: operationItem.ncmCode ?? null,
      nbsCode: operationItem.nbsCode ?? null,
    })),
  );
  const results = trimmedOperation.items.map((_operationItem, position) =>
    calculateItem({
      operation: trimmedOperation,
      position,
      scope,
      itemFacts: itemsFacts.facts[position],
    }),
  );
  const result: SimplesCalculationResult = {
    items: results.toSorted((left, right) => left.itemNumber - right.itemNumber),
    totals: sumTotals(results),
    dataVersion: scope.facts.dataVersion,
  };
  const calculated: SimplesOperationOutcome = {
    kind: "calculated",
    result,
    rowsRead: operationFacts.rowsRead + itemsFacts.rowsRead,
  };
  return calculated;
}

// why: upstream trims cAtivSN and cClassTrib before looking them up (normalizarCAtivSN), and the
// NFS-e path pads a single digit ("7" is "07"), since the DPS field is numeric.
function trimLookupCodes(operationItem: SimplesOperationItem, isNfse: boolean) {
  const activityCode = operationItem.activityCode?.trim();
  const paddedCode =
    isNfse && activityCode && SINGLE_DIGIT.test(activityCode) ? `0${activityCode}` : activityCode;
  const trimmed: SimplesOperationItem = {
    ...operationItem,
    activityCode: paddedCode === "" ? undefined : paddedCode,
    cClassTrib: operationItem.cClassTrib.trim(),
  };
  return trimmed;
}

function resolveScope(
  operation: SimplesCalculationRequest,
  facts: SimplesOperationFacts,
): ScopeOutcome {
  const { document } = facts;
  const isDocumentValid = document?.hasCalculatorTreatment === true && document.isEnabled;
  const issues = [
    ...checkDocument(operation, isDocumentValid),
    ...checkRegimeFields(operation, facts),
  ];

  if (issues.length > 0 || !document || !isDocumentValid) {
    const invalid: ScopeOutcome = { isValid: false, issues };
    return invalid;
  }

  const { regime } = facts;

  if (!regime || regime.vocabulary !== document.regimeVocabulary) {
    const noRegime: ScopeOutcome = {
      isValid: false,
      issues: [describeMissingRegime(operation, document)],
    };
    return noRegime;
  }

  const factorOutcome = resolveGovernmentPurchaseFactor(operation, facts);

  if (!factorOutcome.isValid) {
    return factorOutcome;
  }

  const nfseOutcome = resolveNfseContext(operation, { document, regime, facts });

  if (!nfseOutcome.isValid) {
    return nfseOutcome;
  }

  const valid: ScopeOutcome = {
    isValid: true,
    scope: {
      facts,
      document,
      regime,
      governmentPurchaseFactor: factorOutcome.factor,
      nfse: nfseOutcome.nfse,
    },
  };
  return valid;
}

// why: a tpDoc without calculator treatment, or not enabled for the Simples on the date, is VSN-015.
function checkDocument(operation: SimplesCalculationRequest, isDocumentValid: boolean) {
  const { documentType, taxEventDate } = operation;
  const issues: ValidationIssue[] = isDocumentValid
    ? []
    : [
        {
          field: "documentType",
          message: `VSN-015: document type ${documentType} is not enabled for the Simples calculation on ${taxEventDate}.`,
        },
      ];
  return issues;
}

// why: without an enabled document the vocabulary is unknown; the classic endpoint still checks
// the CRT, so a request that sends one keeps that behavior, and the NFS-e path checks nothing.
function checkRegimeFields(operation: SimplesCalculationRequest, facts: SimplesOperationFacts) {
  const { document } = facts;
  const vocabulary = document?.isEnabled ? document.regimeVocabulary : null;

  if (vocabulary === NFSE_VOCABULARY && document) {
    const nfseIssues = checkNfseRegimeFields(operation, document);
    return nfseIssues;
  }

  const isCrtFamily = vocabulary !== null || operation.crt !== undefined;
  const issues = isCrtFamily ? checkCrtRegimeFields(operation) : [];
  return issues;
}

function describeMissingRegime(
  operation: SimplesCalculationRequest,
  document: SimplesDocumentFacts,
) {
  const { taxEventDate, crt, simplesOption, ibsCbsAssessmentRegime } = operation;

  if (document.regimeVocabulary === NFSE_VOCABULARY) {
    const outOfScope: ValidationIssue = {
      field: "simplesOption",
      message: `VSN-019: simplesOption ${simplesOption} with ibsCbsAssessmentRegime ${ibsCbsAssessmentRegime ?? "not sent"} is out of the Simples calculation on ${taxEventDate}.`,
    };
    return outOfScope;
  }

  const noRegime: ValidationIssue = {
    field: "crt",
    message: `VSN-026: no Simples regime for CRT ${crt} on ${taxEventDate}.`,
  };
  return noRegime;
}

function resolveGovernmentPurchaseFactor(
  operation: SimplesCalculationRequest,
  facts: SimplesOperationFacts,
) {
  const { governmentEntity, taxEventDate } = operation;
  const needsFactor = governmentEntity !== undefined && governmentEntity !== UNION;

  if (!needsFactor) {
    const noFactor = { isValid: true as const, factor: null };
    return noFactor;
  }

  if (facts.governmentPurchaseFactor === null) {
    const missing = {
      isValid: false as const,
      issues: [
        {
          field: "governmentEntity",
          message: `VSN-025: no government purchase factor on ${taxEventDate}.`,
        },
      ],
    };
    return missing;
  }

  const resolved = { isValid: true as const, factor: parseDecimal(facts.governmentPurchaseFactor) };
  return resolved;
}

// why: the rate line is read only when the regime calculates taxes (not SOMENTE_RECEITA).
function resolveNfseContext(
  operation: SimplesCalculationRequest,
  input: {
    document: SimplesDocumentFacts;
    regime: SimplesRegimeFacts;
    facts: SimplesOperationFacts;
  },
): NfseOutcome {
  const { document, regime, facts } = input;

  if (document.regimeVocabulary !== NFSE_VOCABULARY) {
    const classic: NfseOutcome = { isValid: true, nfse: null };
    return classic;
  }

  const lineOutcome = regime.hasTaxCalculation
    ? readEffectiveRateLine(operation.effectiveRates)
    : { isValid: true as const, rateLine: null };

  if (!lineOutcome.isValid) {
    return lineOutcome;
  }

  const operationFacts: PairFacts = Object.fromEntries(
    Object.entries({
      ibsCbsAssessmentRegime: operation.ibsCbsAssessmentRegime,
      simplesTaxesAssessmentRegime: operation.simplesTaxesAssessmentRegime,
    }).filter(([, value]) => value !== undefined),
  );
  const nfse: NfseOutcome = {
    isValid: true,
    nfse: { rateLine: lineOutcome.rateLine, situations: facts.issSituations, operationFacts },
  };
  return nfse;
}

function calculateItem(input: {
  operation: SimplesCalculationRequest;
  position: number;
  scope: SimplesScope;
  itemFacts: SimplesItemFacts | undefined;
}) {
  const { operation, position, scope, itemFacts } = input;
  const operationItem = operation.items[position];

  if (!operationItem || !itemFacts) {
    throw new Error(`Missing item or facts at position ${position}`);
  }

  const { document, nfse } = scope;
  const assessment = assessSimplesItem({
    position,
    item: operationItem,
    facts: itemFacts,
    document,
    regime: scope.regime,
    revenueTypes: nfse ? scope.facts.nfseRevenueTypes : scope.facts.revenueTypes,
    allowsSelectiveTax: nfse ? document.allowsSelectiveTax : true,
    nfse,
  });

  if (assessment.kind === "notImplemented") {
    const notImplemented: SimplesItemResult = {
      itemNumber: operationItem.itemNumber,
      status: "notImplemented",
      reason: "adjustment",
    };
    return notImplemented;
  }

  if (assessment.kind === "rejected") {
    const rejected: SimplesItemResult = {
      itemNumber: operationItem.itemNumber,
      status: "rejected",
      violations: assessment.violations,
    };
    return rejected;
  }

  const calculated: SimplesItemResult = calculateSimplesItem({
    itemNumber: operationItem.itemNumber,
    calculable: assessment,
    regime: scope.regime,
    governmentEntity: operation.governmentEntity ?? null,
    governmentPurchaseFactor: scope.governmentPurchaseFactor,
    rateDecimalPlaces: nfse ? document.rateDecimalPlaces : null,
  });
  return calculated;
}

// why: TotalSimplesDomain sums only the values some item has, so a total no item has is null.
function sumTotals(results: SimplesItemResult[]) {
  const counted = results.filter(
    (result) => result.status === "calculated" || result.status === "notCalculated",
  );

  if (counted.length === 0) {
    return null;
  }

  const calculated = results.flatMap((result) => (result.status === "calculated" ? [result] : []));
  const ibsDueAmount = sumPresent(calculated.map((result) => result.ibs?.dueAmount));
  const cbsDueAmount = sumPresent(calculated.map((result) => result.cbs.dueAmount));
  const selectiveTaxAmount = sumPresent(calculated.map((result) => result.selectiveTaxAmount));
  const totals: SimplesTotals = {
    grossRevenue: sumPresent(counted.map((result) => result.grossRevenue)) ?? "0.00",
    baseAmount: sumPresent(calculated.map((result) => result.baseAmount)),
    ibsDueAmount,
    ibsPendingAmount: sumPresent(calculated.map((result) => result.ibs?.pendingAmount)),
    cbsDueAmount,
    cbsPendingAmount: sumPresent(calculated.map((result) => result.cbs.pendingAmount)),
    selectiveTaxAmount,
    taxTotal: sumPresent([ibsDueAmount, cbsDueAmount, selectiveTaxAmount]),
  };
  return totals;
}

function sumPresent(values: (string | null | undefined)[]) {
  const present = values.filter((value): value is string => typeof value === "string");

  if (present.length === 0) {
    return null;
  }

  const sum = present.map(parseDecimal).reduce<Decimal>(addDecimals, parseDecimal("0"));
  const total = formatDecimal(sum, MONEY);
  return total;
}

export type { SimplesOperationOutcome };
export { calculateSimplesOperation };
