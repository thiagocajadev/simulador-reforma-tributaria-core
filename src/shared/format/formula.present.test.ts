import { describe, expect, it } from "vitest";
import { presentStep } from "./formula.present.ts";

describe("presentStep", () => {
  it("leaves out the written formula when it is one variable that only repeats the result", () => {
    const step = {
      step: "taxDue" as const,
      formula: "tributoCalculado",
      values: { tributoCalculado: "4.32" },
      result: "4.32",
    };

    const expected = {
      plainFormula: null,
      substitutedFormula: null,
      rawFormula: "tributoCalculado",
    };
    const view = presentStep(step, { origin: null, regime: "regular" });
    const actual = {
      plainFormula: view.plainFormula,
      substitutedFormula: view.substitutedFormula,
      rawFormula: view.rawFormula,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("writes the effective rate formula in words and with the values it used", () => {
    const step = {
      step: "effectiveRate" as const,
      formula: "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
      values: { aliquota: "0.009", percentualReducao: "0.6", pRedutorCompraGov: "0" },
      result: "0.0036",
    };

    const expected = {
      title: "Alíquota efetiva",
      plainFormula: "alíquota * (1 − redução) * (1 − redutor de compra governamental (%) ÷ 100)",
      substitutedFormula: "0,90% * (1 − 60,00%) * (1 − 0 ÷ 100)",
      rawFormula: "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
      result: "0,36%",
      note: "Publicada com até 4 casas decimais; é ela que multiplica a base.",
      origin: null,
    };
    const actual = presentStep(step, { origin: null, regime: "regular" });

    expect(actual).toStrictEqual(expected);
  });

  it("writes money in reais and keeps the rounding note", () => {
    const step = {
      step: "calculatedTax" as const,
      formula: "baseCalculo*aliquotaEfetiva",
      values: { baseCalculo: "1200", aliquotaEfetiva: "0.0036" },
      result: "4.32",
    };

    const expectedSubstituted = "R$ 1.200,00 * 0,36%";
    const expectedResult = "R$ 4,32";
    const actual = presentStep(step, { origin: null, regime: "regular" });

    expect(actual.substitutedFormula).toBe(expectedSubstituted);
    expect(actual.result).toBe(expectedResult);
  });

  it("tells the NFS-e layout rounding of a Simples rate, and never the regular 4-place rule", () => {
    const rounded = {
      step: "rate" as const,
      formula: null,
      values: {},
      result: "0.0239",
      roundedToPlaces: 2,
    };
    const shifted = {
      step: "rate" as const,
      formula: "aliquotaCbs+aliquotaIbs",
      values: { aliquotaCbs: "0.023591", aliquotaIbs: "0.00026" },
      result: "0.023851",
    };

    const expectedNotes = ["Arredondada para 2 casas decimais, como a NFS-e imprime.", null];
    const actualNotes = [rounded, shifted].map(
      (step) => presentStep(step, { origin: null, regime: "simples" }).note,
    );

    expect(actualNotes).toStrictEqual(expectedNotes);
  });

  it("explains a rate no formula produced by its origin", () => {
    const step = { step: "rate" as const, formula: null, values: {}, result: "0.088" };
    const origin = "Informada por você";

    const expected = {
      title: "Alíquota",
      plainFormula: null,
      substitutedFormula: null,
      rawFormula: null,
      result: "8,80%",
      note: null,
      origin,
    };
    const actual = presentStep(step, { origin, regime: "regular" });

    expect(actual).toStrictEqual(expected);
  });
});
