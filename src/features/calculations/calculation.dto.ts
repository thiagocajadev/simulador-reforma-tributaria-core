// The calculation contract shared by the Worker (producer) and the SPA (consumer). Every decimal
// travels as a plain string ("1200.00", "8.8123"), never as a JSON number, so no value passes
// through binary floating point. Rates are percentages, as the upstream calculator publishes them.

interface NominalRates {
  cbsRate: string;
  ibsUfRate: string;
  ibsMunRate: string;
}

// The Imposto Seletivo group of an item (NF-e and NFC-e, from 2027). Its base is the item's
// baseAmount. The rates are the ones upstream takes in aliquotasNominais.impostoSeletivo: ad
// valorem in percent, ad rem in reais per unit of `unit`, multiplied by `quantity`.
interface SelectiveTaxInput {
  cstCode: string;
  cClassTrib: string;
  adValoremRate?: string;
  adRemRate?: string;
  quantity?: string;
  unit?: string;
}

interface OperationItem {
  itemNumber: number;
  ncmCode?: string;
  nbsCode?: string;
  cstCode: string;
  cClassTrib: string;
  baseAmount: string;
  nominalRates?: NominalRates;
  selectiveTax?: SelectiveTaxInput;
}

interface Operation {
  taxEventDate: string;
  uf: string;
  municipalityCode: number;
  documentType?: number;
  items: OperationItem[];
}

// The figures the calculator publishes, the ones the golden fixtures pin.
interface PublishedTax {
  rate: string;
  reductionPercent: string | null;
  effectiveRate: string | null;
  amount: string;
}

// Where the rate came from: the visitor (nominalRates), the reference rate adjusted by the UF or
// the municipality (standard), the national reference, the classification's own rate, or none.
type RateSource = "nominal" | "standard" | "reference" | "classification" | "none";

type CalculationStepName = "rate" | "effectiveRate" | "base" | "calculatedTax" | "taxDue";

// One formula of TRATAMENTO_TRIBUTARIO as the engine ran it. `values` holds every variable the
// formula names, as it consumed them: rates and percentages as fractions, money in reais. A rate
// that no formula produced has `formula: null` and no values. `roundedToPlaces` is set only
// when the document layout rounds the result (the Simples rate on the NFS-e: 2 places).
interface CalculationStep {
  step: CalculationStepName;
  formula: string | null;
  values: Record<string, string>;
  result: string;
  roundedToPlaces?: number;
}

interface TaxResult extends PublishedTax {
  rateSource: RateSource;
  calculationSteps: CalculationStep[];
}

interface LegalGround {
  shortReference: string;
  description: string;
}

type CalculatedStatus = "calculated" | "simulated";

// The IS figures the calculator publishes (the IS group of the NF-e): a rate the item does not
// carry is null, and unit and quantity appear only with an ad rem rate.
interface PublishedSelectiveTax {
  cstCode: string;
  cClassTrib: string;
  baseAmount: string;
  adValoremRate: string | null;
  adRemRate: string | null;
  unit: string | null;
  quantity: string | null;
  amount: string;
}

// Where each IS rate came from: typed by the visitor, or the open data once it holds a value.
type SelectiveTaxRateSource = "nominal" | "official";

interface SelectiveTaxResult extends PublishedSelectiveTax {
  treatmentDescription: string;
  rateSources: {
    adValorem: SelectiveTaxRateSource | null;
    adRem: SelectiveTaxRateSource | null;
  };
  calculationSteps: CalculationStep[];
}

interface ItemTaxes {
  baseAmount: string;
  cbs: TaxResult;
  ibsUf: TaxResult;
  ibsMun: TaxResult;
  ibsAmount: string;
}

// why: a CST without the IBS/CBS group (immunity, non-incidence) yields no values upstream.
interface CalculatedItem {
  itemNumber: number;
  status: CalculatedStatus;
  cstCode: string;
  cClassTrib: string;
  treatmentDescription: string;
  legalGround: LegalGround | null;
  taxes: ItemTaxes | null;
  selectiveTax: SelectiveTaxResult | null;
}

interface RuleViolation {
  ruleCode: string;
  field: string;
  message: string;
}

interface RejectedItem {
  itemNumber: number;
  status: "rejected";
  violations: RuleViolation[];
}

type NotImplementedReason =
  | "adjustment"
  | "deferral"
  | "taxRelief"
  | "monophasic"
  | "combinedRates";

interface NotImplementedItem {
  itemNumber: number;
  status: "notImplemented";
  reason: NotImplementedReason;
}

type ItemResult = CalculatedItem | RejectedItem | NotImplementedItem;

interface CalculationTotals {
  baseAmount: string;
  cbsAmount: string;
  ibsUfAmount: string;
  ibsMunAmount: string;
  ibsAmount: string;
  selectiveTaxAmount: string;
}

interface CalculationResult {
  items: ItemResult[];
  totals: CalculationTotals;
  dataVersion: string;
}

export type {
  CalculatedItem,
  CalculatedStatus,
  CalculationResult,
  CalculationStep,
  CalculationStepName,
  CalculationTotals,
  ItemResult,
  ItemTaxes,
  LegalGround,
  NominalRates,
  NotImplementedItem,
  NotImplementedReason,
  Operation,
  OperationItem,
  PublishedSelectiveTax,
  PublishedTax,
  RateSource,
  RejectedItem,
  RuleViolation,
  SelectiveTaxInput,
  SelectiveTaxRateSource,
  SelectiveTaxResult,
  TaxResult,
};
