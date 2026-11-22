// Reads the text of an XML file the visitor chose and decides what it is: an NF-e (the NFe element,
// alone or inside the nfeProc the Sefaz returns), an NFS-e (the NFSe element), something else, or
// not XML at all. Runs in the browser with DOMParser, which never fetches external entities; the
// file never leaves the machine (docs/nfe.md, Validation).

import type { XmlDocumentKind } from "@/shared/xml/xml.schema.ts";
import { toXmlTree, type XmlTreeNode } from "./xml.tree.ts";

type UploadedXml =
  | { kind: XmlDocumentKind; xml: string; tree: XmlTreeNode; isProcessed: boolean }
  | { kind: "malformed" }
  | { kind: "unsupported"; rootName: string };

const XML_MIME = "application/xml";
const PARSER_ERROR = "parsererror";
const NFE_ROOT = "NFe";
const NFE_PROCESSED_ROOT = "nfeProc";
const NFSE_ROOT = "NFSe";

function readUploadedXml(text: string) {
  const parsed = new DOMParser().parseFromString(text, XML_MIME);
  const root = parsed.documentElement;
  const isMalformed = parsed.getElementsByTagName(PARSER_ERROR).length > 0 || root === null;

  if (isMalformed) {
    const malformed: UploadedXml = { kind: "malformed" };
    return malformed;
  }

  const uploaded = classifyRoot(root, text);
  return uploaded;
}

// why: the XSD's root is NFe, so a processed note (nfeProc, with the protocol) is checked by its NFe.
function classifyRoot(root: Element, text: string) {
  if (root.localName === NFE_ROOT) {
    const nfe: UploadedXml = { kind: "nfe", xml: text, tree: toXmlTree(root), isProcessed: false };
    return nfe;
  }

  const innerNfe =
    root.localName === NFE_PROCESSED_ROOT
      ? [...root.children].find((child) => child.localName === NFE_ROOT)
      : undefined;

  if (innerNfe) {
    const processed: UploadedXml = {
      kind: "nfe",
      xml: new XMLSerializer().serializeToString(innerNfe),
      tree: toXmlTree(innerNfe),
      isProcessed: true,
    };
    return processed;
  }

  if (root.localName === NFSE_ROOT) {
    const nfse: UploadedXml = {
      kind: "nfse",
      xml: text,
      tree: toXmlTree(root),
      isProcessed: false,
    };
    return nfse;
  }

  const unsupported: UploadedXml = { kind: "unsupported", rootName: root.localName };
  return unsupported;
}

export type { UploadedXml };
export { readUploadedXml };
