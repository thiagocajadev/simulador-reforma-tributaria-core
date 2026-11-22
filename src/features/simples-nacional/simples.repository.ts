// The open data one Simples calculation reads, mapped into facts. Two D1 batches per request: the
// operation parameters, then every item; the SQL lives in simples.queries.ts.

import type { AnnexFacts } from "@/features/calculations/calculation.facts.ts";
import {
  DATA_VERSION_SQL,
  NBS_ANNEX_SQL,
  NBS_FOUND_SQL,
  NCM_ANNEX_SQL,
  NCM_FOUND_SQL,
} from "@/features/calculations/calculation.queries.ts";
import type {
  IssSituationFacts,
  IssSituationField,
  RatePairRule,
  RatePairType,
  RegimeVocabulary,
  RevenueTypeFacts,
  SimplesDocumentFacts,
  SimplesItemFacts,
  SimplesOperationFacts,
  SimplesRegimeFacts,
  ValueDestination,
} from "./simples.facts.ts";
import {
  GOVERNMENT_PURCHASE_FACTOR_SQL,
  ISS_SITUATIONS_SQL,
  NOT_IMPLEMENTED_SQL,
  REVENUE_TYPES_SQL,
  SIMPLES_ACTIVITY_SQL,
  SIMPLES_CLASSIFICATION_SQL,
  SIMPLES_DOCUMENT_SQL,
  SIMPLES_REGIME_SQL,
} from "./simples.queries.ts";

interface OperationFactsInput {
  date: string;
  documentType: number;
  crt: number | null;
  ibsCbsRegime: number | null;
  simplesOption: number | null;
  ibsCbsAssessmentRegime: number | null;
}

interface SimplesItemFactsInput {
  date: string;
  documentType: number;
  cClassTrib: string | null;
  activityCode: string | null;
  ncmCode: string | null;
  nbsCode: string | null;
}

interface FactsOutcome<Facts> {
  facts: Facts;
  rowsRead: number;
}

type ItemQueryName = keyof ReturnType<typeof prepareItemStatements>;

interface FoundRow {
  isFound: number;
}

interface DocumentRow {
  acronym: string;
  allowsZeroNcm: number;
  hasCalculatorTreatment: number;
  isEnabled: number;
  regimeVocabulary: RegimeVocabulary | null;
  rateDecimalPlaces: number | null;
  maxItems: number | null;
  allowsSelectiveTax: number | null;
}

interface RegimeRow {
  vocabulary: RegimeVocabulary;
  calculatesTaxes: number;
  generatesIbs: number | null;
  dueDestination: ValueDestination | null;
  pendingDestination: ValueDestination | null;
}

interface RevenueTypeRow {
  vocabulary: RegimeVocabulary | null;
  code: number;
  description: string;
  isRevenue: number;
  isSelectiveTaxRevenue: number;
  revenueFactor: string;
  isPending: number;
  requiresRates: number;
  refusesNonTaxableActivity: number;
}

interface ClassificationRow {
  revenueTypeCode: number;
  isAllowedOnDocument: number;
}

interface ActivityRow {
  code: string;
  isNonTaxable: number;
  isAllowedOnDocument: number;
  annexWithoutFatorR: string | null;
  annexWithFatorR: string | null;
  hasIssInSimples: number;
  allowsMunicipalBenefit: number;
}

interface IssSituationRow {
  field: string;
  value: number;
  rule: RatePairRule;
  pairType: RatePairType;
}

interface AnnexRow {
  hasAnnex: number;
  isListed: number;
  hasException: number;
  isListedWithoutException: number;
}

const NFSE_VOCABULARY: RegimeVocabulary = "NFSE";

// why: SIPA_CAMPO holds the upstream contract name of the field each ISS situation reads.
const ISS_SITUATION_FIELDS: Record<string, IssSituationField> = {
  CRT: "crt",
  regApIBSCBSSN: "ibsCbsAssessmentRegime",
  regApTribSN: "simplesTaxesAssessmentRegime",
  tribISSQN: "issTaxation",
  tpRetISSQN: "issWithholding",
  tpBM: "municipalBenefit",
};

const NO_ANNEX: AnnexFacts = {
  hasAnnex: false,
  isListed: false,
  hasException: false,
  isListedWithoutException: false,
};

async function findOperationFacts(database: D1Database, input: OperationFactsInput) {
  const { date, documentType, crt, ibsCbsRegime, simplesOption, ibsCbsAssessmentRegime } = input;
  const results = await database.batch([
    database.prepare(SIMPLES_DOCUMENT_SQL).bind(date, documentType),
    database
      .prepare(SIMPLES_REGIME_SQL)
      .bind(date, crt, ibsCbsRegime, simplesOption, ibsCbsAssessmentRegime),
    database.prepare(GOVERNMENT_PURCHASE_FACTOR_SQL).bind(date),
    database.prepare(REVENUE_TYPES_SQL).bind(date),
    database.prepare(ISS_SITUATIONS_SQL).bind(date),
    database.prepare(DATA_VERSION_SQL),
  ]);
  const [documents, regimes, factors, revenueTypes, issSituations, versions] = results;
  const revenueTypeRows = (revenueTypes?.results ?? []) as RevenueTypeRow[];
  const facts: SimplesOperationFacts = {
    document: toDocumentFacts(documents?.results.at(0) as DocumentRow | undefined),
    regime: toRegimeFacts(regimes?.results.at(0) as RegimeRow | undefined),
    governmentPurchaseFactor:
      (factors?.results.at(0) as { factor: string } | undefined)?.factor ?? null,
    revenueTypes: toRevenueTypes(revenueTypeRows.filter((row) => row.vocabulary === null)),
    nfseRevenueTypes: toRevenueTypes(orderNfseRowsFirst(revenueTypeRows)),
    issSituations: toIssSituations((issSituations?.results ?? []) as IssSituationRow[]),
    dataVersion:
      (versions?.results.at(0) as { dataVersion: string } | undefined)?.dataVersion ?? "unknown",
  };
  const outcome: FactsOutcome<SimplesOperationFacts> = {
    facts,
    rowsRead: results.reduce((total, result) => total + (result?.meta.rows_read ?? 0), 0),
  };
  return outcome;
}

function toDocumentFacts(row: DocumentRow | undefined) {
  if (!row) {
    return null;
  }

  const document: SimplesDocumentFacts = {
    acronym: row.acronym,
    allowsZeroNcm: row.allowsZeroNcm === 1,
    hasCalculatorTreatment: row.hasCalculatorTreatment === 1,
    isEnabled: row.isEnabled === 1,
    regimeVocabulary: row.regimeVocabulary,
    rateDecimalPlaces: row.rateDecimalPlaces,
    maxItems: row.maxItems,
    allowsSelectiveTax: row.allowsSelectiveTax === 1,
  };
  return document;
}

function toRegimeFacts(row: RegimeRow | undefined) {
  if (!row) {
    return null;
  }

  const regime: SimplesRegimeFacts = {
    vocabulary: row.vocabulary,
    hasTaxCalculation: row.calculatesTaxes === 1,
    hasIbs: row.generatesIbs === 1,
    dueDestination: row.dueDestination ?? "ZERO",
    pendingDestination: row.pendingDestination ?? "ZERO",
  };
  return regime;
}

// why: rows come newest first, and upstream keeps the first row of each code.
function toRevenueTypes(rows: RevenueTypeRow[]) {
  const revenueTypes = new Map<number, RevenueTypeFacts>();

  for (const row of rows) {
    if (!revenueTypes.has(row.code)) {
      revenueTypes.set(row.code, {
        code: row.code,
        description: row.description,
        isRevenue: row.isRevenue === 1,
        isSelectiveTaxRevenue: row.isSelectiveTaxRevenue === 1,
        revenueFactor: row.revenueFactor,
        isPending: row.isPending === 1,
        needsRates: row.requiresRates === 1,
        isNonTaxableActivityRefused: row.refusesNonTaxableActivity === 1,
      });
    }
  }

  return revenueTypes;
}

// why: ORDER BY CASE WHEN vocabulary IS NULL THEN 1 ELSE 0 END in buscarVigentesPorCodigoEVocabulario.
function orderNfseRowsFirst(rows: RevenueTypeRow[]) {
  const nfseRows = rows.filter((row) => row.vocabulary === NFSE_VOCABULARY);
  const defaultRows = rows.filter((row) => row.vocabulary === null);
  const orderedRows = [...nfseRows, ...defaultRows];
  return orderedRows;
}

function toIssSituations(rows: IssSituationRow[]) {
  const situations = rows.flatMap((row) => {
    const field = ISS_SITUATION_FIELDS[row.field];
    const situation: IssSituationFacts[] = field
      ? [{ field, value: row.value, rule: row.rule, pairType: row.pairType }]
      : [];
    return situation;
  });
  return situations;
}

// why: one D1 call for every item keeps a request far below the Free plan's 50 subrequests.
async function findSimplesItemsFacts(database: D1Database, inputs: SimplesItemFactsInput[]) {
  const statementsByItem = inputs.map((input) => prepareItemStatements(database, input));
  const names = Object.keys(statementsByItem[0] ?? {}) as ItemQueryName[];
  const results = await database.batch(
    statementsByItem.flatMap((statements) => names.map((name) => statements[name])),
  );
  const facts = statementsByItem.map((_statements, position) => {
    const offset = position * names.length;
    const rowsByQuery = Object.fromEntries(
      names.map((name, index) => [name, results[offset + index]?.results ?? []]),
    );
    const itemFacts = toItemFacts(rowsByQuery);
    return itemFacts;
  });
  const outcome: FactsOutcome<SimplesItemFacts[]> = {
    facts,
    rowsRead: results.reduce((total, result) => total + result.meta.rows_read, 0),
  };
  return outcome;
}

function prepareItemStatements(database: D1Database, input: SimplesItemFactsInput) {
  const { date, documentType, cClassTrib, activityCode, ncmCode, nbsCode } = input;
  const statements = {
    adjustment: database.prepare(NOT_IMPLEMENTED_SQL).bind(date, cClassTrib),
    ncmFound: database.prepare(NCM_FOUND_SQL).bind(date, ncmCode),
    nbsFound: database.prepare(NBS_FOUND_SQL).bind(date, nbsCode),
    classification: database
      .prepare(SIMPLES_CLASSIFICATION_SQL)
      .bind(date, cClassTrib, documentType),
    activity: database.prepare(SIMPLES_ACTIVITY_SQL).bind(date, activityCode, documentType),
    ncmAnnex: database.prepare(NCM_ANNEX_SQL).bind(date, cClassTrib, ncmCode),
    nbsAnnex: database.prepare(NBS_ANNEX_SQL).bind(date, cClassTrib, nbsCode),
  };
  return statements;
}

function toItemFacts(rowsByQuery: Record<string, unknown[]>) {
  const firstRow = <Row>(name: string) => rowsByQuery[name]?.at(0) as Row | undefined;
  const classification = firstRow<ClassificationRow>("classification");
  const activity = firstRow<ActivityRow>("activity");
  const facts: SimplesItemFacts = {
    hasAdjustment: firstRow<FoundRow>("adjustment")?.isFound === 1,
    isNcmFound: firstRow<FoundRow>("ncmFound")?.isFound === 1,
    isNbsFound: firstRow<FoundRow>("nbsFound")?.isFound === 1,
    classification: classification
      ? {
          revenueTypeCode: classification.revenueTypeCode,
          isAllowedOnDocument: classification.isAllowedOnDocument === 1,
        }
      : null,
    activity: activity
      ? {
          code: activity.code,
          isNonTaxable: activity.isNonTaxable === 1,
          isAllowedOnDocument: activity.isAllowedOnDocument === 1,
          annexWithoutFatorR: activity.annexWithoutFatorR,
          annexWithFatorR: activity.annexWithFatorR,
          hasIssInSimples: activity.hasIssInSimples === 1,
          allowsMunicipalBenefit: activity.allowsMunicipalBenefit === 1,
        }
      : null,
    ncmAnnex: toAnnexFacts(firstRow<AnnexRow>("ncmAnnex")),
    nbsAnnex: toAnnexFacts(firstRow<AnnexRow>("nbsAnnex")),
  };
  return facts;
}

function toAnnexFacts(row: AnnexRow | undefined) {
  if (!row) {
    return NO_ANNEX;
  }

  const annex: AnnexFacts = {
    hasAnnex: row.hasAnnex === 1,
    isListed: row.isListed === 1,
    hasException: row.hasException === 1,
    isListedWithoutException: row.isListedWithoutException === 1,
  };
  return annex;
}

export type { OperationFactsInput, SimplesItemFactsInput };
export { findOperationFacts, findSimplesItemsFacts };
