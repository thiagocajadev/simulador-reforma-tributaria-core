// Writes an NfseDocument as NFS-e XML (layout 1.01, namespace http://www.sped.fazenda.gov.br/nfse),
// in the element order of the v1.01 XSD the upstream calculator ships. XML tag names live only here.
// The signature is a test one that only passes the XSD (docs/nfse.md, XML).

import { buildTestSignature } from "@/shared/xml/xml.signature.ts";
import { writeXmlDocument, xmlNode } from "@/shared/xml/xml.write.ts";
import type { NfseDocument, Party, TaxRates } from "./nfse.document.ts";

const NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";
const LAYOUT_VERSION = "1.01";

// why: the simulator has no input for these; each value is explained in docs/nfse.md, XML.
const DPS_CONSTANTS = {
  tpEmit: "1",
  opSimpNac: "1",
  regEspTrib: "0",
  tribISSQN: "1",
  tpRetISSQN: "1",
  pTotTribSN: "0.00",
  finNFSe: "0",
  indFinal: "1",
  indDest: "0",
};

// why: the XSD requires these on the note itself, and the upstream sample left them out;
// tpEmis 1 is the national model, nDFSe repeats the note number (docs/nfse.md, XML).
const NFSE_CONSTANTS = {
  tpEmis: "1",
};

function writeNfseXml(nfseDocument: NfseDocument) {
  const root = xmlNode(
    "NFSe",
    [buildInfNfse(nfseDocument), buildTestSignature(nfseDocument.accessKey)],
    { xmlns: NFSE_NAMESPACE, versao: LAYOUT_VERSION },
  );
  const xml = writeXmlDocument(root);
  return xml;
}

function buildInfNfse(nfseDocument: NfseDocument) {
  const { municipality, ibsCbs } = nfseDocument;
  const infNfse = xmlNode(
    "infNFSe",
    [
      xmlNode("xLocEmi", municipality.name),
      xmlNode("xLocPrestacao", municipality.name),
      xmlNode("nNFSe", nfseDocument.nfseNumber),
      xmlNode("cLocIncid", String(municipality.code)),
      xmlNode("xLocIncid", municipality.name),
      xmlNode("xTribNac", nfseDocument.service.nationalTaxDescription),
      xmlNode("verAplic", nfseDocument.applicationVersion),
      xmlNode("ambGer", nfseDocument.environment),
      xmlNode("tpEmis", NFSE_CONSTANTS.tpEmis),
      xmlNode("cStat", nfseDocument.statusCode),
      xmlNode("dhProc", nfseDocument.processedAt),
      xmlNode("nDFSe", nfseDocument.nfseNumber),
      buildEmit(nfseDocument.provider),
      xmlNode("valores", [
        xmlNode("vBC", nfseDocument.serviceAmount),
        xmlNode("vLiq", nfseDocument.netAmount),
      ]),
      xmlNode("IBSCBS", [
        xmlNode("cLocalidadeIncid", String(municipality.code)),
        xmlNode("xLocalidadeIncid", municipality.name),
        xmlNode("valores", [
          xmlNode("vBC", ibsCbs.baseAmount),
          xmlNode("uf", buildRates(ibsCbs.ibsUf, ["pIBSUF", "pRedAliqUF", "pAliqEfetUF"])),
          xmlNode("mun", buildRates(ibsCbs.ibsMun, ["pIBSMun", "pRedAliqMun", "pAliqEfetMun"])),
          xmlNode("fed", buildRates(ibsCbs.cbs, ["pCBS", "pRedAliqCBS", "pAliqEfetCBS"])),
        ]),
        xmlNode("totCIBS", [
          xmlNode("vTotNF", ibsCbs.totalWithTaxes),
          xmlNode("gIBS", [
            xmlNode("vIBSTot", ibsCbs.ibsAmount),
            xmlNode("gIBSUFTot", [xmlNode("vIBSUF", ibsCbs.ibsUfAmount)]),
            xmlNode("gIBSMunTot", [xmlNode("vIBSMun", ibsCbs.ibsMunAmount)]),
          ]),
          xmlNode("gCBS", [xmlNode("vCBS", ibsCbs.cbsAmount)]),
        ]),
      ]),
      xmlNode("DPS", [buildInfDps(nfseDocument)], { versao: LAYOUT_VERSION }),
    ],
    { Id: nfseDocument.accessKey },
  );
  return infNfse;
}

function buildEmit(provider: Party) {
  const { address } = provider;
  const emit = xmlNode("emit", [
    xmlNode("CNPJ", provider.taxId),
    xmlNode("IM", provider.municipalRegistration ?? ""),
    xmlNode("xNome", provider.name),
    xmlNode("enderNac", [
      xmlNode("xLgr", address.street),
      xmlNode("nro", address.number),
      xmlNode("xBairro", address.district),
      xmlNode("cMun", String(address.municipalityCode)),
      xmlNode("UF", address.uf),
      xmlNode("CEP", address.zipCode),
    ]),
    xmlNode("email", provider.email),
  ]);
  return emit;
}

// why: a CST without the reduction group sends no reduction percentage.
function buildRates(rates: TaxRates, names: [string, string, string]) {
  const [rateName, reductionName, effectiveName] = names;
  const reduction = rates.reductionPercent ? [xmlNode(reductionName, rates.reductionPercent)] : [];
  const children = [
    xmlNode(rateName, rates.rate),
    ...reduction,
    xmlNode(effectiveName, rates.effectiveRate),
  ];
  return children;
}

function buildInfDps(nfseDocument: NfseDocument) {
  const { municipality, service, ibsCbs } = nfseDocument;
  const infDps = xmlNode(
    "infDPS",
    [
      xmlNode("tpAmb", nfseDocument.environment),
      xmlNode("dhEmi", nfseDocument.issuedAt),
      xmlNode("verAplic", nfseDocument.applicationVersion),
      xmlNode("serie", nfseDocument.dpsSeries),
      xmlNode("nDPS", nfseDocument.dpsNumber),
      xmlNode("dCompet", nfseDocument.competenceDate),
      xmlNode("tpEmit", DPS_CONSTANTS.tpEmit),
      xmlNode("cLocEmi", String(municipality.code)),
      xmlNode("prest", [
        xmlNode("CNPJ", nfseDocument.provider.taxId),
        xmlNode("regTrib", [
          xmlNode("opSimpNac", DPS_CONSTANTS.opSimpNac),
          xmlNode("regEspTrib", DPS_CONSTANTS.regEspTrib),
        ]),
      ]),
      buildToma(nfseDocument.taker),
      xmlNode("serv", [
        xmlNode("locPrest", [xmlNode("cLocPrestacao", String(municipality.code))]),
        xmlNode("cServ", [
          xmlNode("cTribNac", service.nationalTaxCode),
          xmlNode("xDescServ", service.description),
          xmlNode("cNBS", service.nbsCode),
        ]),
        xmlNode("infoCompl", [xmlNode("xInfComp", service.additionalInformation)]),
      ]),
      xmlNode("valores", [
        xmlNode("vServPrest", [xmlNode("vServ", nfseDocument.serviceAmount)]),
        xmlNode("trib", [
          xmlNode("tribMun", [
            xmlNode("tribISSQN", DPS_CONSTANTS.tribISSQN),
            xmlNode("tpRetISSQN", DPS_CONSTANTS.tpRetISSQN),
          ]),
          xmlNode("totTrib", [xmlNode("pTotTribSN", DPS_CONSTANTS.pTotTribSN)]),
        ]),
      ]),
      xmlNode("IBSCBS", [
        xmlNode("finNFSe", DPS_CONSTANTS.finNFSe),
        xmlNode("indFinal", DPS_CONSTANTS.indFinal),
        xmlNode("cIndOp", ibsCbs.indicatorCode),
        xmlNode("indDest", DPS_CONSTANTS.indDest),
        xmlNode("valores", [
          xmlNode("trib", [
            xmlNode("gIBSCBS", [
              xmlNode("CST", ibsCbs.cstCode),
              xmlNode("cClassTrib", ibsCbs.cClassTrib),
            ]),
          ]),
        ]),
      ]),
    ],
    { Id: nfseDocument.dpsId },
  );
  return infDps;
}

function buildToma(taker: Party) {
  const { address } = taker;
  const toma = xmlNode("toma", [
    xmlNode("CPF", taker.taxId),
    xmlNode("xNome", taker.name),
    xmlNode("end", [
      xmlNode("endNac", [
        xmlNode("cMun", String(address.municipalityCode)),
        xmlNode("CEP", address.zipCode),
      ]),
      xmlNode("xLgr", address.street),
      xmlNode("nro", address.number),
      xmlNode("xBairro", address.district),
    ]),
    xmlNode("email", taker.email),
  ]);
  return toma;
}

export { writeNfseXml };
