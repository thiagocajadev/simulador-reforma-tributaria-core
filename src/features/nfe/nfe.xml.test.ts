import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CalculatedItem } from "@/features/calculations/calculation.dto.ts";
import { checkXmlAgainstSchema } from "@/shared/xml/xml.schema.ts";
import { buildNfeDocument, type NfeInput } from "./nfe.document.ts";
import { NFE_GOLDEN_CASES, readNfeGoldenCase } from "./nfe.fixture.ts";
import { writeNfeXml } from "./nfe.xml.ts";

function compactXml(xml: string) {
  const compact = xml.replace(/>\s+</g, "><").trim();
  return compact;
}

function writeGoldenXml(caseName: string, change?: (input: NfeInput) => NfeInput) {
  const { input } = readNfeGoldenCase(caseName);
  const xml = compactXml(writeNfeXml(buildNfeDocument(change ? change(input) : input)));
  return xml;
}

describe("writeNfeXml", () => {
  it.each(NFE_GOLDEN_CASES)(
    "passes the official NF-e XSD the upstream ships: %s",
    async (caseName) => {
      const { input } = readNfeGoldenCase(caseName);
      const xml = writeNfeXml(buildNfeDocument(input));

      const expected = { isValid: true };
      const actual = await checkXmlAgainstSchema({ xml, kind: "nfe" });

      expect(actual).toStrictEqual(expected);
    },
  );

  it("names the IS ad rem rate adRemIS, as the Sefaz schema does, and refuses pISEspec", async () => {
    const xml = writeGoldenXml("selective-tax-cigars-2027");
    const deprecated = xml.replaceAll("adRemIS>", "pISEspec>");

    const expectedElement = "<pIS>13.00</pIS><adRemIS>21.30</adRemIS><uTrib>VN</uTrib>";
    const expectedDeprecated = false;
    const actualDeprecated = await checkXmlAgainstSchema({ xml: deprecated, kind: "nfe" });

    expect(xml).toContain(expectedElement);
    expect(actualDeprecated.isValid).toBe(expectedDeprecated);
  });

  it("adds the IS to vItem and vNFTot from 2027, and writes ISTot before IBSCBSTot", () => {
    const xml = writeGoldenXml("selective-tax-cigars-2027");

    const expectedElements = [
      "<vItem>2693.10</vItem>",
      "<vNFTot>2693.10</vNFTot>",
      "<ISTot><vIS>473.00</vIS></ISTot><IBSCBSTot>",
      "<imposto><IS><CSTIS>000</CSTIS>",
    ];
    const actualMissing = expectedElements.filter((element) => !xml.includes(element));

    expect(actualMissing).toStrictEqual([]);
  });

  it("opens the NF-e 4.00 in the national namespace, its Id the access key after NFe", () => {
    const xml = writeGoldenXml("full-rate-goods-2027-nominal");

    const expectedStart =
      '<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe43270312345678000195550010000000011123456780" versao="4.00"><ide><cUF>43</cUF>';
    const actualStart = xml.slice(0, expectedStart.length);

    expect(actualStart).toBe(expectedStart);
  });

  it("marks the note as homologation and names the recipient as the national rules require", () => {
    const xml = writeGoldenXml("full-rate-goods-2026");

    const expectedElements = [
      "<tpAmb>2</tpAmb>",
      "<xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome>",
      "<CRT>3</CRT>",
    ];
    const actualHasEach = expectedElements.map((element) => xml.includes(element));

    expect(actualHasEach).toStrictEqual([true, true, true]);
  });

  it("sends only IBS/CBS in each item, with no ICMS group, and zeros in ICMSTot", () => {
    const xml = writeGoldenXml("full-rate-goods-2027-nominal");

    const expectedImposto = /<imposto><IBSCBS>.*?<\/IBSCBS><\/imposto><vItem>1089\.00<\/vItem>/;
    const expectedIcmsTotals =
      "<ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>1000.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>1000.00</vNF></ICMSTot>";
    const expectedNoteTotal = "</IBSCBSTot><vNFTot>1089.00</vNFTot></total>";

    expect(xml).toMatch(expectedImposto);
    expect(xml).toContain(expectedIcmsTotals);
    expect(xml).toContain(expectedNoteTotal);
  });

  it("sends CST and cClassTrib alone for an item without the IBS/CBS group", () => {
    const xml = writeGoldenXml("full-rate-goods-2027-nominal", (input) => {
      const [firstItem] = input.calculatedItems as [CalculatedItem];
      const immune: CalculatedItem = {
        ...firstItem,
        cstCode: "410",
        cClassTrib: "410999",
        taxes: null,
      };
      const changed: NfeInput = { ...input, calculatedItems: [immune] };
      return changed;
    });

    const expectedGroup = "<IBSCBS><CST>410</CST><cClassTrib>410999</cClassTrib></IBSCBS>";

    expect(xml).toContain(expectedGroup);
  });

  it("escapes markup characters typed in the product description", () => {
    const xml = writeGoldenXml("full-rate-goods-2026", (input) => {
      const changed: NfeInput = { ...input, itemDescriptions: ['Cabo "USB-C" <2m> & adaptador'] };
      return changed;
    });

    const expectedDescription = "<xProd>Cabo &quot;USB-C&quot; &lt;2m&gt; &amp; adaptador</xProd>";

    expect(xml).toContain(expectedDescription);
  });

  it("leaves the authorization protocol out, since no Sefaz authorized the note", () => {
    const xml = writeGoldenXml("multi-item-2026");

    const expectedMissing = ["<protNFe", "<nfeProc"];
    const actualPresent = expectedMissing.filter((tag) => xml.includes(tag));

    expect(actualPresent).toStrictEqual([]);
  });

  it("signs the infNFe with a test signature whose certificate decodes to SIMULADA", () => {
    const xml = writeGoldenXml("multi-item-2026");

    const expectedReference = `#${xml.match(/<infNFe Id="([^"]+)"/)?.[1]}`;
    const expectedCertificate = "SIMULADA";
    const actualReference = xml.match(/<Reference URI="([^"]+)">/)?.[1];
    const actualCertificate = atob(xml.match(/<X509Certificate>([^<]+)</)?.[1] ?? "");

    expect(actualReference).toBe(expectedReference);
    expect(actualCertificate).toBe(expectedCertificate);
  });
});

const UPSTREAM_SAMPLE_PATH = path.resolve(
  import.meta.dirname,
  "../../../upstream/calculadora-rtc-regime-regular/src/test/resources/xml/nfe/valido/nota/nfe_valido.xml",
);
const ORDERED_PARENTS = [
  "infNFe",
  "ide",
  "emit",
  "enderEmit",
  "dest",
  "enderDest",
  "det",
  "prod",
  "IBSCBS",
  "gIBSCBS",
  "total",
  "ICMSTot",
  "IBSCBSTot",
];

// why: lists the children of each parent in document order, the first time each parent appears.
function readChildOrder(xml: string) {
  const childOrder = new Map<string, string[]>();
  const openParents: string[] = [];

  for (const [, closing, name, selfClosing] of xml.matchAll(/<(\/?)([A-Za-z][\w]*)[^>]*?(\/?)>/g)) {
    if (closing) {
      openParents.pop();
      continue;
    }

    const parent = openParents.at(-1) ?? "";
    const siblings = childOrder.get(parent) ?? [];

    if (siblings.at(-1) !== name) {
      childOrder.set(parent, [...siblings, name ?? ""]);
    }

    if (!selfClosing) {
      openParents.push(name ?? "");
    }
  }

  return childOrder;
}

describe("writeNfeXml element order", () => {
  it("follows the order of upstream's valid NF-e sample in every group both write", () => {
    const sampleOrder = readChildOrder(
      readFileSync(UPSTREAM_SAMPLE_PATH, "utf8").replace(/<\?xml[^>]*\?>/, ""),
    );
    const actualOrder = readChildOrder(
      writeGoldenXml("full-rate-goods-2027-nominal").replace(/<\?xml[^>]*\?>/, ""),
    );

    const expectedMismatches: string[] = [];
    const actualMismatches = ORDERED_PARENTS.filter((parent) => {
      const sampleChildren = sampleOrder.get(parent) ?? [];
      const shared = (actualOrder.get(parent) ?? []).filter((name) =>
        sampleChildren.includes(name),
      );
      const sampleShared = sampleChildren.filter((name) => shared.includes(name));
      return shared.join(",") !== sampleShared.join(",");
    });

    expect(actualMismatches).toStrictEqual(expectedMismatches);
  });

  it("closes each item with vItem and the totals with vNFTot, as the layout schema orders them", () => {
    const actualOrder = readChildOrder(
      writeGoldenXml("full-rate-goods-2027-nominal").replace(/<\?xml[^>]*\?>/, ""),
    );

    const expectedLast = ["vItem", "vNFTot"];
    const actualLast = [actualOrder.get("det")?.at(-1), actualOrder.get("total")?.at(-1)];

    expect(actualLast).toStrictEqual(expectedLast);
  });
});
