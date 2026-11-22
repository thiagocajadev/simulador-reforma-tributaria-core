import { describe, expect, it } from "vitest";
import { groupFormulaTokens, tokenizeFormula, tokenizeRawFormula } from "./formula.tokens.ts";

function describeTokens(formula: string) {
  const described = tokenizeFormula(formula).map((token) =>
    token.kind === "term" ? `[${token.text}]` : token.text,
  );
  return described;
}

describe("tokenizeFormula", () => {
  it("turns each value into a term and keeps the operators and brackets as symbols", () => {
    const expected = ["[0,90%]", "*", "(", "[1]", "−", "[60,00%]", ")"];
    const actual = describeTokens("0,90% * (1 − 60,00%)");

    expect(actual).toStrictEqual(expected);
  });

  it("keeps the brackets a term carries in its own name", () => {
    const expected = ["(", "[1]", "−", "[redutor de compra governamental (%)]", "÷", "[100]", ")"];
    const actual = describeTokens("(1 − redutor de compra governamental (%) ÷ 100)");

    expect(actual).toStrictEqual(expected);
  });

  it("reads money with its currency sign and an equals sign as a symbol", () => {
    const expected = ["[R$ 1.000,00]", "*", "[0,36%]", "=", "[R$ 3,60]"];
    const actual = describeTokens("R$ 1.000,00 * 0,36% = R$ 3,60");

    expect(actual).toStrictEqual(expected);
  });

  it("answers a single term for a formula without operators", () => {
    const expected = ["[tributoCalculado]"];
    const actual = describeTokens("tributoCalculado");

    expect(actual).toStrictEqual(expected);
  });
});

describe("tokenizeRawFormula", () => {
  it("splits the open data expression into names, numbers and its own operators", () => {
    const expected = [
      "[aliquota]",
      "*",
      "(",
      "[1]",
      "-",
      "[percentualReducao]",
      ")",
      "*",
      "(",
      "[1]",
      "-",
      "[pRedutorCompraGov]",
      "/",
      "[100]",
      ")",
    ];
    const actual = tokenizeRawFormula(
      "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
    ).map((token) => (token.kind === "term" ? `[${token.text}]` : token.text));

    expect(actual).toStrictEqual(expected);
  });
});

describe("groupFormulaTokens", () => {
  it("cuts a formula only at the operators outside every bracket", () => {
    const tokens = tokenizeFormula("8,80% * (1 − 60,00%) * (1 − 0 ÷ 100) = 3,52%");

    const expected = ["8,80%", "* ( 1 − 60,00% )", "* ( 1 − 0 ÷ 100 )", "= 3,52%"];
    const actual = groupFormulaTokens(tokens).map((group) =>
      group.map((token) => token.text).join(" "),
    );

    expect(actual).toStrictEqual(expected);
  });
});
