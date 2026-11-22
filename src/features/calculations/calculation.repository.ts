// The open data one calculation reads, mapped into the facts the rules and the calculation use.
// One D1 batch per item; the SQL lives in calculation.queries.ts.

import type { TaxName } from "@/features/rates/rates.dto.ts";
import type { LegalGround } from "./calculation.dto.ts";
import type {
  AnnexFacts,
  CstFacts,
  DocumentTypeFacts,
  ItemFacts,
  SelectiveTaxClassificationFacts,
  SelectiveTaxRatesFacts,
  TaxPercents,
  TreatmentFacts,
} from "./calculation.facts.ts";
import {
  CLASSIFICATION_RATES_SQL,
  CLASSIFICATION_SQL,
  CST_SQL,
  DATA_VERSION_SQL,
  DOCUMENT_TYPE_LINKS_SQL,
  DOCUMENT_TYPE_SQL,
  LEGAL_GROUND_SQL,
  NBS_ANNEX_SQL,
  NBS_FOUND_SQL,
  NCM_ANNEX_SQL,
  NCM_FOUND_SQL,
  REDUCTION_PERCENTS_SQL,
  TREATMENT_SQL,
} from "./calculation.queries.ts";
import {
  SELECTIVE_TAX_CLASSIFICATION_SQL,
  SELECTIVE_TAX_CST_SQL,
  SELECTIVE_TAX_RATES_SQL,
} from "./selective.tax.queries.ts";

interface ItemFactsInput {
  date: string;
  ncmCode: string | null;
  nbsCode: string | null;
  cstCode: string;
  cClassTrib: string;
  selectiveTaxCstCode: string | null;
  selectiveTaxClassification: string | null;
}

interface ItemsFactsOutcome {
  facts: ItemFacts[];
  rowsRead: number;
}

type ItemQueryName = keyof ReturnType<typeof prepareItemStatements>;

interface FoundRow {
  isFound: number;
}

interface CstRow {
  hasTaxGroup: number;
}

interface ClassificationRow {
  cstCode: string;
  hasReductionGroup: number;
  rateType: string;
}

interface DocumentTypeLinkRow {
  documentTypeId: number;
}

interface TreatmentRow {
  description: string;
  rateFormula: string | null;
  effectiveRateFormula: string | null;
  baseFormula: string;
  calculatedTaxFormula: string;
  taxDueFormula: string | null;
  deferralPercentFormula: string | null;
  deferralAmountFormula: string | null;
  hasReduction: number;
  hasAdjustment: number;
  isMonophasic: number;
  requiresTaxRelief: number;
}

interface TaxPercentRow {
  taxId: number;
  percent: number | null;
}

interface AnnexRow {
  hasAnnex: number;
  isListed: number;
  hasException: number;
  isListedWithoutException: number;
}

interface SelectiveTaxClassificationRow {
  cstCode: string;
  treatmentDescription: string | null;
  baseFormula: string | null;
  calculatedTaxFormula: string | null;
  taxDueFormula: string | null;
}

interface SelectiveTaxRatesRow {
  adValorem: string | null;
  adRem: string | null;
}

interface DocumentTypeRow {
  id: number;
  acronym: string;
  allowsZeroNcm: number;
  isSupported: number;
}

const TAX_NAMES_BY_ID: Record<number, TaxName> = { 2: "CBS", 3: "IBS_UF", 4: "IBS_MUN" };
const FULL_NCM_LENGTH = 8;
const ACRONYM_SEPARATORS = /[\s\-_]/g;

const NO_ANNEX: AnnexFacts = {
  hasAnnex: false,
  isListed: false,
  hasException: false,
  isListedWithoutException: false,
};

// why: one D1 call for every item keeps a request far below the Free plan's 50 subrequests.
async function findItemsFacts(database: D1Database, inputs: ItemFactsInput[]) {
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
  const outcome: ItemsFactsOutcome = {
    facts,
    rowsRead: results.reduce((total, result) => total + result.meta.rows_read, 0),
  };
  return outcome;
}

function prepareItemStatements(database: D1Database, input: ItemFactsInput) {
  const { date, ncmCode, nbsCode, cstCode, cClassTrib } = input;
  const { selectiveTaxCstCode, selectiveTaxClassification } = input;
  const fullNcmCode = ncmCode?.length === FULL_NCM_LENGTH ? ncmCode : null;
  const statements = {
    ncmFound: database.prepare(NCM_FOUND_SQL).bind(date, ncmCode),
    nbsFound: database.prepare(NBS_FOUND_SQL).bind(date, nbsCode),
    cst: database.prepare(CST_SQL).bind(date, cstCode),
    classification: database.prepare(CLASSIFICATION_SQL).bind(date, cClassTrib),
    documentTypeLinks: database.prepare(DOCUMENT_TYPE_LINKS_SQL).bind(date, cClassTrib),
    treatment: database.prepare(TREATMENT_SQL).bind(date, cClassTrib),
    reductionPercents: database.prepare(REDUCTION_PERCENTS_SQL).bind(date, cClassTrib),
    classificationRates: database.prepare(CLASSIFICATION_RATES_SQL).bind(date, cClassTrib),
    ncmAnnex: database.prepare(NCM_ANNEX_SQL).bind(date, cClassTrib, ncmCode),
    nbsAnnex: database.prepare(NBS_ANNEX_SQL).bind(date, cClassTrib, nbsCode),
    selectiveTaxCst: database.prepare(SELECTIVE_TAX_CST_SQL).bind(date, selectiveTaxCstCode),
    selectiveTaxClassification: database
      .prepare(SELECTIVE_TAX_CLASSIFICATION_SQL)
      .bind(date, selectiveTaxClassification),
    selectiveTaxRates: database.prepare(SELECTIVE_TAX_RATES_SQL).bind(date, fullNcmCode),
    legalGround: database.prepare(LEGAL_GROUND_SQL).bind(date, cClassTrib),
  };
  return statements;
}

function toItemFacts(rowsByQuery: Record<string, unknown[]>) {
  const firstRow = <Row>(name: string) => rowsByQuery[name]?.at(0) as Row | undefined;
  const allRows = <Row>(name: string) => (rowsByQuery[name] ?? []) as Row[];
  const classification = firstRow<ClassificationRow>("classification");
  const linkedDocumentTypeIds = allRows<DocumentTypeLinkRow>("documentTypeLinks").map(
    (row) => row.documentTypeId,
  );
  const facts: ItemFacts = {
    isNcmFound: firstRow<FoundRow>("ncmFound")?.isFound === 1,
    isNbsFound: firstRow<FoundRow>("nbsFound")?.isFound === 1,
    cst: toCstFacts(firstRow<CstRow>("cst")),
    classification: classification
      ? {
          cstCode: classification.cstCode,
          hasReductionGroup: classification.hasReductionGroup === 1,
          rateType: classification.rateType,
          linkedDocumentTypeIds,
        }
      : null,
    treatment: toTreatmentFacts(firstRow<TreatmentRow>("treatment")),
    reductionPercents: toTaxPercents(allRows<TaxPercentRow>("reductionPercents")),
    classificationRates: toTaxPercents(allRows<TaxPercentRow>("classificationRates")),
    ncmAnnex: toAnnexFacts(firstRow<AnnexRow>("ncmAnnex")),
    nbsAnnex: toAnnexFacts(firstRow<AnnexRow>("nbsAnnex")),
    selectiveTax: {
      isCstFound: firstRow<FoundRow>("selectiveTaxCst")?.isFound === 1,
      classification: toSelectiveTaxClassification(
        firstRow<SelectiveTaxClassificationRow>("selectiveTaxClassification"),
      ),
      rates: toSelectiveTaxRates(firstRow<SelectiveTaxRatesRow>("selectiveTaxRates")),
    },
    legalGround: firstRow<LegalGround>("legalGround") ?? null,
  };
  return facts;
}

function toSelectiveTaxClassification(row: SelectiveTaxClassificationRow | undefined) {
  if (!row) {
    return null;
  }

  const hasTreatment = row.treatmentDescription !== null && row.baseFormula !== null;
  const classification: SelectiveTaxClassificationFacts = {
    cstCode: row.cstCode,
    treatment: hasTreatment
      ? {
          description: row.treatmentDescription ?? "",
          formulas: {
            base: row.baseFormula ?? "",
            calculatedTax: row.calculatedTaxFormula ?? "0",
            taxDue: toFormula(row.taxDueFormula),
          },
        }
      : null,
  };
  return classification;
}

// why: each rate comes as JSON, so a row whose value is NULL still reads as a row.
function toSelectiveTaxRates(row: SelectiveTaxRatesRow | undefined) {
  const adValorem = row?.adValorem
    ? (JSON.parse(row.adValorem) as { percent: number | null })
    : null;
  const adRem = row?.adRem
    ? (JSON.parse(row.adRem) as { amount: number | null; unit: string })
    : null;
  const rates: SelectiveTaxRatesFacts = {
    adValorem: adValorem ? { percent: toOptionalPlainDecimal(adValorem.percent) } : null,
    adRem: adRem ? { amount: toOptionalPlainDecimal(adRem.amount), unit: adRem.unit } : null,
  };
  return rates;
}

function toOptionalPlainDecimal(value: number | null) {
  const text = value === null ? null : toPlainDecimal(value);
  return text;
}

function toCstFacts(row: CstRow | undefined) {
  if (!row) {
    return null;
  }

  const cst: CstFacts = { hasTaxGroup: row.hasTaxGroup === 1 };
  return cst;
}

function toTreatmentFacts(row: TreatmentRow | undefined) {
  if (!row) {
    return null;
  }

  const treatment: TreatmentFacts = {
    description: row.description,
    formulas: {
      rate: toFormula(row.rateFormula),
      effectiveRate: toFormula(row.effectiveRateFormula),
      base: row.baseFormula,
      calculatedTax: row.calculatedTaxFormula,
      taxDue: toFormula(row.taxDueFormula),
    },
    hasReduction: row.hasReduction === 1,
    hasAdjustment: row.hasAdjustment === 1,
    hasDeferral:
      toFormula(row.deferralPercentFormula) !== null &&
      toFormula(row.deferralAmountFormula) !== null,
    isMonophasic: row.isMonophasic === 1,
    requiresTaxRelief: row.requiresTaxRelief === 1,
  };
  return treatment;
}

// why: blank formulas are stored as "" and count as absent upstream (StringUtils.isNotBlank).
function toFormula(formula: string | null) {
  const present = formula?.trim() ? formula : null;
  return present;
}

function toTaxPercents(rows: TaxPercentRow[]) {
  const percents: TaxPercents = { CBS: null, IBS_UF: null, IBS_MUN: null };

  for (const row of rows) {
    const tax = TAX_NAMES_BY_ID[row.taxId];

    if (tax && row.percent !== null) {
      percents[tax] = toPlainDecimal(row.percent);
    }
  }

  return percents;
}

// why: String(1e-7) is "1e-7", which the decimal parser refuses; REAL percents print in full.
function toPlainDecimal(value: number) {
  const text = value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  return text;
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

async function findDocumentType(
  database: D1Database,
  input: { date: string; documentType: number },
) {
  const { date, documentType } = input;
  const row = await database
    .prepare(DOCUMENT_TYPE_SQL)
    .bind(date, documentType)
    .first<DocumentTypeRow>();

  if (!row) {
    return null;
  }

  const facts: DocumentTypeFacts = {
    id: row.id,
    acronym: row.acronym.toUpperCase().replace(ACRONYM_SEPARATORS, ""),
    allowsZeroNcm: row.allowsZeroNcm === 1,
    isSupported: row.isSupported === 1,
  };
  return facts;
}

async function findDataVersion(database: D1Database) {
  const dataVersion = await database.prepare(DATA_VERSION_SQL).first<string>("dataVersion");
  const knownVersion = dataVersion ?? "unknown";
  return knownVersion;
}

export type { ItemFactsInput, ItemsFactsOutcome };
export { findDataVersion, findDocumentType, findItemsFacts };
