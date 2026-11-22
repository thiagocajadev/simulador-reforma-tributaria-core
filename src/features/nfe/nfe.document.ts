// A fictitious NF-e (model 55) for one calculated sale of goods: every item with its IBS/CBS group,
// the IBS/CBS totals and the total with the new taxes, after NT 2025.002 v1.53. Parties, numbers
// and the access key are fixed placeholders and the environment is always homologation (2), so the
// note can never pass for a real one. ICMS, IPI, PIS and COFINS are not calculated. See docs/nfe.md.

import type {
  CalculatedItem,
  Operation,
  OperationItem,
  TaxResult,
} from "@/features/calculations/calculation.dto.ts";
import {
  formatDocumentMoney,
  formatDocumentRate,
  sumDocumentMoney,
} from "@/shared/format/document.values.ts";

interface NfeInput {
  operation: Operation;
  calculatedItems: CalculatedItem[];
  municipalityName: string;
  itemDescriptions: string[];
}

interface NfeAddress {
  street: string;
  number: string;
  district: string;
  municipalityCode: number;
  municipalityName: string;
  uf: string;
  zipCode: string;
  phone: string;
}

interface NfeParty {
  taxId: string;
  stateRegistration: string | null;
  name: string;
  address: NfeAddress;
}

interface NfeRateReduction {
  percent: string;
  effectiveRate: string;
}

interface NfeTaxShare {
  rate: string;
  reduction: NfeRateReduction | null;
  amount: string;
}

interface NfeItemTaxGroup {
  baseAmount: string;
  ibsUf: NfeTaxShare;
  ibsMun: NfeTaxShare;
  ibsAmount: string;
  cbs: NfeTaxShare;
}

// The IS group of an item (UB01), as the calculator published it: a rate the item lacks is
// null, and unit and quantity come only with the specific (ad rem) rate.
interface NfeItemSelectiveTax {
  cstCode: string;
  cClassTrib: string;
  baseAmount: string;
  rate: string;
  specificRate: string | null;
  unit: string | null;
  quantity: string | null;
  amount: string;
}

interface NfeItem {
  itemNumber: number;
  productCode: string;
  description: string;
  ncmCode: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  productAmount: string;
  cstCode: string;
  cClassTrib: string;
  taxGroup: NfeItemTaxGroup | null;
  selectiveTax: NfeItemSelectiveTax | null;
  itemTotal: string;
}

interface NfeTotals {
  productAmount: string;
  noteAmount: string;
  ibsCbsBase: string;
  ibsUfAmount: string;
  ibsMunAmount: string;
  ibsAmount: string;
  cbsAmount: string;
  selectiveTaxAmount: string | null;
  totalWithTaxes: string;
}

interface NfeDocument {
  accessKey: string;
  ufCode: string;
  numericCode: string;
  checkDigit: string;
  series: string;
  noteNumber: string;
  operationNature: string;
  issuedAt: string;
  environment: string;
  applicationVersion: string;
  taxRegimeCode: string;
  municipality: { code: number; name: string; uf: string };
  issuer: NfeParty;
  recipient: NfeParty;
  items: NfeItem[];
  totals: NfeTotals;
  additionalInformation: string;
}

const NFE_MODEL = "55";
const HOMOLOGATION_ENVIRONMENT = "2";
const NORMAL_EMISSION = "1";
const NOTE_SERIES = "1";
const NOTE_NUMBER = "1";
const APPLICATION_VERSION = "simulador-1.0";
const REGULAR_REGIME = "3";
const SALE_NATURE = "Venda de mercadoria";
// why: a sale of goods bought from third parties, inside the issuer's state (every party is there).
const IN_STATE_RESALE_CFOP = "5102";
const PRODUCT_UNIT = "UN";
const PRODUCT_QUANTITY = "1.0000";
const PRODUCT_DESCRIPTION_MAX = 120;
const ZERO_RATE = "0";
// why: NT 2025.002 VB01-10, exception 1: in 2025 and 2026 the item total leaves IBS and CBS out.
const LAST_YEAR_WITHOUT_TAXES_IN_TOTAL = "2026";

// why: placeholders, so a fictitious key never looks computed nor matches a real note.
const ACCESS_KEY_NUMERIC_CODE = "12345678";
const ACCESS_KEY_CHECK_DIGIT = "0";

const ADDITIONAL_INFORMATION =
  "Simulação da Reforma Tributária do Consumo (LC 214/2025). Documento fictício, SEM VALOR FISCAL. ICMS, IPI, PIS e COFINS não foram calculados pelo simulador.";

// why: upstream's test CNPJ, and a CPF with wrong check digits, so neither can belong to anyone. In
// homologation the recipient's name must be this sentence, as the national rules require.
const ISSUER_TEMPLATE = {
  taxId: "12345678000195",
  stateRegistration: "000000000",
  name: "Emitente Exemplo de Simulação Ltda",
  street: "Rua Fictícia",
  number: "100",
  district: "Centro",
};

const RECIPIENT_TEMPLATE = {
  taxId: "12345678900",
  stateRegistration: null,
  name: "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
  street: "Avenida Imaginária",
  number: "200",
  district: "Centro",
};

const PLACEHOLDER_ZIP_CODE = "00000000";
const PLACEHOLDER_PHONE = "0000000000";

function buildNfeDocument(input: NfeInput) {
  const { operation, municipalityName } = input;
  const municipality = {
    code: operation.municipalityCode,
    name: municipalityName,
    uf: operation.uf,
  };
  const nfeItems = buildItems(input);
  const ufCode = String(municipality.code).slice(0, 2);
  const nfeDocument: NfeDocument = {
    accessKey: buildAccessKey({ ufCode, issuedAt: operation.taxEventDate }),
    ufCode,
    numericCode: ACCESS_KEY_NUMERIC_CODE,
    checkDigit: ACCESS_KEY_CHECK_DIGIT,
    series: NOTE_SERIES,
    noteNumber: NOTE_NUMBER,
    operationNature: SALE_NATURE,
    issuedAt: operation.taxEventDate,
    environment: HOMOLOGATION_ENVIRONMENT,
    applicationVersion: APPLICATION_VERSION,
    taxRegimeCode: REGULAR_REGIME,
    municipality,
    issuer: toParty(ISSUER_TEMPLATE, municipality),
    recipient: toParty(RECIPIENT_TEMPLATE, municipality),
    items: nfeItems,
    totals: sumTotals(nfeItems),
    additionalInformation: ADDITIONAL_INFORMATION,
  };
  return nfeDocument;
}

function buildItems(input: NfeInput) {
  const { operation, calculatedItems, itemDescriptions } = input;
  const includesTaxesInTotal =
    operation.taxEventDate.slice(0, 4) > LAST_YEAR_WITHOUT_TAXES_IN_TOTAL;

  if (operation.items.length === 0 || calculatedItems.length !== operation.items.length) {
    throw new Error(
      `An NF-e needs every item calculated: ${calculatedItems.length} of ${operation.items.length}.`,
    );
  }

  const nfeItems = operation.items.map((operationItem, position) =>
    toNfeItem({
      operationItem,
      calculatedItem: requireCalculatedItem(calculatedItems, operationItem.itemNumber),
      description: itemDescriptions[position] ?? `Item ${operationItem.itemNumber}`,
      includesTaxesInTotal,
    }),
  );
  return nfeItems;
}

function requireCalculatedItem(calculatedItems: CalculatedItem[], itemNumber: number) {
  const calculatedItem = calculatedItems.find((candidate) => candidate.itemNumber === itemNumber);

  if (!calculatedItem) {
    throw new Error(`Item ${itemNumber} has no calculation; an NF-e needs every item calculated.`);
  }

  return calculatedItem;
}

function toNfeItem(input: {
  operationItem: OperationItem;
  calculatedItem: CalculatedItem;
  description: string;
  includesTaxesInTotal: boolean;
}) {
  const { operationItem, calculatedItem, description, includesTaxesInTotal } = input;
  const productAmount = formatDocumentMoney(operationItem.baseAmount);
  const taxGroup = toTaxGroup(calculatedItem);
  const selectiveTax = toSelectiveTax(calculatedItem);
  const ibsCbsInTotal = taxGroup ? [taxGroup.ibsAmount, taxGroup.cbs.amount] : [];
  const selectiveTaxInTotal = selectiveTax ? [selectiveTax.amount] : [];
  const taxesInTotal = includesTaxesInTotal ? [...ibsCbsInTotal, ...selectiveTaxInTotal] : [];
  const nfeItem: NfeItem = {
    itemNumber: operationItem.itemNumber,
    productCode: String(operationItem.itemNumber),
    description: toProductDescription(description),
    ncmCode: operationItem.ncmCode ?? "",
    cfop: IN_STATE_RESALE_CFOP,
    unit: PRODUCT_UNIT,
    quantity: PRODUCT_QUANTITY,
    unitPrice: productAmount,
    productAmount,
    cstCode: calculatedItem.cstCode,
    cClassTrib: calculatedItem.cClassTrib,
    taxGroup,
    selectiveTax,
    itemTotal: sumDocumentMoney([productAmount, ...taxesInTotal]),
  };
  return nfeItem;
}

// why: xProd takes up to 120 characters and no leading, trailing or repeated spaces.
function toProductDescription(description: string) {
  const singleSpaced = description.replace(/\s+/g, " ").trim();
  const cut = [...singleSpaced].slice(0, PRODUCT_DESCRIPTION_MAX).join("").trimEnd();
  return cut;
}

// why: a CST without the IBS/CBS group (immunity, non-incidence) still sends CST and cClassTrib.
function toTaxGroup(calculatedItem: CalculatedItem) {
  const { taxes } = calculatedItem;

  if (!taxes) {
    return null;
  }

  const taxGroup: NfeItemTaxGroup = {
    baseAmount: formatDocumentMoney(taxes.baseAmount),
    ibsUf: toTaxShare(taxes.ibsUf),
    ibsMun: toTaxShare(taxes.ibsMun),
    ibsAmount: formatDocumentMoney(taxes.ibsAmount),
    cbs: toTaxShare(taxes.cbs),
  };
  return taxGroup;
}

// why: the layout requires pIS beside vBCIS, so an ad rem rate alone goes with a pIS of zero.
function toSelectiveTax(calculatedItem: CalculatedItem) {
  const { selectiveTax } = calculatedItem;

  if (!selectiveTax) {
    return null;
  }

  const { adRemRate, unit, quantity } = selectiveTax;
  const hasSpecificRate = adRemRate !== null && unit !== null && quantity !== null;
  const nfeSelectiveTax: NfeItemSelectiveTax = {
    cstCode: selectiveTax.cstCode,
    cClassTrib: selectiveTax.cClassTrib,
    baseAmount: formatDocumentMoney(selectiveTax.baseAmount),
    rate: formatDocumentRate(selectiveTax.adValoremRate ?? ZERO_RATE),
    specificRate: hasSpecificRate ? formatDocumentRate(adRemRate) : null,
    unit: hasSpecificRate ? unit : null,
    quantity: hasSpecificRate ? quantity : null,
    amount: formatDocumentMoney(selectiveTax.amount),
  };
  return nfeSelectiveTax;
}

// why: the reduction group (gRed) carries the effective rate; without a reduction there is none.
function toTaxShare(taxResult: TaxResult) {
  const reduction: NfeRateReduction | null = taxResult.reductionPercent
    ? {
        percent: formatDocumentRate(taxResult.reductionPercent),
        effectiveRate: formatDocumentRate(taxResult.effectiveRate ?? taxResult.rate),
      }
    : null;
  const share: NfeTaxShare = {
    rate: formatDocumentRate(taxResult.rate),
    reduction,
    amount: formatDocumentMoney(taxResult.amount),
  };
  return share;
}

function sumTotals(items: NfeItem[]) {
  const taxGroups = items.flatMap((nfeItem) => (nfeItem.taxGroup ? [nfeItem.taxGroup] : []));
  const selectiveTaxes = items.flatMap((nfeItem) =>
    nfeItem.selectiveTax ? [nfeItem.selectiveTax] : [],
  );
  const productAmount = sumDocumentMoney(items.map((nfeItem) => nfeItem.productAmount));
  const totals: NfeTotals = {
    productAmount,
    noteAmount: productAmount,
    ibsCbsBase: sumDocumentMoney(taxGroups.map((group) => group.baseAmount)),
    ibsUfAmount: sumDocumentMoney(taxGroups.map((group) => group.ibsUf.amount)),
    ibsMunAmount: sumDocumentMoney(taxGroups.map((group) => group.ibsMun.amount)),
    ibsAmount: sumDocumentMoney(taxGroups.map((group) => group.ibsAmount)),
    cbsAmount: sumDocumentMoney(taxGroups.map((group) => group.cbs.amount)),
    selectiveTaxAmount:
      selectiveTaxes.length > 0
        ? sumDocumentMoney(selectiveTaxes.map((selectiveTax) => selectiveTax.amount))
        : null,
    totalWithTaxes: sumDocumentMoney(items.map((nfeItem) => nfeItem.itemTotal)),
  };
  return totals;
}

// why: cUF (2) + AAMM (4) + CNPJ (14) + model (2) + series (3) + number (9) + emission type (1) +
// numeric code (8) + check digit (1), 44 digits; docs/nfe.md, Access key.
function buildAccessKey(input: { ufCode: string; issuedAt: string }) {
  const { ufCode, issuedAt } = input;
  const yearMonth = `${issuedAt.slice(2, 4)}${issuedAt.slice(5, 7)}`;
  const series = NOTE_SERIES.padStart(3, "0");
  const noteNumber = NOTE_NUMBER.padStart(9, "0");
  const accessKey = `${ufCode}${yearMonth}${ISSUER_TEMPLATE.taxId}${NFE_MODEL}${series}${noteNumber}${NORMAL_EMISSION}${ACCESS_KEY_NUMERIC_CODE}${ACCESS_KEY_CHECK_DIGIT}`;
  return accessKey;
}

function toParty(
  template: typeof ISSUER_TEMPLATE | typeof RECIPIENT_TEMPLATE,
  municipality: NfeDocument["municipality"],
) {
  const party: NfeParty = {
    taxId: template.taxId,
    stateRegistration: template.stateRegistration,
    name: template.name,
    address: {
      street: template.street,
      number: template.number,
      district: template.district,
      municipalityCode: municipality.code,
      municipalityName: municipality.name,
      uf: municipality.uf,
      zipCode: PLACEHOLDER_ZIP_CODE,
      phone: PLACEHOLDER_PHONE,
    },
  };
  return party;
}

export type {
  NfeDocument,
  NfeInput,
  NfeItem,
  NfeItemTaxGroup,
  NfeParty,
  NfeRateReduction,
  NfeTaxShare,
  NfeTotals,
};
export { buildNfeDocument };
