import { describe, expect, it } from "vitest";
import { encodeCode128C } from "./code128.ts";

describe("encodeCode128C", () => {
  it("computes the check symbol 48 for 09758364, the example of MOC 7.0 Anexo II, 2.1", () => {
    const expectedCheckValue = 48;
    const actualCheckValue = encodeCode128C("09758364").checkValue;

    expect(actualCheckValue).toBe(expectedCheckValue);
  });

  it("draws Start C, the four pairs, the check symbol and Stop with the widths of Anexo III.01", () => {
    const expectedPatterns = [
      "211232",
      "221213",
      "241211",
      "114212",
      "111422",
      "313121",
      "2331112",
    ];
    const expectedWidths = [...expectedPatterns.join("")].map(Number);
    const actualWidths = encodeCode128C("09758364").widths;

    expect(actualWidths).toStrictEqual(expectedWidths);
  });

  it("spans 277 modules for a 44-digit access key, without the quiet zones", () => {
    const accessKey = "43270312345678000195550010000000011123456780";

    const expectedModules = 11 + 22 * 11 + 11 + 13;
    const actualModules = encodeCode128C(accessKey).moduleCount;

    expect(actualModules).toBe(expectedModules);
  });

  it("refuses an odd count of digits or any other character", () => {
    const expectedMessage = /even count of digits/;
    const actualOdd = () => encodeCode128C("123");
    const actualLetters = () => encodeCode128C("NF12");

    expect(actualOdd).toThrow(expectedMessage);
    expect(actualLetters).toThrow(expectedMessage);
  });
});
