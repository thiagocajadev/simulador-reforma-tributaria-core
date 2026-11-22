import { describe, expect, it } from "vitest";
import { checkXmlAgainstSchema } from "./xml.schema.ts";

const NOTE_WITHOUT_SIGNATURE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">',
  "  <infNFe/>",
  "</NFe>",
].join("\n");

describe("checkXmlAgainstSchema", () => {
  it("names the line and the reason when the XML breaks the schema", async () => {
    const check = await checkXmlAgainstSchema({ xml: NOTE_WITHOUT_SIGNATURE, kind: "nfe" });

    const expectedFirstLine = 3;
    const actualFirstLine = check.isValid ? null : check.errors[0]?.lineNumber;
    const actualMentionsInfNfe = check.isValid
      ? false
      : check.errors[0]?.message.includes("infNFe");

    expect(check.isValid).toBe(false);
    expect(actualFirstLine).toBe(expectedFirstLine);
    expect(actualMentionsInfNfe).toBe(true);
  });

  it("reports XML that is not well formed instead of throwing", async () => {
    const check = await checkXmlAgainstSchema({ xml: "<NFe><infNFe></NFe>", kind: "nfe" });

    const expected = { isValid: false, hasErrors: true };
    const actual = { isValid: check.isValid, hasErrors: !check.isValid && check.errors.length > 0 };

    expect(actual).toStrictEqual(expected);
  });
});
