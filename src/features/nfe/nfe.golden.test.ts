import { describe, expect, it } from "vitest";
import { writeXmlDocument, type XmlNode, xmlNode } from "@/shared/xml/xml.write.ts";
import { buildNfeDocument } from "./nfe.document.ts";
import { NFE_GOLDEN_CASES, readNfeGoldenCase } from "./nfe.fixture.ts";
import { writeNfeXml } from "./nfe.xml.ts";

// why: the calculator's narrative and the monophasic totals are not part of the simulated note;
// pISEspec is the deprecated name of adRemIS, which the Sefaz schema refuses.
const LEFT_OUT_KEYS = new Set(["memoriaCalculo", "gMono", "pISEspec"]);

// why: upstream's own XML generator maps these same response fields to the NF-e groups in this order.
function toUpstreamXml(name: string, value: unknown): XmlNode {
  if (typeof value !== "object" || value === null) {
    const leaf = xmlNode(name, String(value));
    return leaf;
  }

  const children = Object.entries(value)
    .filter(([key]) => !LEFT_OUT_KEYS.has(key))
    .map(([key, child]) => toUpstreamXml(key, child));
  const branch = xmlNode(name, children);
  return branch;
}

function compactXml(xml: string) {
  const compact = xml
    .replace(/<\?xml[^>]*\?>/, "")
    .replace(/>\s+</g, "><")
    .trim();
  return compact;
}

function extractGroups(xml: string, name: string) {
  const pattern = new RegExp(`<${name}>.*?</${name}>`, "g");
  const groups = [...compactXml(xml).matchAll(pattern)].map((match) => match[0]);
  return groups;
}

describe.each(NFE_GOLDEN_CASES)("writeNfeXml on the golden case %s", (caseName) => {
  const { input, calculated } = readNfeGoldenCase(caseName);
  const actualXml = writeNfeXml(buildNfeDocument(input));

  it("writes each item's IBSCBS group as the upstream calculator published it", () => {
    const expectedGroups = calculated.body.objetos.map((object) =>
      compactXml(writeXmlDocument(toUpstreamXml("IBSCBS", object.tribCalc.IBSCBS))),
    );
    const actualGroups = extractGroups(actualXml, "IBSCBS");

    expect(actualGroups).toStrictEqual(expectedGroups);
  });

  it("writes each item's IS group, and ISTot, as the upstream calculator published them", () => {
    const expectedGroups = calculated.body.objetos.flatMap((object) =>
      object.tribCalc.IS
        ? [compactXml(writeXmlDocument(toUpstreamXml("IS", object.tribCalc.IS)))]
        : [],
    );
    const selectiveTaxTotal = calculated.body.total.tribCalc.ISTot;
    const expectedTotals = selectiveTaxTotal
      ? [compactXml(writeXmlDocument(toUpstreamXml("ISTot", selectiveTaxTotal)))]
      : [];
    const actualGroups = extractGroups(actualXml, "IS");
    const actualTotals = extractGroups(actualXml, "ISTot");

    expect(actualGroups).toStrictEqual(expectedGroups);
    expect(actualTotals).toStrictEqual(expectedTotals);
  });

  it("writes the IBSCBSTot totals as the upstream calculator published them", () => {
    const expectedTotals = [
      compactXml(
        writeXmlDocument(toUpstreamXml("IBSCBSTot", calculated.body.total.tribCalc.IBSCBSTot)),
      ),
    ];
    const actualTotals = extractGroups(actualXml, "IBSCBSTot");

    expect(actualTotals).toStrictEqual(expectedTotals);
  });
});
