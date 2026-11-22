// Calculates one operation, as CalculadoraService.calcularTributos does: the location and the
// document type are operation rules (a 400), then each item is assessed and calculated on its
// own, so a rejected item does not hide the others (the upstream observability endpoint).

import { composeRate } from "@/features/rates/rates.compose.ts";
import { findRateComponents } from "@/features/rates/rates.repository.ts";
import { findMunicipality, findUfCode } from "@/shared/data/location.lookup.ts";
import type { ValidationIssue } from "@/shared/http/envelope.ts";
import { addDecimals, type Decimal, formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";
import type {
  CalculationResult,
  CalculationTotals,
  ItemResult,
  ItemTaxes,
  Operation,
  OperationItem,
  SelectiveTaxResult,
} from "./calculation.dto.ts";
import type { DocumentTypeFacts, ItemFacts } from "./calculation.facts.ts";
import {
  findDataVersion,
  findDocumentType,
  findItemsFacts,
  type ItemFactsInput,
} from "./calculation.repository.ts";
import { assessItem, type CalculableItem, type ItemAssessment } from "./item.validate.ts";
import { calculateSelectiveTax } from "./selective.tax.calculate.ts";
import { hasResolvedRate, resolveSelectiveTaxRates } from "./selective.tax.rates.ts";
import { calculateItemTaxes, type LocationRates } from "./tax.calculate.ts";

interface OperationScope {
  date: string;
  documentType: DocumentTypeFacts | null;
  locationRates: LocationRates;
}

type ScopeOutcome =
  | { isValid: true; scope: OperationScope }
  | { isValid: false; issues: ValidationIssue[] };

type OperationOutcome =
  | { kind: "invalid"; issues: ValidationIssue[] }
  | { kind: "calculated"; result: CalculationResult; rowsRead: number };

const ISO_DATE_LENGTH = 10;
const ZERO_NCM_CODES = new Set(["00", "00000000"]);
const MONEY = { minPlaces: 2, maxPlaces: 2 };

async function calculateOperation(database: D1Database, operation: Operation) {
  const scopeOutcome = await resolveScope(database, operation);

  if (!scopeOutcome.isValid) {
    const invalid: OperationOutcome = { kind: "invalid", issues: scopeOutcome.issues };
    return invalid;
  }

  const { scope } = scopeOutcome;
  const operationItems = operation.items.map((item) => clearZeroNcm(item, scope.documentType));
  const [itemsFacts, dataVersion] = await Promise.all([
    findItemsFacts(
      database,
      operationItems.map((item) => toFactsInput(item, scope.date)),
    ),
    findDataVersion(database),
  ]);
  const results = operationItems.map((item, position) =>
    calculateItem({ item, position, scope, facts: itemsFacts.facts[position] }),
  );
  const result: CalculationResult = { items: results, totals: sumTotals(results), dataVersion };
  const calculated: OperationOutcome = {
    kind: "calculated",
    result,
    rowsRead: itemsFacts.rowsRead,
  };
  return calculated;
}

// why: the upstream date is the local date of dhFatoGerador, offset kept (OperacaoInput.java:80).
async function resolveScope(database: D1Database, operation: Operation): Promise<ScopeOutcome> {
  const date = operation.taxEventDate.slice(0, ISO_DATE_LENGTH);
  const [location, documentTypeCheck] = await Promise.all([
    checkLocation(database, operation),
    checkDocumentType(database, { date, documentType: operation.documentType }),
  ]);
  const issues = [...location.issues, ...documentTypeCheck.issues];

  if (issues.length > 0 || location.ufCode === null) {
    const invalid: ScopeOutcome = { isValid: false, issues };
    return invalid;
  }

  const { ufCode } = location;
  const locationRates = await findLocationRates(database, {
    date,
    ufCode,
    municipalityCode: operation.municipalityCode,
  });
  const valid: ScopeOutcome = {
    isValid: true,
    scope: { date, documentType: documentTypeCheck.documentType, locationRates },
  };
  return valid;
}

async function checkLocation(database: D1Database, operation: Operation) {
  const { uf, municipalityCode } = operation;
  const ufCode = await findUfCode(database, uf);

  if (ufCode === null) {
    const unknownUf = {
      ufCode,
      issues: [{ field: "uf", message: `Unknown state code "${uf}".` }],
    };
    return unknownUf;
  }

  const municipality = await findMunicipality(database, municipalityCode);
  const issues: ValidationIssue[] =
    municipality?.ufCode === ufCode
      ? []
      : [
          {
            field: "municipalityCode",
            message: `Municipality ${municipalityCode} is not in ${uf}.`,
          },
        ];
  const checked = { ufCode, issues };
  return checked;
}

// why: an unknown or unsupported tpDoc fails the whole operation upstream (REG-028, REG-038).
async function checkDocumentType(
  database: D1Database,
  input: { date: string; documentType?: number },
) {
  const { date, documentType } = input;

  if (documentType === undefined) {
    const absent = { documentType: null, issues: [] as ValidationIssue[] };
    return absent;
  }

  const facts = await findDocumentType(database, { date, documentType });
  const issues: ValidationIssue[] = [];

  if (!facts) {
    issues.push({
      field: "documentType",
      message: `Document type ${documentType} is not in force on ${date} (REG-028).`,
    });
  } else if (!facts.isSupported) {
    issues.push({
      field: "documentType",
      message: `Document type ${documentType} is not supported by the calculator (REG-038).`,
    });
  }

  const checked = { documentType: facts, issues };
  return checked;
}

async function findLocationRates(
  database: D1Database,
  input: { date: string; ufCode: number; municipalityCode: number },
) {
  const components = await findRateComponents(database, input);
  const locationRates: LocationRates = { CBS: null, IBS_UF: null, IBS_MUN: null };

  for (const { tax, ...rateComponents } of components) {
    locationRates[tax] = {
      applicable: composeRate(rateComponents).rate,
      reference: composeRate({ ...rateComponents, standardRate: null, applicationMethod: null })
        .rate,
    };
  }

  return locationRates;
}

function toFactsInput(item: OperationItem, date: string) {
  const input: ItemFactsInput = {
    date,
    ncmCode: item.ncmCode ?? null,
    nbsCode: item.nbsCode ?? null,
    cstCode: item.cstCode,
    cClassTrib: item.cClassTrib,
    selectiveTaxCstCode: item.selectiveTax?.cstCode ?? null,
    selectiveTaxClassification: item.selectiveTax?.cClassTrib ?? null,
  };
  return input;
}

function calculateItem(input: {
  item: OperationItem;
  position: number;
  scope: OperationScope;
  facts: ItemFacts | undefined;
}) {
  const { item, position, scope, facts } = input;

  if (!facts) {
    throw new Error(`No open data facts for item ${item.itemNumber}`);
  }

  const assessment = assessItem({
    position,
    item,
    facts,
    date: scope.date,
    documentType: scope.documentType,
  });
  const result = toItemResult({ assessment, item, facts, scope, position });
  return result;
}

// why: NF-e and NFC-e accept "00" or "00000000" for an item without NCM (ItemOperacaoInput.ajustarNcm).
function clearZeroNcm(item: OperationItem, documentType: DocumentTypeFacts | null) {
  const isZeroNcm = item.ncmCode !== undefined && ZERO_NCM_CODES.has(item.ncmCode);

  if (!documentType?.allowsZeroNcm || !isZeroNcm) {
    return item;
  }

  const withoutNcm: OperationItem = { ...item, ncmCode: undefined };
  return withoutNcm;
}

function toItemResult(input: {
  assessment: ItemAssessment;
  item: OperationItem;
  facts: ItemFacts;
  scope: OperationScope;
  position: number;
}): ItemResult {
  const { assessment, item } = input;

  switch (assessment.kind) {
    case "rejected": {
      const rejected: ItemResult = {
        itemNumber: item.itemNumber,
        status: "rejected",
        violations: [assessment.violation],
      };
      return rejected;
    }
    case "notImplemented": {
      const notImplemented: ItemResult = {
        itemNumber: item.itemNumber,
        status: "notImplemented",
        reason: assessment.reason,
      };
      return notImplemented;
    }
    case "calculable": {
      const calculated = calculateAssessedItem({ ...input, assessment });
      return calculated;
    }
  }
}

function calculateAssessedItem(input: {
  assessment: CalculableItem;
  item: OperationItem;
  facts: ItemFacts;
  scope: OperationScope;
  position: number;
}): ItemResult {
  const { assessment, item, facts, scope, position } = input;
  const { cst, classification, treatment } = assessment;
  const selectiveTax = calculateItemSelectiveTax(item, facts);
  const selectiveTaxAmount = parseDecimal(selectiveTax?.amount ?? "0");
  const outcome = cst.hasTaxGroup
    ? calculateItemTaxes({
        item,
        hasReductionGroup: classification.hasReductionGroup,
        rateType: classification.rateType,
        treatment,
        reductionPercents: facts.reductionPercents,
        classificationRates: facts.classificationRates,
        locationRates: scope.locationRates,
        selectiveTaxAmount,
      })
    : null;

  if (outcome?.kind === "missingRate") {
    const rejected: ItemResult = {
      itemNumber: item.itemNumber,
      status: "rejected",
      violations: [
        {
          ruleCode: "REG-023",
          field: `items[${position}]`,
          message: `No "${outcome.rateType}" rate for ${outcome.tax} under cClassTrib ${item.cClassTrib} on ${scope.date}.`,
        },
      ],
    };
    return rejected;
  }

  const calculated: ItemResult = {
    itemNumber: item.itemNumber,
    status: isSimulated(item, selectiveTax) ? "simulated" : "calculated",
    cstCode: item.cstCode,
    cClassTrib: item.cClassTrib,
    treatmentDescription: treatment.description,
    legalGround: facts.legalGround,
    taxes: outcome?.taxes ?? null,
    selectiveTax,
  };
  return calculated;
}

// why: the IS runs only where a rate resolves, typed or official (CalculoTributoService.java:96).
function calculateItemSelectiveTax(item: OperationItem, facts: ItemFacts) {
  const treatment = facts.selectiveTax.classification?.treatment;
  const resolved = resolveSelectiveTaxRates(item, facts.selectiveTax.rates);

  if (!item.selectiveTax || !treatment || !hasResolvedRate(resolved)) {
    return null;
  }

  const selectiveTax = calculateSelectiveTax({
    item,
    treatment,
    rates: facts.selectiveTax.rates,
  });
  return selectiveTax;
}

function isSimulated(item: OperationItem, selectiveTax: SelectiveTaxResult | null) {
  const { adValorem, adRem } = selectiveTax?.rateSources ?? { adValorem: null, adRem: null };
  const isTypedRate = Boolean(item.nominalRates) || adValorem === "nominal" || adRem === "nominal";
  return isTypedRate;
}

// why: totals add the published item values, so they always match the sum of the items.
function sumTotals(results: ItemResult[]) {
  const itemTaxes = results.flatMap((result) =>
    "taxes" in result && result.taxes ? [result.taxes] : [],
  );
  const selectiveTaxes = results.flatMap((result) =>
    "selectiveTax" in result && result.selectiveTax ? [result.selectiveTax] : [],
  );
  const selectiveTaxAmount = selectiveTaxes.reduce<Decimal>(
    (total, selectiveTax) => addDecimals(total, parseDecimal(selectiveTax.amount)),
    parseDecimal("0"),
  );
  const sumOf = (pick: (taxes: ItemTaxes) => string) =>
    formatDecimal(
      itemTaxes.reduce<Decimal>(
        (total, taxes) => addDecimals(total, parseDecimal(pick(taxes))),
        parseDecimal("0"),
      ),
      MONEY,
    );
  const totals: CalculationTotals = {
    baseAmount: sumOf((taxes) => taxes.baseAmount),
    cbsAmount: sumOf((taxes) => taxes.cbs.amount),
    ibsUfAmount: sumOf((taxes) => taxes.ibsUf.amount),
    ibsMunAmount: sumOf((taxes) => taxes.ibsMun.amount),
    ibsAmount: sumOf((taxes) => taxes.ibsAmount),
    selectiveTaxAmount: formatDecimal(selectiveTaxAmount, MONEY),
  };
  return totals;
}

export type { OperationOutcome };
export { calculateOperation };
