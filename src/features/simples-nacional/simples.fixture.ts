// Reads the Simples golden fixtures (fixtures/simples-nacional, classic endpoint, and
// fixtures/simples-nacional-nfse, non-assisted endpoint) into this project's contract: the upstream
// operation becomes a SimplesOperation or an NfseSimplesOperation, and the upstream response becomes
// the item results, totals or operation issues the engine must reproduce. Test-only; see the
// fixtures READMEs.

import { addDecimals, formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";
import type {
  NfseSimplesOperation,
  NotCalculatedReason,
  SimplesAnnexRates,
  SimplesCalculatedItem,
  SimplesEffectiveRates,
  SimplesItemResult,
  SimplesOperation,
  SimplesOperationItem,
  SimplesRatePair,
  SimplesTax,
  SimplesTotals,
} from "./simples.dto.ts";

interface UpstreamSimplesItem {
  numero: number;
  cAtivSN?: string;
  cClassTrib: string;
  ncm?: string;
  nbs?: string;
  baseCalculo: string;
  valorImpostoSeletivo?: string;
  pCBSSN?: string;
  pIBSSN?: string;
}

interface UpstreamSimplesOperation {
  data: string;
  tpDoc: string;
  CRT: string;
  tpRegimeIBSCBS?: string;
  tpEnteGov?: string;
  itens: UpstreamSimplesItem[];
}

interface UpstreamNfseItem extends Omit<UpstreamSimplesItem, "pCBSSN" | "pIBSSN"> {
  tribISSQN?: string;
  tpRetISSQN?: string;
  tpBM?: string;
}

interface UpstreamRatePair {
  pCBSSN?: string;
  pIBSSN?: string;
}

interface UpstreamAnnexRates extends UpstreamRatePair {
  semRedistribuicaoISS?: UpstreamRatePair;
}

interface UpstreamEffectiveRates {
  fatorR?: boolean;
  impedimentoSublimite?: boolean;
  anexoI?: UpstreamRatePair;
  anexoII?: UpstreamRatePair;
  anexoIII?: UpstreamAnnexRates;
  anexoIV?: UpstreamAnnexRates;
  anexoV?: UpstreamAnnexRates;
}

interface UpstreamNfseOperation {
  data: string;
  tpDoc: string;
  CRT?: string;
  opSimpNac?: string;
  regApIBSCBSSN?: string;
  regApTribSN?: string;
  tpEnteGov?: string;
  aliquotasEfetivas?: UpstreamEffectiveRates;
  itens: UpstreamNfseItem[];
}

interface UpstreamTaxes {
  vRBSNitem: string;
  tpRBSN: number;
  tpRBSNDescricao: string;
  vBC?: string;
  pIBSSN?: string;
  vIBSSN?: string;
  vIBSPendSusp?: string;
  pCBSSN?: string;
  vCBSSN?: string;
  vCBSPendSusp?: string;
  IS?: { valor: string };
  totalItem?: string;
}

interface UpstreamError {
  code: string;
  pointer: string;
}

interface UpstreamObject {
  nObj: number;
  estadoItem: string;
  motivoEstado?: { codigo: string };
  tribCalc?: UpstreamTaxes;
  erros?: UpstreamError[];
}

interface UpstreamTotals {
  vRBSNtot: string;
  vBC?: string;
  vIBSSNtot?: string;
  vIBSSNtotPendSusp?: string;
  vCBSSNtot?: string;
  vCBSSNtotPendSusp?: string;
  totalIs?: string;
  totalTributos?: string;
}

interface SimplesFixtureResponse {
  status: number;
  body: {
    objetos?: UpstreamObject[];
    total?: UpstreamTotals | null;
    errors?: UpstreamError[];
  };
}

interface ComparableViolation {
  ruleCode: string;
  field: string;
}

// The figures upstream publishes, without the calculation steps the port records.
type PublishedSimplesTax = Omit<SimplesTax, "calculationSteps">;

type ComparableCalculatedItem = Omit<SimplesCalculatedItem, "cbs" | "ibs"> & {
  cbs: PublishedSimplesTax;
  ibs: PublishedSimplesTax | null;
};

// A calculated tax's last step against the amount it published (due plus pending).
interface StepEnding {
  stepResult: string;
  amount: string;
}

type ComparableItem =
  | ComparableCalculatedItem
  | Exclude<SimplesItemResult, { status: "rejected" | "calculated" }>
  | { itemNumber: number; status: "rejected"; violations: ComparableViolation[] };

const MONEY_FORMAT = { minPlaces: 2, maxPlaces: 2 };
const ZERO_MONEY = "0.00";

const REASON_BY_UPSTREAM: Record<string, NotCalculatedReason> = {
  CATIVSN_AUSENTE: "activityMissing",
  CATIVSN_DESCONHECIDO: "activityUnknown",
  CATIVSN_INADMISSIVEL_NO_DOCUMENTO: "activityNotAllowed",
  REGIME_SOMENTE_RECEITA: "revenueOnlyRegime",
};

const FIELD_BY_UPSTREAM_FIELD: Record<string, string> = {
  ncm: "ncmCode",
  nbs: "nbsCode",
  baseCalculo: "baseAmount",
  valorImpostoSeletivo: "selectiveTaxAmount",
  cClassTrib: "cClassTrib",
  cAtivSN: "activityCode",
  pCBSSN: "cbsSimplesRate",
  pIBSSN: "ibsSimplesRate",
  data: "taxEventDate",
  tpDoc: "documentType",
  CRT: "crt",
  tpRegimeIBSCBS: "ibsCbsRegime",
  tpEnteGov: "governmentEntity",
  tribISSQN: "issTaxation",
  tpRetISSQN: "issWithholding",
  tpBM: "municipalBenefit",
  itens: "items",
  opSimpNac: "simplesOption",
  regApIBSCBSSN: "ibsCbsAssessmentRegime",
  regApTribSN: "simplesTaxesAssessmentRegime",
};

const LINE_FIELD_BY_UPSTREAM_FIELD: Record<string, string> = {
  aliquotasEfetivas: "effectiveRates",
  fatorR: "isFatorRAtLeast28",
  anexoI: "annexI",
  anexoII: "annexII",
  anexoIII: "annexIII",
  anexoIV: "annexIV",
  anexoV: "annexV",
  semRedistribuicaoISS: "withoutIssRedistribution",
  pCBSSN: "cbsSimplesRate",
  pIBSSN: "ibsSimplesRate",
};

const ITEM_POINTER = /^#\/itens\/(\d+)(?:\/(\w+))?$/;
const OPERATION_POINTER = /^#\/(\w+)$/;
const LINE_POINTER = /^#\/(aliquotasEfetivas(?:\/\w+)*)$/;

function toSimplesOperation(upstream: UpstreamSimplesOperation) {
  const optionalNumber = (value: string | undefined) =>
    value === undefined ? undefined : Number(value);
  const operation: SimplesOperation = {
    taxEventDate: upstream.data,
    documentType: Number(upstream.tpDoc),
    crt: Number(upstream.CRT),
    ibsCbsRegime: optionalNumber(upstream.tpRegimeIBSCBS),
    governmentEntity: optionalNumber(upstream.tpEnteGov),
    items: upstream.itens.map((upstreamItem) => ({
      itemNumber: upstreamItem.numero,
      activityCode: upstreamItem.cAtivSN,
      cClassTrib: upstreamItem.cClassTrib,
      ncmCode: upstreamItem.ncm,
      nbsCode: upstreamItem.nbs,
      baseAmount: upstreamItem.baseCalculo,
      selectiveTaxAmount: upstreamItem.valorImpostoSeletivo,
      cbsSimplesRate: upstreamItem.pCBSSN,
      ibsSimplesRate: upstreamItem.pIBSSN,
    })),
  };
  return operation;
}

function toNfseSimplesOperation(upstream: UpstreamNfseOperation) {
  const optionalNumber = (value: string | undefined) =>
    value === undefined ? undefined : Number(value);
  const operation: NfseSimplesOperation & { crt?: number } = {
    taxEventDate: upstream.data,
    documentType: Number(upstream.tpDoc),
    crt: optionalNumber(upstream.CRT),
    simplesOption: Number(upstream.opSimpNac),
    ibsCbsAssessmentRegime: optionalNumber(upstream.regApIBSCBSSN),
    simplesTaxesAssessmentRegime: optionalNumber(upstream.regApTribSN),
    governmentEntity: optionalNumber(upstream.tpEnteGov),
    effectiveRates: upstream.aliquotasEfetivas && toEffectiveRates(upstream.aliquotasEfetivas),
    items: upstream.itens.map((upstreamItem) => {
      const nfseItem: SimplesOperationItem = {
        itemNumber: upstreamItem.numero,
        activityCode: upstreamItem.cAtivSN,
        cClassTrib: upstreamItem.cClassTrib,
        ncmCode: upstreamItem.ncm,
        nbsCode: upstreamItem.nbs,
        baseAmount: upstreamItem.baseCalculo,
        selectiveTaxAmount: upstreamItem.valorImpostoSeletivo,
        issTaxation: optionalNumber(upstreamItem.tribISSQN),
        issWithholding: optionalNumber(upstreamItem.tpRetISSQN),
        municipalBenefit: optionalNumber(upstreamItem.tpBM),
      };
      return nfseItem;
    }),
  };
  return operation;
}

function toEffectiveRates(upstream: UpstreamEffectiveRates) {
  const toPair = (pair: UpstreamRatePair | undefined): SimplesRatePair | undefined =>
    pair && { cbsSimplesRate: pair.pCBSSN, ibsSimplesRate: pair.pIBSSN };
  const toAnnex = (annex: UpstreamAnnexRates | undefined): SimplesAnnexRates | undefined =>
    annex && { ...toPair(annex), withoutIssRedistribution: toPair(annex.semRedistribuicaoISS) };
  const effectiveRates: SimplesEffectiveRates = {
    isFatorRAtLeast28: upstream.fatorR,
    isSublimitExceeded: upstream.impedimentoSublimite,
    annexI: toPair(upstream.anexoI),
    annexII: toPair(upstream.anexoII),
    annexIII: toAnnex(upstream.anexoIII),
    annexIV: toAnnex(upstream.anexoIV),
    annexV: toAnnex(upstream.anexoV),
  };
  return effectiveRates;
}

function toExpectedItems(response: SimplesFixtureResponse) {
  const expectedItems = (response.body.objetos ?? []).map(toExpectedItem);
  return expectedItems;
}

function toExpectedItem(object: UpstreamObject): ComparableItem {
  const { nObj: itemNumber, estadoItem, tribCalc } = object;

  switch (estadoItem) {
    case "CALCULADO": {
      const calculated = toCalculatedItem(itemNumber, requireTaxes(object));
      return calculated;
    }
    case "NAO_CALCULADO": {
      const notCalculated: ComparableItem = {
        itemNumber,
        status: "notCalculated",
        reason: toReason(object.motivoEstado?.codigo),
        grossRevenue: tribCalc?.vRBSNitem ?? "",
        revenueType: { code: tribCalc?.tpRBSN ?? -1, description: tribCalc?.tpRBSNDescricao ?? "" },
      };
      return notCalculated;
    }
    case "INCONSISTENCIA_ENTRADA": {
      const rejected: ComparableItem = {
        itemNumber,
        status: "rejected",
        violations: (object.erros ?? []).map(toComparableViolation),
      };
      return rejected;
    }
    case "NAO_IMPLEMENTADO": {
      const notImplemented: ComparableItem = {
        itemNumber,
        status: "notImplemented",
        reason: "adjustment",
      };
      return notImplemented;
    }
    default:
      throw new Error(`Unexpected upstream state ${estadoItem}`);
  }
}

function toReason(upstreamReason: string | undefined) {
  const reason = REASON_BY_UPSTREAM[upstreamReason ?? ""];

  if (!reason) {
    throw new Error(`Unexpected upstream reason ${upstreamReason}`);
  }

  return reason;
}

function requireTaxes(object: UpstreamObject) {
  if (!object.tribCalc) {
    throw new Error(`Item ${object.nObj} is CALCULADO without tribCalc`);
  }

  return object.tribCalc;
}

// why: with CRT 2 upstream leaves every IBS field out of tribCalc.
function toCalculatedItem(itemNumber: number, taxes: UpstreamTaxes) {
  const ibs: PublishedSimplesTax | null =
    taxes.vIBSSN === undefined
      ? null
      : {
          rate: taxes.pIBSSN ?? null,
          dueAmount: taxes.vIBSSN,
          pendingAmount: taxes.vIBSPendSusp ?? "",
        };
  const calculated: ComparableItem = {
    itemNumber,
    status: "calculated",
    grossRevenue: taxes.vRBSNitem,
    revenueType: { code: taxes.tpRBSN, description: taxes.tpRBSNDescricao },
    baseAmount: taxes.vBC ?? "",
    cbs: {
      rate: taxes.pCBSSN ?? null,
      dueAmount: taxes.vCBSSN ?? "",
      pendingAmount: taxes.vCBSPendSusp ?? "",
    },
    ibs,
    selectiveTaxAmount: taxes.IS?.valor ?? null,
    itemTotal: taxes.totalItem ?? "",
  };
  return calculated;
}

// An engine result in the shape the fixtures pin: published figures, violations without messages.
function toComparableItem(result: SimplesItemResult) {
  if (result.status === "rejected") {
    const rejected: ComparableItem = {
      itemNumber: result.itemNumber,
      status: "rejected",
      violations: result.violations.map(({ ruleCode, field }) => ({ ruleCode, field })),
    };
    return rejected;
  }

  if (result.status !== "calculated") {
    return result;
  }

  const calculated: ComparableItem = {
    ...result,
    cbs: toPublishedSimplesTax(result.cbs),
    ibs: result.ibs ? toPublishedSimplesTax(result.ibs) : null,
  };
  return calculated;
}

function toPublishedSimplesTax(tax: SimplesTax) {
  const published: PublishedSimplesTax = {
    rate: tax.rate,
    dueAmount: tax.dueAmount,
    pendingAmount: tax.pendingAmount,
  };
  return published;
}

// why: a regime whose destination is ZERO publishes zero whatever the steps computed, so a tax
// with nothing due and nothing pending has no ending to compare.
function toStepEndings(result: SimplesItemResult) {
  if (result.status !== "calculated") {
    const none: StepEnding[] = [];
    return none;
  }

  const endings = [result.cbs, result.ibs]
    .filter((tax): tax is SimplesTax => tax !== null && tax.rate !== null)
    .map(toStepEnding)
    .filter((ending) => ending.amount !== ZERO_MONEY);
  return endings;
}

function toStepEnding(tax: SimplesTax) {
  const lastResult = tax.calculationSteps.at(-1)?.result ?? "missing";
  const amount = addDecimals(parseDecimal(tax.dueAmount), parseDecimal(tax.pendingAmount));
  const ending: StepEnding = {
    stepResult: formatDecimal(parseDecimal(lastResult), MONEY_FORMAT),
    amount: formatDecimal(amount, MONEY_FORMAT),
  };
  return ending;
}

function toComparableViolation(error: UpstreamError) {
  const violation: ComparableViolation = { ruleCode: error.code, field: toField(error.pointer) };
  return violation;
}

function toExpectedTotals(response: SimplesFixtureResponse) {
  const total = response.body.total;

  if (!total) {
    return null;
  }

  const totals: SimplesTotals = {
    grossRevenue: total.vRBSNtot,
    baseAmount: total.vBC ?? null,
    ibsDueAmount: total.vIBSSNtot ?? null,
    ibsPendingAmount: total.vIBSSNtotPendSusp ?? null,
    cbsDueAmount: total.vCBSSNtot ?? null,
    cbsPendingAmount: total.vCBSSNtotPendSusp ?? null,
    selectiveTaxAmount: total.totalIs ?? null,
    taxTotal: total.totalTributos ?? null,
  };
  return totals;
}

function toExpectedIssues(response: SimplesFixtureResponse) {
  const issues = (response.body.errors ?? []).map(toComparableViolation);
  return issues;
}

function toField(pointer: string) {
  const lineMatch = LINE_POINTER.exec(pointer);

  if (lineMatch) {
    const lineField = (lineMatch[1] ?? "")
      .split("/")
      .map((segment) => LINE_FIELD_BY_UPSTREAM_FIELD[segment] ?? segment)
      .join(".");
    return lineField;
  }

  const itemMatch = ITEM_POINTER.exec(pointer);

  if (itemMatch) {
    const [, position, upstreamField] = itemMatch;
    const itemPath = `items[${position}]`;
    const itemField = upstreamField
      ? `${itemPath}.${FIELD_BY_UPSTREAM_FIELD[upstreamField] ?? upstreamField}`
      : itemPath;
    return itemField;
  }

  const operationMatch = OPERATION_POINTER.exec(pointer);

  if (!operationMatch) {
    throw new Error(`Unexpected upstream pointer "${pointer}"`);
  }

  const upstreamField = operationMatch[1] ?? "";
  const operationField = FIELD_BY_UPSTREAM_FIELD[upstreamField] ?? upstreamField;
  return operationField;
}

export type {
  ComparableItem,
  ComparableViolation,
  SimplesFixtureResponse,
  UpstreamNfseOperation,
  UpstreamSimplesOperation,
};
export {
  toComparableItem,
  toExpectedIssues,
  toExpectedItems,
  toExpectedTotals,
  toNfseSimplesOperation,
  toSimplesOperation,
  toStepEndings,
};
