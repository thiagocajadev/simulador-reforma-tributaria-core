// Turns an NfseDocument into the DANFSe as printed text: every label and value already formatted,
// laid out as the sections of NT 008 (docs/danfse-layout.md). Zero and absent values print as "-",
// as the upstream generator does. Pure; danfse.render.ts only draws what this returns.

import {
  DASH,
  formatMoneyOrDash,
  formatPercentOrDash,
  formatPrintedDate,
  formatPrintedDateTime,
  formatTaxId,
  toPrintableLine,
  truncateText,
} from "@/shared/pdf/pdf.text.ts";
import type { NfseDocument, Party } from "./nfse.document.ts";

interface DanfseField {
  label: string;
  value: string;
  span?: number;
}

type DanfseBlock =
  | { kind: "grid"; title: string; fields: DanfseField[] }
  | { kind: "banner"; text: string }
  | { kind: "text"; title: string; text: string };

interface DanfsePresentation {
  header: { title: string; subtitle: string; validityNotice: string; issuerNote: string };
  locality: string[];
  accessKey: string;
  qrCodeUrl: string;
  qrCodeNote: string;
  identification: DanfseField[];
  blocks: DanfseBlock[];
  receipt: DanfseField[];
}

const COUNTRY = "BR";
const ACCESS_KEY_PREFIX = "NFS";
const PUBLIC_LOOKUP_URL = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=";
const DESCRIPTION_LIMIT = 1300;
const ADDITIONAL_INFORMATION_LIMIT = 2000;
const APPROXIMATE_TAXES_LINE =
  "Totais aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ 0,00; Estaduais: R$ 0,00; Municipais: R$ 0,00;";

function presentDanfse(nfseDocument: NfseDocument) {
  const accessKey = nfseDocument.accessKey.replace(ACCESS_KEY_PREFIX, "");
  const presentation: DanfsePresentation = {
    header: {
      title: "DANFSe v2.0",
      subtitle: "Documento Auxiliar da NFS-e",
      validityNotice: "NFS-e SEM VALIDADE JURÍDICA",
      issuerNote: "Simulador da Reforma Tributária · documento fictício",
    },
    locality: [
      `Município: ${nfseDocument.municipality.name} - ${nfseDocument.municipality.uf}`,
      "Ambiente Gerador: Ambiente de Homologação",
      "Tipo de Ambiente: Homologação",
    ],
    accessKey,
    qrCodeUrl: `${PUBLIC_LOOKUP_URL}${accessKey}`,
    qrCodeNote:
      "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e",
    identification: presentIdentification(nfseDocument),
    blocks: [
      {
        kind: "grid",
        title: "PRESTADOR / FORNECEDOR",
        fields: presentProvider(nfseDocument.provider),
      },
      { kind: "grid", title: "TOMADOR / ADQUIRENTE", fields: presentParty(nfseDocument.taker) },
      { kind: "banner", text: "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" },
      { kind: "banner", text: "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" },
      { kind: "grid", title: "SERVIÇO PRESTADO", fields: presentService(nfseDocument) },
      { kind: "grid", title: "TRIBUTAÇÃO MUNICIPAL (ISSQN)", fields: presentIssqn(nfseDocument) },
      { kind: "grid", title: "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", fields: presentFederal() },
      { kind: "grid", title: "TRIBUTAÇÃO IBS / CBS", fields: presentIbsCbs(nfseDocument) },
      { kind: "grid", title: "VALOR TOTAL DA NFS-E", fields: presentTotals(nfseDocument) },
      {
        kind: "text",
        title: "INFORMAÇÕES COMPLEMENTARES",
        text: presentAdditionalInformation(nfseDocument.service.additionalInformation),
      },
    ],
    receipt: [
      { label: "DATA CIENTIFICAÇÃO:", value: "" },
      { label: "IDENTIFICAÇÃO E ASSINATURA", value: "" },
      {
        label: "Nº NFS-e / CHAVE NFS-e",
        value: `${nfseDocument.nfseNumber} / ${accessKey}`,
        span: 2,
      },
    ],
  };
  return presentation;
}

function presentIdentification(nfseDocument: NfseDocument) {
  const fields: DanfseField[] = [
    { label: "NÚMERO DA NFS-E", value: nfseDocument.nfseNumber },
    { label: "COMPETÊNCIA DA NFS-E", value: formatPrintedDate(nfseDocument.competenceDate) },
    {
      label: "DATA E HORA DA EMISSÃO DA NFS-E",
      value: formatPrintedDateTime(nfseDocument.processedAt),
    },
    { label: "NÚMERO DA DPS", value: nfseDocument.dpsNumber },
    { label: "SÉRIE DA DPS", value: nfseDocument.dpsSeries },
    { label: "DATA E HORA DA EMISSÃO DA DPS", value: formatPrintedDateTime(nfseDocument.issuedAt) },
    { label: "EMITENTE DA NFS-e", value: "Prestador" },
    { label: "SITUAÇÃO DA NFS-e", value: "NFS-e Regular" },
    { label: "FINALIDADE", value: "NFS-e regular" },
  ];
  return fields;
}

function presentProvider(provider: Party) {
  const fields: DanfseField[] = [
    ...presentParty(provider),
    { label: "Simples Nacional na Data de Competência", value: "1 - Não Optante", span: 2 },
    { label: "Regime de Apuração Tributária pelo SN", value: DASH, span: 2 },
  ];
  return fields;
}

function presentParty(party: Party) {
  const { address } = party;
  const fields: DanfseField[] = [
    { label: "CNPJ / CPF / NIF", value: formatTaxId(party.taxId) },
    { label: "Indicador Municipal (Inscrição)", value: party.municipalRegistration ?? DASH },
    { label: "Telefone", value: DASH },
    { label: "Nome / Nome Empresarial", value: party.name, span: 2 },
    { label: "Município / Sigla UF", value: `${address.municipalityName} / ${address.uf}` },
    {
      label: "Código IBGE / CEP",
      value: `${address.municipalityCode} / ${formatZipCode(address.zipCode)}`,
    },
    {
      label: "Endereço",
      value: `${address.street}, ${address.number}, ${address.district}`,
      span: 2,
    },
    { label: "E-mail", value: party.email, span: 2 },
  ];
  return fields;
}

function presentService(nfseDocument: NfseDocument) {
  const { service, municipality } = nfseDocument;
  const fields: DanfseField[] = [
    {
      label: "Código de Tributação Nacional / Municipal",
      value: formatNationalTaxCode(service.nationalTaxCode),
    },
    { label: "Código da NBS", value: formatNbsCode(service.nbsCode) },
    {
      label: "Local da Prestação / Sigla UF / País",
      value: `${municipality.name} / ${municipality.uf} / ${COUNTRY}`,
    },
    { label: "", value: service.nationalTaxDescription, span: 4 },
    {
      label: "Descrição do Serviço",
      value: truncateText(toPrintableLine(service.description), DESCRIPTION_LIMIT),
      span: 4,
    },
  ];
  return fields;
}

function presentIssqn(nfseDocument: NfseDocument) {
  const { municipality } = nfseDocument;
  const fields: DanfseField[] = [
    { label: "Tipo de Tributação do ISSQN", value: "Operação Tributável" },
    {
      label: "Município / Sigla UF / País de Incidência do ISSQN",
      value: `${municipality.name} / ${municipality.uf} / ${COUNTRY}`,
      span: 2,
    },
    { label: "Regime Especial de Tributação do ISSQN", value: "Nenhum" },
    { label: "Tipo de Imunidade do ISSQN", value: DASH },
    { label: "Suspensão da Exigibilidade do ISSQN", value: DASH },
    { label: "Número Processo Suspensão", value: DASH },
    { label: "Benefício Municipal", value: DASH },
    { label: "Cálculo do BM", value: DASH },
    { label: "Total Deduções/Reduções", value: DASH },
    { label: "Desconto Incondicionado", value: DASH },
    { label: "BC ISSQN", value: formatMoneyOrDash(nfseDocument.serviceAmount) },
    { label: "Alíquota Aplicada", value: DASH },
    { label: "Retenção do ISSQN", value: "Não Retido" },
    { label: "ISSQN Apurado", value: DASH },
  ];
  return fields;
}

function presentFederal() {
  const labels = [
    "IRRF",
    "Contribuição Previdenciária - Retida",
    "Contribuições Sociais - Retidas",
    "PIS - Débito Apuração Própria",
    "COFINS - Débito Apuração Própria",
    "Descrição Contrib. Sociais - Retidas",
  ];
  const fields: DanfseField[] = labels.map((label) => ({ label, value: DASH }));
  return fields;
}

function presentIbsCbs(nfseDocument: NfseDocument) {
  const { ibsCbs, municipality } = nfseDocument;
  const reductions = [ibsCbs.ibsUf, ibsCbs.ibsMun, ibsCbs.cbs].map((rates) =>
    formatPercentOrDash(rates.reductionPercent),
  );
  const fields: DanfseField[] = [
    { label: "CST / cClassTrib", value: `${ibsCbs.cstCode} / ${ibsCbs.cClassTrib}` },
    {
      label: "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF",
      value: `${ibsCbs.indicatorCode} / ${municipality.code} / ${municipality.name} / ${municipality.uf}`,
      span: 2,
    },
    {
      label: "Exclusões e Reduções da Base de Cálculo",
      value: formatMoneyOrDash(nfseDocument.baseDeductions),
    },
    {
      label: "Base de Cálculo Após Exclusões e Reduções",
      value: formatMoneyOrDash(ibsCbs.baseAmount),
    },
    { label: "Red. Alíquota IBS / Red. Alíquota CBS", value: reductions.join(" / ") },
    {
      label: "Alíquota IBS UF / IBS Mun",
      value: `${formatPercentOrDash(ibsCbs.ibsUf.rate)} / ${formatPercentOrDash(ibsCbs.ibsMun.rate)}`,
    },
    {
      label: "Alíq. Efetiva Municipal - IBS",
      value: formatPercentOrDash(ibsCbs.ibsMun.effectiveRate),
    },
    { label: "Valor Apurado Municipal - IBS", value: formatMoneyOrDash(ibsCbs.ibsMunAmount) },
    {
      label: "Alíq. Efetiva Estadual - IBS",
      value: formatPercentOrDash(ibsCbs.ibsUf.effectiveRate),
    },
    { label: "Valor Apurado Estadual - IBS", value: formatMoneyOrDash(ibsCbs.ibsUfAmount) },
    { label: "Valor Total Apurado - IBS", value: formatMoneyOrDash(ibsCbs.ibsAmount) },
    { label: "Alíquota - CBS", value: formatPercentOrDash(ibsCbs.cbs.rate) },
    { label: "Alíquota Efetiva - CBS", value: formatPercentOrDash(ibsCbs.cbs.effectiveRate) },
    { label: "Valor Total Apurado - CBS", value: formatMoneyOrDash(ibsCbs.cbsAmount) },
  ];
  return fields;
}

function presentTotals(nfseDocument: NfseDocument) {
  const fields: DanfseField[] = [
    { label: "VALOR DA OPERAÇÃO / SERVIÇO", value: formatMoneyOrDash(nfseDocument.serviceAmount) },
    { label: "Desconto Incondicionado", value: DASH },
    { label: "Desconto Condicionado", value: DASH },
    { label: "Total das Retenções (ISSQN / Federais)", value: DASH },
    { label: "VALOR LÍQUIDO DA NFS-e", value: formatMoneyOrDash(nfseDocument.netAmount) },
    { label: "Total do IBS/CBS", value: formatMoneyOrDash(nfseDocument.ibsCbs.ibsCbsAmount) },
    {
      label: "VALOR LÍQUIDO DA NFS-e + IBS/CBS",
      value: formatMoneyOrDash(nfseDocument.ibsCbs.totalWithTaxes),
    },
  ];
  return fields;
}

// why: NT 008 cuts the additional information at 2,000 characters but keeps the Lei 12.741/2012
// totals line whole after it.
function presentAdditionalInformation(additionalInformation: string) {
  const room = ADDITIONAL_INFORMATION_LIMIT - APPROXIMATE_TAXES_LINE.length - " | ".length;
  const text = `Inf. Cont.: ${truncateText(additionalInformation, room)} | ${APPROXIMATE_TAXES_LINE}`;
  return text;
}

function formatZipCode(zipCode: string) {
  const formatted = zipCode.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3");
  return formatted;
}

function formatNationalTaxCode(code: string) {
  const formatted = code.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3");
  return formatted;
}

function formatNbsCode(code: string) {
  const formatted = code.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4");
  return formatted;
}

export type { DanfseBlock, DanfseField, DanfsePresentation };
export { presentDanfse };
