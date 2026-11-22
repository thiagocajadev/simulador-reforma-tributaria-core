// The test signature of a simulated note: an enveloped XMLDSig with the shape the NF-e and NFS-e
// schemas demand (C14N, RSA-SHA1, SHA-1, the two NF-e transforms) and fictitious values, so the
// XML passes the XSD and fails any real check. Each value decodes to text saying it is simulated.
// The real steps (ICP-Brasil certificate, C14N digest, RSA key) are in docs/security.md.

import { type XmlNode, xmlNode } from "./xml.write.ts";

const SIGNATURE_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
const C14N_ALGORITHM = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA1_ALGORITHM = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1_ALGORITHM = "http://www.w3.org/2000/09/xmldsig#sha1";
const ENVELOPED_ALGORITHM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const SIMULATED_DIGEST = btoa("RESUMO SIMULADO");
const SIMULATED_SIGNATURE_VALUE = btoa("ASSINATURA SIMULADA, SEM VALOR");
const SIMULATED_CERTIFICATE = btoa("SIMULADA");

function buildTestSignature(signedElementId: string) {
  const signature: XmlNode = xmlNode(
    "Signature",
    [
      buildSignedInfo(signedElementId),
      xmlNode("SignatureValue", SIMULATED_SIGNATURE_VALUE),
      xmlNode("KeyInfo", [
        xmlNode("X509Data", [xmlNode("X509Certificate", SIMULATED_CERTIFICATE)]),
      ]),
    ],
    { xmlns: SIGNATURE_NAMESPACE },
  );
  return signature;
}

function buildSignedInfo(signedElementId: string) {
  const signedInfo = xmlNode("SignedInfo", [
    xmlNode("CanonicalizationMethod", "", { Algorithm: C14N_ALGORITHM }),
    xmlNode("SignatureMethod", "", { Algorithm: RSA_SHA1_ALGORITHM }),
    xmlNode(
      "Reference",
      [
        xmlNode("Transforms", [
          xmlNode("Transform", "", { Algorithm: ENVELOPED_ALGORITHM }),
          xmlNode("Transform", "", { Algorithm: C14N_ALGORITHM }),
        ]),
        xmlNode("DigestMethod", "", { Algorithm: SHA1_ALGORITHM }),
        xmlNode("DigestValue", SIMULATED_DIGEST),
      ],
      { URI: `#${signedElementId}` },
    ),
  ]);
  return signedInfo;
}

export { buildTestSignature };
