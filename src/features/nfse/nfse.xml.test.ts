import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CalculatedItem, ItemTaxes } from "@/features/calculations/calculation.dto.ts";
import {
  type CalculatedResponse,
  type ObservedResponse,
  toExpectedItems,
  toOperation,
  UNRECORDED_STEPS,
  type UpstreamOperation,
} from "@/features/calculations/calculation.fixture.ts";
import { checkXmlAgainstSchema } from "@/shared/xml/xml.schema.ts";
import { buildNfseDocument, type NfseInput } from "./nfse.document.ts";
import { writeNfseXml } from "./nfse.xml.ts";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");
const FIXTURE_CASE = "education-service-60pct-2026";
const SAMPLE_XML_PATH = path.join(REPOSITORY_ROOT, "fixtures/danfse/sample-nfse.xml");
const SAMPLE_SERVICE = {
  nationalTaxCode: "080101",
  nationalTaxDescription: "Ensino regular pré-escolar, fundamental, médio e superior.",
  indicatorCode: "030101",
  description:
    "Mensalidade escolar de março de 2026 (ensino fundamental). Documento fictício gerado para simulação.",
};

function readFixtureJson<Shape>(fileName: string) {
  const text = readFileSync(
    path.join(REPOSITORY_ROOT, "fixtures/regime-regular", fileName),
    "utf8",
  );
  const parsed = JSON.parse(text) as Shape;
  return parsed;
}

function buildSchoolInput() {
  const upstream = readFixtureJson<UpstreamOperation>(`${FIXTURE_CASE}.input.json`);
  const [expectedItem] = toExpectedItems({
    calculated: readFixtureJson<CalculatedResponse>(`${FIXTURE_CASE}.output.regime-geral.json`),
    observed: readFixtureJson<ObservedResponse>(`${FIXTURE_CASE}.output.observabilidade.json`),
  });
  const calculatedItem: CalculatedItem = {
    itemNumber: 1,
    status: "calculated",
    cstCode: "200",
    cClassTrib: "200028",
    treatmentDescription: "Alíquota reduzida em 60%",
    legalGround: null,
    selectiveTax: null,
    taxes: expectedItem?.taxes as ItemTaxes,
  };
  const input: NfseInput = {
    operation: toOperation(upstream),
    calculatedItem,
    municipalityName: "Porto Alegre",
    service: SAMPLE_SERVICE,
  };
  return input;
}

// why: compares structure and values, not the sample's comment or its indentation.
function normalizeXml(xml: string) {
  const normalized = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();
  return normalized;
}

function extractAll(xml: string, pattern: RegExp) {
  const matches = [...normalizeXml(xml).matchAll(pattern)].map((match) => match[0]);
  return matches;
}

describe("writeNfseXml", () => {
  const sampleXml = readFileSync(SAMPLE_XML_PATH, "utf8");
  const actualXml = writeNfseXml(buildNfseDocument(buildSchoolInput()));

  it("passes the official NFS-e XSD the upstream ships", async () => {
    const expected = { isValid: true };
    const actual = await checkXmlAgainstSchema({ xml: actualXml, kind: "nfse" });

    expect(actual).toStrictEqual(expected);
  });

  // why: the sample's <uf> under the note's IBSCBS is not in the v1.01 XSD the upstream ships, nor
  // in its valid sample nfse_valido_com_IBSCBS.xml, so the writer leaves it out (docs/nfse.md, XML).
  it("writes both IBSCBS groups as the DANFSe sample, value by value, without its extra uf", () => {
    const ibsCbsGroup = /<IBSCBS>.*?<\/IBSCBS>/g;
    const sampleWithoutUf = sampleXml.replace(
      /<\/xLocalidadeIncid>\s*<uf>[A-Z]{2}<\/uf>/,
      "</xLocalidadeIncid>",
    );

    const expectedGroups = extractAll(sampleWithoutUf, ibsCbsGroup);
    const actualGroups = extractAll(actualXml, ibsCbsGroup);

    expect(actualGroups).toHaveLength(2);
    expect(actualGroups).toStrictEqual(expectedGroups);
  });

  it("matches the sample's keys, service codes and amounts", () => {
    const keyElements =
      /<(?:infNFSe|infDPS) Id="[^"]+">|<(?:cTribNac|cNBS|xTribNac|vServ|vBC|vLiq|dCompet|dhEmi|tpAmb|ambGer)>[^<]*<\/[^>]+>/g;

    const expectedElements = extractAll(sampleXml, keyElements).filter(
      (text) => !text.startsWith("<xTribNac>"),
    );
    const actualElements = extractAll(actualXml, keyElements).filter(
      (text) => !text.startsWith("<xTribNac>"),
    );

    expect(actualElements).toStrictEqual(expectedElements);
  });

  it("starts with the XML declaration and the national NFS-e namespace", () => {
    const expectedStart =
      '<?xml version="1.0" encoding="UTF-8"?>\n<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">';
    const actualStart = actualXml.slice(0, expectedStart.length);

    expect(actualStart).toBe(expectedStart);
  });

  it("escapes markup characters typed in the service description", () => {
    const input = buildSchoolInput();
    const typedInput: NfseInput = {
      ...input,
      service: { ...input.service, description: 'Aula "extra" <online> & material' },
    };

    const expectedDescription =
      "<xDescServ>Aula &quot;extra&quot; &lt;online&gt; &amp; material</xDescServ>";
    const actualXmlWithMarkup = writeNfseXml(buildNfseDocument(typedInput));

    expect(actualXmlWithMarkup).toContain(expectedDescription);
  });

  it("leaves out the reduction and uses the rate as effective rate without the reduction group", () => {
    const input = buildSchoolInput();
    const taxes = input.calculatedItem.taxes as ItemTaxes;
    const fullRate = {
      ...UNRECORDED_STEPS,
      rate: "0.90",
      reductionPercent: null,
      effectiveRate: null,
      amount: "10.80",
    };
    const fullRateInput: NfseInput = {
      ...input,
      calculatedItem: {
        ...input.calculatedItem,
        cstCode: "000",
        cClassTrib: "000001",
        taxes: { ...taxes, cbs: fullRate },
      },
    };

    const expectedFed = "<fed><pCBS>0.90</pCBS><pAliqEfetCBS>0.90</pAliqEfetCBS></fed>";
    const actualFed = extractAll(
      writeNfseXml(buildNfseDocument(fullRateInput)),
      /<fed>.*?<\/fed>/g,
    );

    expect(actualFed).toStrictEqual([expectedFed]);
  });
});
