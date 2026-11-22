import fileSystem from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VALIDATION_CASES } from "./validation.cases.ts";

const FIXTURES = path.resolve(import.meta.dirname, "..", "..", "..", "fixtures");

function countCases(directory: string) {
  const manifest = JSON.parse(
    fileSystem.readFileSync(path.join(FIXTURES, directory, "manifest.json"), "utf8"),
  ) as { cases: Record<string, unknown> };
  const caseCount = Object.keys(manifest.cases).length;
  return caseCount;
}

describe("VALIDATION_CASES", () => {
  it("matches the golden fixtures the engine is tested against", () => {
    const expected = {
      regularRegime: countCases("regime-regular"),
      simplesGoods: countCases("simples-nacional"),
      simplesServices: countCases("simples-nacional-nfse"),
    };
    const actual = {
      regularRegime: VALIDATION_CASES.regularRegime,
      simplesGoods: VALIDATION_CASES.simplesGoods,
      simplesServices: VALIDATION_CASES.simplesServices,
    };

    expect(actual).toStrictEqual(expected);
  });
});
