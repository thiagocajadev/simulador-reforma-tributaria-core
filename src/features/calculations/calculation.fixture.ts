// Reads the Epic 0 golden fixtures (fixtures/regime-regular) into this project's contract: the
// upstream operation becomes an Operation, and the upstream responses become the ItemResult
// fields and totals the engine must reproduce. Test-only; see fixtures/regime-regular/README.md.

import type {
  CalculationTotals,
  ItemTaxes,
  Operation,
  OperationItem,
  PublishedSelectiveTax,
  PublishedTax,
  TaxResult,
} from "./calculation.dto.ts";

// The item taxes as the fixtures pin them: the published figures, without the calculation steps.
type PublishedItemTaxes = Omit<ItemTaxes, "cbs" | "ibsUf" | "ibsMun"> & {
  cbs: PublishedTax;
  ibsUf: PublishedTax;
  ibsMun: PublishedTax;
};

// For tests that build a TaxResult by hand and do not look at its steps.
const UNRECORDED_STEPS: Pick<TaxResult, "rateSource" | "calculationSteps"> = {
  rateSource: "reference",
  calculationSteps: [],
};

interface UpstreamItem {
  numero: number;
  ncm?: string;
  nbs?: string;
  cst: string;
  cClassTrib: string;
  baseCalculo: number;
  impostoSeletivo?: {
    cst: string;
    cClassTrib: string;
    quantidade?: number;
    unidade?: string;
  };
  aliquotasNominais?: {
    cbs: number;
    ibsEstadual: number;
    ibsMunicipal: number;
    impostoSeletivo?: { adValorem?: number; adRem?: number };
  };
}

interface UpstreamOperation {
  dhFatoGerador: string;
  municipio: number;
  uf: string;
  tpDoc?: number;
  itens: UpstreamItem[];
}

interface UpstreamReduction {
  pRedAliq: string;
  pAliqEfet: string;
}

interface UpstreamGroup {
  vBC: string;
  gIBSUF: { pIBSUF: string; gRed?: UpstreamReduction; vIBSUF: string };
  gIBSMun: { pIBSMun: string; gRed?: UpstreamReduction; vIBSMun: string };
  vIBS: string;
  gCBS: { pCBS: string; gRed?: UpstreamReduction; vCBS: string };
}

interface UpstreamSelectiveTax {
  CSTIS: string;
  cClassTribIS: string;
  vBCIS: string;
  pIS?: string;
  adRemIS?: string;
  uTrib?: string;
  qTrib?: string;
  vIS: string;
}

interface UpstreamObject {
  nObj: number;
  tribCalc: {
    IS?: UpstreamSelectiveTax;
    IBSCBS: { CST: string; cClassTrib: string; gIBSCBS?: UpstreamGroup };
  };
}

interface UpstreamTotals {
  tribCalc: {
    ISTot?: { vIS: string };
    IBSCBSTot: {
      vBCIBSCBS: string;
      gIBS: { gIBSUF: { vIBSUF: string }; gIBSMun: { vIBSMun: string }; vIBS: string };
      gCBS: { vCBS: string };
    };
  };
}

interface UpstreamError {
  code: string;
  pointer: string;
}

interface ObservedObject {
  nObj: number;
  estadoItem: string;
  erros?: UpstreamError[];
}

interface CalculatedResponse {
  status: number;
  body: { objetos: UpstreamObject[]; total: UpstreamTotals };
}

interface ObservedResponse {
  status: number;
  body: { objetos: ObservedObject[] };
}

interface ExpectedItem {
  itemNumber: number;
  status: string;
  taxes?: PublishedItemTaxes | null;
  selectiveTax?: PublishedSelectiveTax | null;
  violation?: { ruleCode: string; field: string };
}

const STATUS_BY_STATE: Record<string, string> = {
  CALCULADO: "calculated",
  CALCULO_SIMULADO: "simulated",
  INCONSISTENCIA_ENTRADA: "rejected",
  NAO_IMPLEMENTADO: "notImplemented",
};

const FIELD_BY_UPSTREAM_FIELD: Record<string, string> = {
  ncm: "ncmCode",
  nbs: "nbsCode",
  cst: "cstCode",
  cClassTrib: "cClassTrib",
  baseCalculo: "baseAmount",
  aliquotasNominais: "nominalRates",
  impostoSeletivo: "selectiveTax",
  "aliquotasNominais/impostoSeletivo": "selectiveTax",
};

const ITEM_POINTER = /^#\/itens\/(\d+)(?:\/([\w/]+))?$/;

function toOperation(upstream: UpstreamOperation) {
  const operation: Operation = {
    taxEventDate: upstream.dhFatoGerador,
    uf: upstream.uf,
    municipalityCode: upstream.municipio,
    documentType: upstream.tpDoc,
    items: upstream.itens.map(toOperationItem),
  };
  return operation;
}

function toOperationItem(upstream: UpstreamItem) {
  const rates = upstream.aliquotasNominais;
  const group = upstream.impostoSeletivo;
  const selectiveRates = rates?.impostoSeletivo;
  const operationItem: OperationItem = {
    itemNumber: upstream.numero,
    ncmCode: upstream.ncm,
    nbsCode: upstream.nbs,
    cstCode: upstream.cst,
    cClassTrib: upstream.cClassTrib,
    baseAmount: String(upstream.baseCalculo),
    nominalRates: rates
      ? {
          cbsRate: String(rates.cbs),
          ibsUfRate: String(rates.ibsEstadual),
          ibsMunRate: String(rates.ibsMunicipal),
        }
      : undefined,
    selectiveTax: group
      ? {
          cstCode: group.cst,
          cClassTrib: group.cClassTrib,
          adValoremRate: toOptionalText(selectiveRates?.adValorem),
          adRemRate: toOptionalText(selectiveRates?.adRem),
          quantity: toOptionalText(group.quantidade),
          unit: group.unidade,
        }
      : undefined,
  };
  return operationItem;
}

function toOptionalText(value: number | undefined) {
  const text = value === undefined ? undefined : String(value);
  return text;
}

function toExpectedItems(input: { calculated: CalculatedResponse; observed: ObservedResponse }) {
  const { calculated, observed } = input;
  const groups = new Map(calculated.body.objetos?.map((object) => [object.nObj, object]) ?? []);
  const expectedItems = observed.body.objetos.map((object) => {
    const status = STATUS_BY_STATE[object.estadoItem] ?? object.estadoItem;
    const error = object.erros?.at(0);
    const tribCalc = groups.get(object.nObj)?.tribCalc;
    const group = tribCalc?.IBSCBS.gIBSCBS;
    const expected: ExpectedItem = error
      ? {
          itemNumber: object.nObj,
          status,
          violation: { ruleCode: error.code, field: toField(error.pointer) },
        }
      : {
          itemNumber: object.nObj,
          status,
          taxes: group ? toItemTaxes(group) : null,
          selectiveTax: tribCalc?.IS ? toSelectiveTax(tribCalc.IS) : null,
        };
    return expected;
  });
  return expectedItems;
}

function toItemTaxes(group: UpstreamGroup) {
  const taxes: PublishedItemTaxes = {
    baseAmount: group.vBC,
    cbs: toTaxResult(group.gCBS.pCBS, group.gCBS.gRed, group.gCBS.vCBS),
    ibsUf: toTaxResult(group.gIBSUF.pIBSUF, group.gIBSUF.gRed, group.gIBSUF.vIBSUF),
    ibsMun: toTaxResult(group.gIBSMun.pIBSMun, group.gIBSMun.gRed, group.gIBSMun.vIBSMun),
    ibsAmount: group.vIBS,
  };
  return taxes;
}

function toSelectiveTax(upstream: UpstreamSelectiveTax) {
  const selectiveTax: PublishedSelectiveTax = {
    cstCode: upstream.CSTIS,
    cClassTrib: upstream.cClassTribIS,
    baseAmount: upstream.vBCIS,
    adValoremRate: upstream.pIS ?? null,
    adRemRate: upstream.adRemIS ?? null,
    unit: upstream.uTrib ?? null,
    quantity: upstream.qTrib ?? null,
    amount: upstream.vIS,
  };
  return selectiveTax;
}

function toTaxResult(rate: string, reduction: UpstreamReduction | undefined, amount: string) {
  const result: PublishedTax = {
    rate,
    reductionPercent: reduction?.pRedAliq ?? null,
    effectiveRate: reduction?.pAliqEfet ?? null,
    amount,
  };
  return result;
}

function toExpectedTotals(calculated: CalculatedResponse) {
  const totals = calculated.body.total.tribCalc.IBSCBSTot;
  const selectiveTaxTotal = calculated.body.total.tribCalc.ISTot;
  const expected: CalculationTotals = {
    baseAmount: totals.vBCIBSCBS,
    cbsAmount: totals.gCBS.vCBS,
    ibsUfAmount: totals.gIBS.gIBSUF.vIBSUF,
    ibsMunAmount: totals.gIBS.gIBSMun.vIBSMun,
    ibsAmount: totals.gIBS.vIBS,
    selectiveTaxAmount: selectiveTaxTotal?.vIS ?? "0.00",
  };
  return expected;
}

function toField(pointer: string) {
  const match = ITEM_POINTER.exec(pointer);

  if (!match) {
    throw new Error(`Unexpected upstream pointer "${pointer}"`);
  }

  const [, position, upstreamField] = match;
  const itemPath = `items[${position}]`;
  const field = upstreamField
    ? `${itemPath}.${FIELD_BY_UPSTREAM_FIELD[upstreamField] ?? upstreamField}`
    : itemPath;
  return field;
}

export type {
  CalculatedResponse,
  ExpectedItem,
  ObservedResponse,
  PublishedItemTaxes,
  UpstreamOperation,
};
export { toExpectedItems, toExpectedTotals, toOperation, UNRECORDED_STEPS };
