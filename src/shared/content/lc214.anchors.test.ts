import { describe, expect, it } from "vitest";
import { linkLegalGround } from "./lc214.anchors.ts";

const LAW = "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm";

describe("linkLegalGround", () => {
  it("links an article to its anchor in the compiled law", () => {
    const references = ["Art. 9º, VII", "Art. 129", "Arts. 99 e 100", "Art 28, parágrafos 3° e 4°"];

    const expected = [`${LAW}#art9`, `${LAW}#art129`, `${LAW}#art99`, `${LAW}#art28.0`];
    const actual = references.map(linkLegalGround);

    expect(actual).toStrictEqual(expected);
  });

  it("opens the law at the top for an article the page does not anchor", () => {
    const references = ["Art. 409, § 2º", "Art. 412, I", "Art. 270"];

    const expected = [LAW, LAW, LAW];
    const actual = references.map(linkLegalGround);

    expect(actual).toStrictEqual(expected);
  });

  it("opens the law at the top when the reference names no article", () => {
    const references = ["LC 214/2025", "", "Art. 999"];

    const expected = [LAW, LAW, LAW];
    const actual = references.map(linkLegalGround);

    expect(actual).toStrictEqual(expected);
  });
});
