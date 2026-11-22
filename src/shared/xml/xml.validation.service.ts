// Checks a simulated XML against the official XSD on demand. The schemas, libxml2 and its
// WebAssembly load through import() only when the visitor asks, so the first visit never
// downloads them; a failed load or a validator crash becomes a value, never an exception.

import type { XmlDocumentKind, XmlSchemaCheck } from "./xml.schema.ts";

type XmlSchemaVerdict = { isAvailable: true; check: XmlSchemaCheck } | { isAvailable: false };

async function verifyXmlSchema(input: { xml: string; kind: XmlDocumentKind }) {
  try {
    const { checkXmlAgainstSchema } = await import("./xml.schema.ts");
    const verdict: XmlSchemaVerdict = {
      isAvailable: true,
      check: await checkXmlAgainstSchema(input),
    };
    return verdict;
  } catch (error) {
    console.error(JSON.stringify({ event: "xml.validation_failed", message: String(error) }));

    const unavailable: XmlSchemaVerdict = { isAvailable: false };
    return unavailable;
  }
}

export type { XmlSchemaVerdict };
export { verifyXmlSchema };
