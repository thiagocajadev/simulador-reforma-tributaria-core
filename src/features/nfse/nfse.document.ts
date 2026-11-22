// A fictitious national NFS-e for one calculated service: the DPS as an issuer would declare it,
// and the IBS/CBS group the national environment would return, filled from our calculation.
// Parties, numbers and the access key are fixed placeholders, and the environment is always
// homologation (2), so the document can never pass for a real note. See docs/nfse.md.

import type {
  CalculatedItem,
  ItemTaxes,
  Operation,
  TaxResult,
} from "@/features/calculations/calculation.dto.ts";
import {
  formatDocumentMoney,
  formatDocumentRate,
  subtractDocumentMoney,
  sumDocumentMoney,
} from "@/shared/format/document.values.ts";

interface ServiceChoice {
  nationalTaxCode: string;
  nationalTaxDescription: string;
  indicatorCode: string;
  description: string;
}

interface NfseInput {
  operation: Operation;
  calculatedItem: CalculatedItem;
  municipalityName: string;
  service: ServiceChoice;
}

interface PartyAddress {
  street: string;
  number: string;
  district: string;
  zipCode: string;
  municipalityCode: number;
  municipalityName: string;
  uf: string;
}

interface Party {
  taxId: string;
  municipalRegistration: string | null;
  name: string;
  address: PartyAddress;
  email: string;
}

interface TaxRates {
  rate: string;
  reductionPercent: string | null;
  effectiveRate: string;
}

interface NfseIbsCbs {
  cstCode: string;
  cClassTrib: string;
  indicatorCode: string;
  baseAmount: string;
  ibsUf: TaxRates;
  ibsMun: TaxRates;
  cbs: TaxRates;
  ibsUfAmount: string;
  ibsMunAmount: string;
  ibsAmount: string;
  cbsAmount: string;
  ibsCbsAmount: string;
  totalWithTaxes: string;
}

interface NfseDocument {
  accessKey: string;
  dpsId: string;
  nfseNumber: string;
  dpsSeries: string;
  dpsNumber: string;
  environment: string;
  statusCode: string;
  issuedAt: string;
  processedAt: string;
  competenceDate: string;
  applicationVersion: string;
  municipality: { code: number; name: string; uf: string };
  provider: Party;
  taker: Party;
  service: ServiceChoice & { nbsCode: string; additionalInformation: string };
  serviceAmount: string;
  baseDeductions: string;
  netAmount: string;
  ibsCbs: NfseIbsCbs;
}

const HOMOLOGATION_ENVIRONMENT = "2";
const AUTHORIZED_STATUS = "100";
const CNPJ_INSCRIPTION = "2";
const APPLICATION_VERSION = "simulador-1.0";
const NFSE_NUMBER = "1";
const DPS_SERIES = "1";
const DPS_NUMBER = "1";
const ISO_DATE_LENGTH = 10;

// why: placeholders, so a fictitious key never looks computed nor matches a real note.
const ACCESS_KEY_NUMERIC_CODE = "123456789";
const ACCESS_KEY_CHECK_DIGIT = "0";

const ADDITIONAL_INFORMATION =
  "Simulação da Reforma Tributária do Consumo (LC 214/2025). Documento fictício, sem valor fiscal.";

// why: upstream's test CNPJ, and a CPF with wrong check digits, so neither can belong to anyone.
const PROVIDER_TEMPLATE = {
  taxId: "12345678000195",
  municipalRegistration: "12345",
  name: "Prestador Exemplo de Simulação Ltda",
  street: "Rua Fictícia",
  number: "100",
  district: "Centro",
  email: "contato@exemplo.invalid",
};

const TAKER_TEMPLATE = {
  taxId: "12345678900",
  municipalRegistration: null,
  name: "Tomador Exemplo da Silva",
  street: "Avenida Imaginária",
  number: "200",
  district: "Centro",
  email: "tomador@exemplo.invalid",
};

const PLACEHOLDER_ZIP_CODE = "00000000";

function buildNfseDocument(input: NfseInput) {
  const { operation, calculatedItem, municipalityName, service } = input;
  const taxes = requireTaxes(calculatedItem);
  const municipality = {
    code: operation.municipalityCode,
    name: municipalityName,
    uf: operation.uf,
  };
  const competenceDate = operation.taxEventDate.slice(0, ISO_DATE_LENGTH);
  const nbsItem = requireNbsItem(operation);
  const serviceAmount = formatDocumentMoney(nbsItem.baseAmount);
  const nfseDocument: NfseDocument = {
    accessKey: buildAccessKey(municipality.code, competenceDate),
    dpsId: buildDpsId(municipality.code),
    nfseNumber: NFSE_NUMBER,
    dpsSeries: DPS_SERIES,
    dpsNumber: DPS_NUMBER,
    environment: HOMOLOGATION_ENVIRONMENT,
    statusCode: AUTHORIZED_STATUS,
    issuedAt: operation.taxEventDate,
    processedAt: operation.taxEventDate,
    competenceDate,
    applicationVersion: APPLICATION_VERSION,
    municipality,
    provider: toParty(PROVIDER_TEMPLATE, municipality),
    taker: toParty(TAKER_TEMPLATE, municipality),
    service: {
      ...service,
      nbsCode: nbsItem.nbsCode ?? "",
      additionalInformation: ADDITIONAL_INFORMATION,
    },
    serviceAmount,
    baseDeductions: subtractDocumentMoney(serviceAmount, taxes.baseAmount),
    netAmount: serviceAmount,
    ibsCbs: toIbsCbs({ calculatedItem, taxes, service, serviceAmount }),
  };
  return nfseDocument;
}

function requireTaxes(calculatedItem: CalculatedItem) {
  if (!calculatedItem.taxes) {
    throw new Error(
      `Item ${calculatedItem.itemNumber} has no IBS/CBS values (CST ${calculatedItem.cstCode}); an NFS-e needs them.`,
    );
  }

  const taxes: ItemTaxes = calculatedItem.taxes;
  return taxes;
}

function requireNbsItem(operation: Operation) {
  const [operationItem] = operation.items;

  if (operation.items.length !== 1 || !operationItem?.nbsCode) {
    throw new Error(`An NFS-e takes exactly one item with an NBS, got ${operation.items.length}.`);
  }

  return operationItem;
}

// why: the national access key layout, field by field, is in docs/nfse.md, Access key.
function buildAccessKey(municipalityCode: number, competenceDate: string) {
  const yearMonth = `${competenceDate.slice(2, 4)}${competenceDate.slice(5, 7)}`;
  const noteNumber = NFSE_NUMBER.padStart(13, "0");
  const accessKey = `NFS${municipalityCode}${HOMOLOGATION_ENVIRONMENT}${CNPJ_INSCRIPTION}${PROVIDER_TEMPLATE.taxId}${noteNumber}${yearMonth}${ACCESS_KEY_NUMERIC_CODE}${ACCESS_KEY_CHECK_DIGIT}`;
  return accessKey;
}

// why: "DPS" + IBGE code (7) + inscription type (1) + CNPJ (14) + series (5) + DPS number (15).
function buildDpsId(municipalityCode: number) {
  const series = DPS_SERIES.padStart(5, "0");
  const dpsNumber = DPS_NUMBER.padStart(15, "0");
  const dpsId = `DPS${municipalityCode}${CNPJ_INSCRIPTION}${PROVIDER_TEMPLATE.taxId}${series}${dpsNumber}`;
  return dpsId;
}

function toParty(
  template: typeof PROVIDER_TEMPLATE | typeof TAKER_TEMPLATE,
  municipality: NfseDocument["municipality"],
) {
  const party: Party = {
    taxId: template.taxId,
    municipalRegistration: template.municipalRegistration,
    name: template.name,
    address: {
      street: template.street,
      number: template.number,
      district: template.district,
      zipCode: PLACEHOLDER_ZIP_CODE,
      municipalityCode: municipality.code,
      municipalityName: municipality.name,
      uf: municipality.uf,
    },
    email: template.email,
  };
  return party;
}

function toIbsCbs(input: {
  calculatedItem: CalculatedItem;
  taxes: ItemTaxes;
  service: ServiceChoice;
  serviceAmount: string;
}) {
  const { calculatedItem, taxes, service, serviceAmount } = input;
  const ibsCbsAmount = sumDocumentMoney([taxes.ibsAmount, taxes.cbs.amount]);
  const ibsCbs: NfseIbsCbs = {
    cstCode: calculatedItem.cstCode,
    cClassTrib: calculatedItem.cClassTrib,
    indicatorCode: service.indicatorCode,
    baseAmount: formatDocumentMoney(taxes.baseAmount),
    ibsUf: toTaxRates(taxes.ibsUf),
    ibsMun: toTaxRates(taxes.ibsMun),
    cbs: toTaxRates(taxes.cbs),
    ibsUfAmount: formatDocumentMoney(taxes.ibsUf.amount),
    ibsMunAmount: formatDocumentMoney(taxes.ibsMun.amount),
    ibsAmount: formatDocumentMoney(taxes.ibsAmount),
    cbsAmount: formatDocumentMoney(taxes.cbs.amount),
    ibsCbsAmount,
    totalWithTaxes: sumDocumentMoney([serviceAmount, ibsCbsAmount]),
  };
  return ibsCbs;
}

// why: without the reduction group the effective rate is the rate itself; the NFS-e still asks for it.
function toTaxRates(taxResult: TaxResult) {
  const rates: TaxRates = {
    rate: formatDocumentRate(taxResult.rate),
    reductionPercent: taxResult.reductionPercent
      ? formatDocumentRate(taxResult.reductionPercent)
      : null,
    effectiveRate: formatDocumentRate(taxResult.effectiveRate ?? taxResult.rate),
  };
  return rates;
}

export type { NfseDocument, NfseIbsCbs, NfseInput, Party, ServiceChoice, TaxRates };
export { buildNfseDocument };
