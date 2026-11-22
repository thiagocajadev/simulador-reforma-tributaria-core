// Validates a simulated NF-e or NFS-e XML against the official XSD, with libxml2 compiled to
// WebAssembly (xmllint-wasm), which runs it in a worker. The XML never leaves the machine. The
// browser loads this module on demand (xml.validation.service.ts). The NF-e schemas are the
// portal's own package PL 010h v1.03 (published 2026-11-13), copied unchanged into ./schemas/
// (docs/nfe.md, Validation); the NFS-e ones are those the upstream calculator ships.

import { validateXML, type XMLFileInfo, type XMLValidationError } from "xmllint-wasm";
import nfseRoot from "../../../upstream/calculadora-rtc-regime-regular/src/main/resources/xml/nfse/nota.xsd?raw";
import nfseComplexTypes from "../../../upstream/calculadora-rtc-regime-regular/src/main/resources/xml/nfse/originais/tiposComplexos_v1.01.xsd?raw";
import nfseSimpleTypes from "../../../upstream/calculadora-rtc-regime-regular/src/main/resources/xml/nfse/originais/tiposSimples_v1.01.xsd?raw";
import nfseSignature from "../../../upstream/calculadora-rtc-regime-regular/src/main/resources/xml/nfse/originais/xmldsig-core-schema.xsd?raw";
import nfeBasicTypes from "./schemas/nfe-pl010h-v1.03/DFeTiposBasicos_v1.00.xsd?raw";
import nfeLayout from "./schemas/nfe-pl010h-v1.03/leiauteNFe_v4.00.xsd?raw";
import nfeRoot from "./schemas/nfe-pl010h-v1.03/nfe_v4.00.xsd?raw";
import nfeTypes from "./schemas/nfe-pl010h-v1.03/tiposBasico_v4.00.xsd?raw";
import nfeSignature from "./schemas/nfe-pl010h-v1.03/xmldsig-core-schema_v1.01.xsd?raw";

type XmlDocumentKind = "nfe" | "nfse";

interface XmlSchemaError {
  lineNumber: number | null;
  message: string;
}

type XmlSchemaCheck = { isValid: true } | { isValid: false; errors: XmlSchemaError[] };

interface SchemaSet {
  root: XMLFileInfo;
  includes: XMLFileInfo[];
}

const XML_FILE_NAME = "documento-simulado.xml";
// why: nota.xsd is the upstream's own root for the NFS-e and points into ./originais/; the
// worker's file system is flat, so the paths lose the folder.
const NFSE_ORIGINALS_FOLDER = /\.\/originais\//g;

const SCHEMA_SETS: Record<XmlDocumentKind, SchemaSet> = {
  nfe: {
    root: { fileName: "nfe_v4.00.xsd", contents: nfeRoot },
    includes: [
      { fileName: "leiauteNFe_v4.00.xsd", contents: nfeLayout },
      { fileName: "tiposBasico_v4.00.xsd", contents: nfeTypes },
      { fileName: "DFeTiposBasicos_v1.00.xsd", contents: nfeBasicTypes },
      { fileName: "xmldsig-core-schema_v1.01.xsd", contents: nfeSignature },
    ],
  },
  nfse: {
    root: { fileName: "nota.xsd", contents: nfseRoot.replace(NFSE_ORIGINALS_FOLDER, "") },
    includes: [
      { fileName: "tiposComplexos_v1.01.xsd", contents: nfseComplexTypes },
      { fileName: "tiposSimples_v1.01.xsd", contents: nfseSimpleTypes },
      { fileName: "xmldsig-core-schema.xsd", contents: nfseSignature },
    ],
  },
};

async function checkXmlAgainstSchema(input: { xml: string; kind: XmlDocumentKind }) {
  const { xml, kind } = input;
  const schemaSet = SCHEMA_SETS[kind];
  const result = await validateXML({
    xml: { fileName: XML_FILE_NAME, contents: xml },
    schema: schemaSet.root,
    preload: schemaSet.includes,
  });
  const check: XmlSchemaCheck = result.valid
    ? { isValid: true }
    : {
        isValid: false,
        errors: result.errors.map(toSchemaError),
      };
  return check;
}

// why: an error raised inside an XSD file carries that file's line; only the XML's lines are shown
// as lines, and the rest names the schema file.
function toSchemaError(error: XMLValidationError) {
  const isInXml = error.loc?.fileName === XML_FILE_NAME;
  const schemaError: XmlSchemaError = isInXml
    ? { lineNumber: error.loc?.lineNumber ?? null, message: error.message }
    : { lineNumber: null, message: `${error.loc?.fileName ?? "schema"}: ${error.message}` };
  return schemaError;
}

export type { XmlDocumentKind, XmlSchemaCheck, XmlSchemaError };
export { checkXmlAgainstSchema };
