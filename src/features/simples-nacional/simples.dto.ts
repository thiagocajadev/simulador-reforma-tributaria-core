// The Simples Nacional calculation contract shared by the Worker (producer) and the SPA (consumer),
// ported from two upstream endpoints: the classic one for documents with CRT (NF-e, NFC-e) and the
// non-assisted one for the NFS-e (POST /calculadora/observabilidade/simples-nacional[/nao-assistido]).
// Every decimal travels as a plain string, as in calculation.dto.ts. Rates are percentages: the
// effective rates the PGDAS publishes for the company, with every place it publishes.

import type { CalculationStep, RuleViolation } from "@/features/calculations/calculation.dto.ts";

interface SimplesOperationItem {
  itemNumber: number;
  activityCode?: string;
  cClassTrib: string;
  ncmCode?: string;
  nbsCode?: string;
  baseAmount: string;
  selectiveTaxAmount?: string;
  cbsSimplesRate?: string;
  ibsSimplesRate?: string;
  issTaxation?: number;
  issWithholding?: number;
  municipalBenefit?: number;
}

// Documents with CRT (NF-e, NFC-e): each item carries its own rates.
interface SimplesOperation {
  taxEventDate: string;
  documentType: number;
  crt: number;
  ibsCbsRegime?: number;
  governmentEntity?: number;
  items: SimplesOperationItem[];
}

interface SimplesRatePair {
  cbsSimplesRate?: string;
  ibsSimplesRate?: string;
}

// why: annexes III to V share the ISS, so the PGDAS publishes a second pair without its redistribution.
interface SimplesAnnexRates extends SimplesRatePair {
  withoutIssRedistribution?: SimplesRatePair;
}

// The company's row of effective rates for the period, as the PGDAS publishes it.
interface SimplesEffectiveRates {
  isFatorRAtLeast28?: boolean;
  isSublimitExceeded?: boolean;
  annexI?: SimplesRatePair;
  annexII?: SimplesRatePair;
  annexIII?: SimplesAnnexRates;
  annexIV?: SimplesAnnexRates;
  annexV?: SimplesAnnexRates;
}

// why: the NFS-e has no CRT; the provider's option and assessment regimes replace it, and the
// calculator picks each item's rate pair from effectiveRates. Exactly one item (VSN-034).
interface NfseSimplesOperation {
  taxEventDate: string;
  documentType: number;
  simplesOption: number;
  ibsCbsAssessmentRegime?: number;
  simplesTaxesAssessmentRegime?: number;
  governmentEntity?: number;
  effectiveRates?: SimplesEffectiveRates;
  items: SimplesOperationItem[];
}

// What the endpoint reads before it knows the document: the fields of both families, every one
// optional, since the document type on the date decides which of them hold.
interface SimplesCalculationRequest {
  taxEventDate: string;
  documentType: number;
  crt?: number;
  ibsCbsRegime?: number;
  simplesOption?: number;
  ibsCbsAssessmentRegime?: number;
  simplesTaxesAssessmentRegime?: number;
  governmentEntity?: number;
  effectiveRates?: SimplesEffectiveRates;
  items: SimplesOperationItem[];
}

interface RevenueType {
  code: number;
  description: string;
}

// why: a rate the revenue type does not require may be left out; its amounts are then zero, and
// calculationSteps is empty. The steps follow the port (no formula is stored for the Simples): the
// rate, shifted when the buyer is a government entity, then revenue x revenue factor x rate.
interface SimplesTax {
  rate: string | null;
  dueAmount: string;
  pendingAmount: string;
  calculationSteps: CalculationStep[];
}

// why: with CRT 2 the IBS is declared by the issuer under the regular regime, so it is null here;
// the NFS-e has no Imposto Seletivo, so selectiveTaxAmount is null on it.
interface SimplesCalculatedItem {
  itemNumber: number;
  status: "calculated";
  grossRevenue: string;
  revenueType: RevenueType;
  baseAmount: string;
  cbs: SimplesTax;
  ibs: SimplesTax | null;
  selectiveTaxAmount: string | null;
  itemTotal: string;
}

type NotCalculatedReason =
  | "activityMissing"
  | "activityUnknown"
  | "activityNotAllowed"
  | "revenueOnlyRegime";

interface SimplesNotCalculatedItem {
  itemNumber: number;
  status: "notCalculated";
  reason: NotCalculatedReason;
  grossRevenue: string;
  revenueType: RevenueType;
}

interface SimplesRejectedItem {
  itemNumber: number;
  status: "rejected";
  violations: RuleViolation[];
}

interface SimplesNotImplementedItem {
  itemNumber: number;
  status: "notImplemented";
  reason: "adjustment";
}

type SimplesItemResult =
  | SimplesCalculatedItem
  | SimplesNotCalculatedItem
  | SimplesRejectedItem
  | SimplesNotImplementedItem;

// why: upstream leaves a total out when no item has the value (no IBS at all with CRT 2).
interface SimplesTotals {
  grossRevenue: string;
  baseAmount: string | null;
  ibsDueAmount: string | null;
  ibsPendingAmount: string | null;
  cbsDueAmount: string | null;
  cbsPendingAmount: string | null;
  selectiveTaxAmount: string | null;
  taxTotal: string | null;
}

interface SimplesCalculationResult {
  items: SimplesItemResult[];
  totals: SimplesTotals | null;
  dataVersion: string;
}

export type {
  NfseSimplesOperation,
  NotCalculatedReason,
  RevenueType,
  SimplesAnnexRates,
  SimplesCalculatedItem,
  SimplesCalculationRequest,
  SimplesCalculationResult,
  SimplesEffectiveRates,
  SimplesItemResult,
  SimplesNotCalculatedItem,
  SimplesNotImplementedItem,
  SimplesOperation,
  SimplesOperationItem,
  SimplesRatePair,
  SimplesRejectedItem,
  SimplesTax,
  SimplesTotals,
};
