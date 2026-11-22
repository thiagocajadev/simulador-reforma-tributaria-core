import { describe, expect, it } from "vitest";
import { type Decimal, formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";
import {
  calculateFormula,
  type FormulaValues,
  listFormulaVariables,
  parseFormula,
} from "./formula.evaluate.ts";

const PLAIN = { minPlaces: 0, maxPlaces: 40 };

function formatPlain(value: Decimal) {
  const text = formatDecimal(value, PLAIN);
  return text;
}

function calculatePlain(formula: string, values: FormulaValues = {}) {
  const text = formatPlain(calculateFormula(formula, values));
  return text;
}

describe("calculateFormula", () => {
  it("computes the most common effective rate formula exactly", () => {
    const formula = "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)";
    const values = {
      aliquota: parseDecimal("0.088123"),
      percentualReducao: parseDecimal("0.6"),
    };

    const expected = "0.0352492";
    const actual = calculatePlain(formula, values);

    expect(actual).toBe(expected);
  });

  it("counts a variable without a value as zero", () => {
    const formula = "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado";
    const values = { baseCalculoInformada: parseDecimal("1200.00") };

    const expected = "1200";
    const actual = calculatePlain(formula, values);

    expect(actual).toBe(expected);
  });

  it("follows arithmetic precedence and left associativity", () => {
    const formulas = ["1+2*3", "(1+2)*3", "10-4-3", "8/4/2", "-2*3+1", "1-100/100"];

    const expected = ["7", "9", "3", "1", "-5", "0"];
    const actual = formulas.map((formula) => calculatePlain(formula));

    expect(actual).toStrictEqual(expected);
  });

  it("divides with 34 significant digits", () => {
    const formula = "(pBio/(1-pBio))";
    const values = { pBio: parseDecimal("0.25") };

    const expected = `0.${"3".repeat(34)}`;
    const actual = calculatePlain(formula, values);

    expect(actual).toBe(expected);
  });

  it("ignores whitespace around tokens", () => {
    const formula = " baseCalculo * aliquotaEfetiva ";
    const values = { baseCalculo: parseDecimal("25.00"), aliquotaEfetiva: parseDecimal("0.001") };

    const expected = "0.025";
    const actual = calculatePlain(formula, values);

    expect(actual).toBe(expected);
  });
});

describe("parseFormula", () => {
  it("refuses names outside the 17 known variables", () => {
    const formula = "aliquota*desconto";

    const expectedMessage = 'Unknown variable "desconto"';
    const actualParse = () => parseFormula(formula);

    expect(actualParse).toThrow(expectedMessage);
  });

  it("refuses malformed formulas", () => {
    const formulas = ["(aliquota", "aliquota)", "aliquota*", "", "aliquota % 2", "2 3"];

    const expectedRefusals = formulas.length;
    const actualRefusals = formulas.filter(isRefused).length;

    expect(actualRefusals).toBe(expectedRefusals);
  });
});

describe("listFormulaVariables", () => {
  it("lists each variable once, in reading order, through groups and negation", () => {
    const formula = "-(1-pBio)*aliquotaAdRemPrincipal+pBio*aliquotaAdRemSecundaria";

    const expected = ["pBio", "aliquotaAdRemPrincipal", "aliquotaAdRemSecundaria"];
    const actual = listFormulaVariables(formula);

    expect(actual).toStrictEqual(expected);
  });

  it("lists nothing for a literal", () => {
    const formula = "0";

    const expected: string[] = [];
    const actual = listFormulaVariables(formula);

    expect(actual).toStrictEqual(expected);
  });
});

function isRefused(formula: string) {
  try {
    parseFormula(formula);
  } catch {
    return true;
  }

  return false;
}
