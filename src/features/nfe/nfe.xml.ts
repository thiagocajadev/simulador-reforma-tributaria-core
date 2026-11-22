// Writes an NfeDocument as NF-e XML (layout 4.00, namespace http://www.portalfiscal.inf.br/nfe), in
// the element order of the layout schema the upstream calculator ships, with the IBS/CBS groups of
// NT 2025.002. XML tag names live only in this file. The signature is a test one that only passes
// the XSD, and there is no authorization protocol, which cannot be faked (docs/nfe.md, XML).

import { buildTestSignature } from "@/shared/xml/xml.signature.ts";
import { writeXmlDocument, type XmlNode, xmlNode } from "@/shared/xml/xml.write.ts";
import type {
  NfeDocument,
  NfeItem,
  NfeItemTaxGroup,
  NfeParty,
  NfeTaxShare,
  NfeTotals,
} from "./nfe.document.ts";

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const LAYOUT_VERSION = "4.00";
const ZERO_MONEY = "0.00";
const BRAZIL_CODE = "1058";
const BRAZIL_NAME = "Brasil";
const WITHOUT_GTIN = "SEM GTIN";

// why: the simulator has no input for these; each value is explained in docs/nfe.md, XML.
const IDE_CONSTANTS = {
  mod: "55",
  tpNF: "1",
  idDest: "1",
  tpImp: "1",
  tpEmis: "1",
  finNFe: "1",
  indFinal: "1",
  indPres: "1",
  procEmi: "0",
};

const RECIPIENT_NOT_CONTRIBUTOR = "9";
const ITEM_COUNTS_IN_TOTAL = "1";
const WITHOUT_TRANSPORT = "9";
const CASH_PAYMENT = "01";

// why: ICMSTot is required even though the simulator calculates no ICMS, IPI, PIS or COFINS.
const UNCALCULATED_ICMS_TOTALS = [
  "vBC",
  "vICMS",
  "vICMSDeson",
  "vFCP",
  "vBCST",
  "vST",
  "vFCPST",
  "vFCPSTRet",
];
const UNCALCULATED_OTHER_TOTALS = [
  "vFrete",
  "vSeg",
  "vDesc",
  "vII",
  "vIPI",
  "vIPIDevol",
  "vPIS",
  "vCOFINS",
  "vOutro",
];

function writeNfeXml(nfeDocument: NfeDocument) {
  const root = xmlNode(
    "NFe",
    [buildInfNfe(nfeDocument), buildTestSignature(`NFe${nfeDocument.accessKey}`)],
    { xmlns: NFE_NAMESPACE },
  );
  const xml = writeXmlDocument(root);
  return xml;
}

function buildInfNfe(nfeDocument: NfeDocument) {
  const infNfe = xmlNode(
    "infNFe",
    [
      buildIde(nfeDocument),
      buildEmit(nfeDocument),
      buildDest(nfeDocument.recipient),
      ...nfeDocument.items.map(buildDet),
      buildTotal(nfeDocument.totals),
      xmlNode("transp", [xmlNode("modFrete", WITHOUT_TRANSPORT)]),
      xmlNode("pag", [
        xmlNode("detPag", [
          xmlNode("tPag", CASH_PAYMENT),
          xmlNode("vPag", nfeDocument.totals.totalWithTaxes),
        ]),
      ]),
      xmlNode("infAdic", [xmlNode("infCpl", nfeDocument.additionalInformation)]),
    ],
    { Id: `NFe${nfeDocument.accessKey}`, versao: LAYOUT_VERSION },
  );
  return infNfe;
}

function buildIde(nfeDocument: NfeDocument) {
  const ide = xmlNode("ide", [
    xmlNode("cUF", nfeDocument.ufCode),
    xmlNode("cNF", nfeDocument.numericCode),
    xmlNode("natOp", nfeDocument.operationNature),
    xmlNode("mod", IDE_CONSTANTS.mod),
    xmlNode("serie", nfeDocument.series),
    xmlNode("nNF", nfeDocument.noteNumber),
    xmlNode("dhEmi", nfeDocument.issuedAt),
    xmlNode("dhSaiEnt", nfeDocument.issuedAt),
    xmlNode("tpNF", IDE_CONSTANTS.tpNF),
    xmlNode("idDest", IDE_CONSTANTS.idDest),
    xmlNode("cMunFG", String(nfeDocument.municipality.code)),
    xmlNode("tpImp", IDE_CONSTANTS.tpImp),
    xmlNode("tpEmis", IDE_CONSTANTS.tpEmis),
    xmlNode("cDV", nfeDocument.checkDigit),
    xmlNode("tpAmb", nfeDocument.environment),
    xmlNode("finNFe", IDE_CONSTANTS.finNFe),
    xmlNode("indFinal", IDE_CONSTANTS.indFinal),
    xmlNode("indPres", IDE_CONSTANTS.indPres),
    xmlNode("procEmi", IDE_CONSTANTS.procEmi),
    xmlNode("verProc", nfeDocument.applicationVersion),
  ]);
  return ide;
}

function buildEmit(nfeDocument: NfeDocument) {
  const { issuer } = nfeDocument;
  const emit = xmlNode("emit", [
    xmlNode("CNPJ", issuer.taxId),
    xmlNode("xNome", issuer.name),
    buildAddress("enderEmit", issuer),
    xmlNode("IE", issuer.stateRegistration ?? ""),
    xmlNode("CRT", nfeDocument.taxRegimeCode),
  ]);
  return emit;
}

function buildDest(recipient: NfeParty) {
  const dest = xmlNode("dest", [
    xmlNode("CPF", recipient.taxId),
    xmlNode("xNome", recipient.name),
    buildAddress("enderDest", recipient),
    xmlNode("indIEDest", RECIPIENT_NOT_CONTRIBUTOR),
  ]);
  return dest;
}

function buildAddress(name: string, party: NfeParty) {
  const { address } = party;
  const addressNode = xmlNode(name, [
    xmlNode("xLgr", address.street),
    xmlNode("nro", address.number),
    xmlNode("xBairro", address.district),
    xmlNode("cMun", String(address.municipalityCode)),
    xmlNode("xMun", address.municipalityName),
    xmlNode("UF", address.uf),
    xmlNode("CEP", address.zipCode),
    xmlNode("cPais", BRAZIL_CODE),
    xmlNode("xPais", BRAZIL_NAME),
    xmlNode("fone", address.phone),
  ]);
  return addressNode;
}

function buildDet(nfeItem: NfeItem) {
  const det = xmlNode(
    "det",
    [
      buildProd(nfeItem),
      xmlNode("imposto", [...buildItemSelectiveTax(nfeItem), buildItemIbsCbs(nfeItem)]),
      xmlNode("vItem", nfeItem.itemTotal),
    ],
    { nItem: String(nfeItem.itemNumber) },
  );
  return det;
}

function buildProd(nfeItem: NfeItem) {
  const prod = xmlNode("prod", [
    xmlNode("cProd", nfeItem.productCode),
    xmlNode("cEAN", WITHOUT_GTIN),
    xmlNode("xProd", nfeItem.description),
    xmlNode("NCM", nfeItem.ncmCode),
    xmlNode("CFOP", nfeItem.cfop),
    xmlNode("uCom", nfeItem.unit),
    xmlNode("qCom", nfeItem.quantity),
    xmlNode("vUnCom", nfeItem.unitPrice),
    xmlNode("vProd", nfeItem.productAmount),
    xmlNode("cEANTrib", WITHOUT_GTIN),
    xmlNode("uTrib", nfeItem.unit),
    xmlNode("qTrib", nfeItem.quantity),
    xmlNode("vUnTrib", nfeItem.unitPrice),
    xmlNode("indTot", ITEM_COUNTS_IN_TOTAL),
  ]);
  return prod;
}

// why: IS precedes IBSCBS in det/imposto; the specific rate is adRemIS (UB07), as the Sefaz schema has it.
function buildItemSelectiveTax(nfeItem: NfeItem) {
  const { selectiveTax } = nfeItem;

  if (!selectiveTax) {
    return [];
  }

  const { specificRate, unit, quantity } = selectiveTax;
  const specific = specificRate ? [xmlNode("adRemIS", specificRate)] : [];
  const measured = unit && quantity ? [xmlNode("uTrib", unit), xmlNode("qTrib", quantity)] : [];
  const group = [
    xmlNode("IS", [
      xmlNode("CSTIS", selectiveTax.cstCode),
      xmlNode("cClassTribIS", selectiveTax.cClassTrib),
      xmlNode("vBCIS", selectiveTax.baseAmount),
      xmlNode("pIS", selectiveTax.rate),
      ...specific,
      ...measured,
      xmlNode("vIS", selectiveTax.amount),
    ]),
  ];
  return group;
}

function buildItemIbsCbs(nfeItem: NfeItem) {
  const group = nfeItem.taxGroup ? [buildGIbsCbs(nfeItem.taxGroup)] : [];
  const ibsCbs = xmlNode("IBSCBS", [
    xmlNode("CST", nfeItem.cstCode),
    xmlNode("cClassTrib", nfeItem.cClassTrib),
    ...group,
  ]);
  return ibsCbs;
}

function buildGIbsCbs(taxGroup: NfeItemTaxGroup) {
  const gIbsCbs = xmlNode("gIBSCBS", [
    xmlNode("vBC", taxGroup.baseAmount),
    xmlNode("gIBSUF", buildShare(taxGroup.ibsUf, ["pIBSUF", "vIBSUF"])),
    xmlNode("gIBSMun", buildShare(taxGroup.ibsMun, ["pIBSMun", "vIBSMun"])),
    xmlNode("vIBS", taxGroup.ibsAmount),
    xmlNode("gCBS", buildShare(taxGroup.cbs, ["pCBS", "vCBS"])),
  ]);
  return gIbsCbs;
}

// why: the reduction group goes between the rate and the amount, and only when there is a reduction.
function buildShare(share: NfeTaxShare, names: [string, string]) {
  const [rateName, amountName] = names;
  const reduction: XmlNode[] = share.reduction
    ? [
        xmlNode("gRed", [
          xmlNode("pRedAliq", share.reduction.percent),
          xmlNode("pAliqEfet", share.reduction.effectiveRate),
        ]),
      ]
    : [];
  const children = [xmlNode(rateName, share.rate), ...reduction, xmlNode(amountName, share.amount)];
  return children;
}

function buildTotal(totals: NfeTotals) {
  const total = xmlNode("total", [
    xmlNode("ICMSTot", [
      ...UNCALCULATED_ICMS_TOTALS.map((name) => xmlNode(name, ZERO_MONEY)),
      xmlNode("vProd", totals.productAmount),
      ...UNCALCULATED_OTHER_TOTALS.map((name) => xmlNode(name, ZERO_MONEY)),
      xmlNode("vNF", totals.noteAmount),
    ]),
    ...(totals.selectiveTaxAmount
      ? [xmlNode("ISTot", [xmlNode("vIS", totals.selectiveTaxAmount)])]
      : []),
    buildIbsCbsTot(totals),
    xmlNode("vNFTot", totals.totalWithTaxes),
  ]);
  return total;
}

function buildIbsCbsTot(totals: NfeTotals) {
  const ibsCbsTot = xmlNode("IBSCBSTot", [
    xmlNode("vBCIBSCBS", totals.ibsCbsBase),
    xmlNode("gIBS", [
      xmlNode("gIBSUF", buildUncreditedShare("vIBSUF", totals.ibsUfAmount)),
      xmlNode("gIBSMun", buildUncreditedShare("vIBSMun", totals.ibsMunAmount)),
      xmlNode("vIBS", totals.ibsAmount),
      xmlNode("vCredPres", ZERO_MONEY),
      xmlNode("vCredPresCondSus", ZERO_MONEY),
    ]),
    xmlNode("gCBS", [
      ...buildUncreditedShare("vCBS", totals.cbsAmount),
      xmlNode("vCredPres", ZERO_MONEY),
      xmlNode("vCredPresCondSus", ZERO_MONEY),
    ]),
  ]);
  return ibsCbsTot;
}

// why: deferral (vDif) and returned tax (vDevTrib) are not simulated, so both stay zero.
function buildUncreditedShare(amountName: string, amount: string) {
  const children = [
    xmlNode("vDif", ZERO_MONEY),
    xmlNode("vDevTrib", ZERO_MONEY),
    xmlNode(amountName, amount),
  ];
  return children;
}

export { writeNfeXml };
