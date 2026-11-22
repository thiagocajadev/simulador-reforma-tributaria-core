// Turns an NfeDocument into the DANFE as printed text, after the portrait reference model of
// NT 2026.010 v1.00 and MOC 7.0 Anexo II (docs/nfe.md, DANFE). Only what the XML holds is printed:
// the ICMS fields the manual keeps stay blank, since the simulator calculates no ICMS. Pure;
// danfe.render.ts only lays out and draws what this returns.

import { formatBrazilianDecimal } from "@/shared/format/decimal.brazil.ts";
import { formatPrintedDate, formatTaxId, toPrintableLine } from "@/shared/pdf/pdf.text.ts";
import type { NfeDocument, NfeItem, NfeParty, NfeTaxShare } from "./nfe.document.ts";

interface DanfeField {
  label: string;
  value: string;
  span: number;
}

interface DanfeProductRow {
  description: string;
  codes: string;
  cstCfop: string[];
  quantityUnit: string[];
  unitPrice: string;
  totalPrice: string;
  bases: string[];
  rates: string[];
  amounts: string[];
}

interface DanfePresentation {
  receiptStatement: string;
  noteNumber: string;
  noteSeries: string;
  operationType: string;
  issuerName: string;
  issuerAddress: string[];
  accessKey: string;
  accessKeyText: string;
  lookupNote: string;
  operationRow: DanfeField[];
  issuerRow: DanfeField[];
  regimeRow: DanfeField[];
  recipientRows: DanfeField[][];
  productTotals: DanfeField[];
  icmsTotals: DanfeField[];
  reformTotals: DanfeField[];
  transport: DanfeField[];
  products: DanfeProductRow[];
  additionalInformation: string;
}

const BLANK = "";
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const QUANTITY = { minPlaces: 4, maxPlaces: 4 };
const RATE = { minPlaces: 2, maxPlaces: 4 };
const OUTGOING_OPERATION = "1";
const LOOKUP_NOTE =
  "Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora";
const PROTOCOL_NOTE = "SIMULAÇÃO · SEM AUTORIZAÇÃO DE USO";
const TAX_REGIME_NAMES: Record<string, string> = { "3": "3 - REGIME NORMAL" };
const WITHOUT_TRANSPORT = "9 - SEM OCORRÊNCIA DE TRANSPORTE";
const ISO_TIME = /T(\d{2}:\d{2}:\d{2})/;

function presentDanfe(nfeDocument: NfeDocument) {
  const { issuer, totals } = nfeDocument;
  const presentation: DanfePresentation = {
    receiptStatement: `RECEBEMOS DE ${issuer.name.toUpperCase()} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO`,
    noteNumber: formatNoteNumber(nfeDocument.noteNumber),
    noteSeries: nfeDocument.series.padStart(3, "0"),
    operationType: OUTGOING_OPERATION,
    issuerName: issuer.name,
    issuerAddress: presentAddress(issuer),
    accessKey: nfeDocument.accessKey,
    accessKeyText: nfeDocument.accessKey.replace(/(\d{4})(?=\d)/g, "$1 "),
    lookupNote: LOOKUP_NOTE,
    operationRow: [
      field("NATUREZA DA OPERAÇÃO", nfeDocument.operationNature, 2),
      field("PROTOCOLO DE AUTORIZAÇÃO DE USO", PROTOCOL_NOTE, 2),
    ],
    issuerRow: [
      field("INSCRIÇÃO ESTADUAL", issuer.stateRegistration ?? BLANK, 1),
      field("INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.", BLANK, 1),
      field("CNPJ", formatTaxId(issuer.taxId), 2),
    ],
    regimeRow: [
      field("CÓDIGO DO REGIME TRIBUTÁRIO", TAX_REGIME_NAMES[nfeDocument.taxRegimeCode] ?? BLANK, 2),
      field("TIPO DE REGIME DE APURAÇÃO DO IBS E DA CBS", BLANK, 2),
    ],
    recipientRows: presentRecipient(nfeDocument),
    productTotals: [
      field("VALOR TOTAL DOS PRODUTOS", formatAmount(totals.productAmount), 1),
      field("VALOR DO FRETE", formatAmount("0"), 1),
      field("VALOR DO SEGURO", formatAmount("0"), 1),
      field("DESCONTO", formatAmount("0"), 1),
      field("OUTRAS DESPESAS", formatAmount("0"), 1),
      field("VALOR TOTAL DA NOTA", formatAmount(totals.noteAmount), 1),
    ],
    icmsTotals: [
      field("BASE DE CÁLCULO DO ICMS", formatAmount("0"), 1),
      field("VALOR DO ICMS", formatAmount("0"), 1),
      field("BASE DE CÁLCULO DO ICMS ST", formatAmount("0"), 1),
      field("VALOR DO ICMS ST", formatAmount("0"), 1),
      field("VALOR DO IPI", formatAmount("0"), 1),
    ],
    reformTotals: [
      field("VALOR DA CBS", formatAmount(totals.cbsAmount), 1),
      field("VALOR DO IBS UF", formatAmount(totals.ibsUfAmount), 1),
      field("VALOR DO IBS MUNICÍPIO", formatAmount(totals.ibsMunAmount), 1),
      field(
        "VALOR DO IMPOSTO SELETIVO",
        totals.selectiveTaxAmount ? formatAmount(totals.selectiveTaxAmount) : BLANK,
        1,
      ),
    ],
    transport: [field("FRETE POR CONTA", WITHOUT_TRANSPORT, 4)],
    products: nfeDocument.items.map(presentProduct),
    additionalInformation: presentAdditionalInformation(nfeDocument),
  };
  return presentation;
}

function field(label: string, value: string, span: number) {
  const danfeField: DanfeField = { label, value: toPrintableLine(value), span };
  return danfeField;
}

function presentAddress(party: NfeParty) {
  const { address } = party;
  const lines = [
    `${address.street}, ${address.number} · ${address.district}`,
    `${address.municipalityName}/${address.uf} · CEP ${formatZipCode(address.zipCode)}`,
    `Fone: ${formatPhone(address.phone)}`,
  ].map(toPrintableLine);
  return lines;
}

function presentRecipient(nfeDocument: NfeDocument) {
  const { recipient, issuedAt } = nfeDocument;
  const { address } = recipient;
  const issueDate = formatPrintedDate(issuedAt);
  const rows = [
    [
      field("NOME / RAZÃO SOCIAL", recipient.name, 3),
      field("CNPJ / CPF", formatTaxId(recipient.taxId), 1),
      field("DATA DA EMISSÃO", issueDate, 1),
    ],
    [
      field("ENDEREÇO", `${address.street}, ${address.number}`, 2),
      field("BAIRRO / DISTRITO", address.district, 1),
      field("CEP", formatZipCode(address.zipCode), 1),
      field("DATA DA SAÍDA/ENTRADA", issueDate, 1),
    ],
    [
      field("MUNICÍPIO", address.municipalityName, 3),
      field("FONE / FAX", formatPhone(address.phone), 2),
      field("UF", address.uf, 1),
      field("INSCRIÇÃO ESTADUAL", recipient.stateRegistration ?? BLANK, 2),
      field("HORA DA SAÍDA/ENTRADA", ISO_TIME.exec(issuedAt)?.[1] ?? BLANK, 2),
    ],
  ];
  return rows;
}

// why: NT 2026.010 4.3 stacks the reform taxes under the ICMS fields the manual keeps; the ICMS
// lines stay blank because the XML has no ICMS group, and IPI and IS have no data to print.
function presentProduct(nfeItem: NfeItem) {
  const { taxGroup } = nfeItem;
  const row: DanfeProductRow = {
    description: toPrintableLine(`${nfeItem.productCode} - ${nfeItem.description}`),
    codes: `NCM ${nfeItem.ncmCode} · cClassTrib ${nfeItem.cClassTrib}`,
    cstCfop: ["CST", `CFOP ${nfeItem.cfop}`],
    quantityUnit: [formatBrazilianDecimal(nfeItem.quantity, QUANTITY), nfeItem.unit],
    unitPrice: formatAmount(nfeItem.unitPrice),
    totalPrice: formatAmount(nfeItem.productAmount),
    bases: ["ICMS", labelValue("IBS/CBS", taxGroup && formatAmount(taxGroup.baseAmount))],
    rates: [
      "ICMS",
      labelValue("CBS", taxGroup && formatRate(taxGroup.cbs)),
      labelValue("IBS UF", taxGroup && formatRate(taxGroup.ibsUf)),
      labelValue("IBS MUN", taxGroup && formatRate(taxGroup.ibsMun)),
    ],
    amounts: [
      "ICMS",
      labelValue("CBS", taxGroup && formatAmount(taxGroup.cbs.amount)),
      labelValue("IBS UF", taxGroup && formatAmount(taxGroup.ibsUf.amount)),
      labelValue("IBS MUN", taxGroup && formatAmount(taxGroup.ibsMun.amount)),
    ],
  };
  return row;
}

// why: an item without the IBS/CBS group keeps the labels with no value, as the XML has none.
function labelValue(label: string, value: string | null) {
  const line = value ? `${label} ${value}` : label;
  return line;
}

// why: NT 2026.010 4.3: with a reduction (gRed) the DANFE prints the effective rate.
function formatRate(share: NfeTaxShare) {
  const rate = `${formatBrazilianDecimal(share.reduction?.effectiveRate ?? share.rate, RATE)}%`;
  return rate;
}

// why: MOC Anexo II 3.10.5 sends fields the layout does not foresee to the additional information,
// so the total with IBS/CBS (vNFTot) prints there.
function presentAdditionalInformation(nfeDocument: NfeDocument) {
  const total = `Valor total da NF-e com IBS/CBS/IS: R$ ${formatAmount(nfeDocument.totals.totalWithTaxes)}.`;
  const text = toPrintableLine(`${nfeDocument.additionalInformation} ${total}`);
  return text;
}

function formatAmount(text: string) {
  const amount = formatBrazilianDecimal(text, MONEY);
  return amount;
}

function formatNoteNumber(noteNumber: string) {
  const formatted = noteNumber.padStart(9, "0").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
  return formatted;
}

function formatZipCode(zipCode: string) {
  const formatted = zipCode.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return formatted;
}

function formatPhone(phone: string) {
  const formatted = phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
  return formatted;
}

export type { DanfeField, DanfePresentation, DanfeProductRow };
export { presentDanfe };
