import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/shared/math/decimal.ts";
import type { IssSituationFacts, SimplesActivityFacts } from "./simples.facts.ts";
import { chooseRatePair, type EffectiveRateLine } from "./simples.pair.choose.ts";

const SERVICE_ACTIVITY: SimplesActivityFacts = {
  code: "07",
  isNonTaxable: false,
  isAllowedOnDocument: true,
  annexWithoutFatorR: "III",
  annexWithFatorR: null,
  hasIssInSimples: true,
  allowsMunicipalBenefit: false,
};

const RATE_LINE: EffectiveRateLine = {
  isFatorRAtLeast28: null,
  isSublimitExceeded: false,
  annexes: {
    III: {
      pair: { cbsRate: parseDecimal("2.3874"), ibsRate: parseDecimal("0.0263") },
      withoutIssRedistribution: {
        cbsRate: parseDecimal("2.1012"),
        ibsRate: parseDecimal("0.0231"),
      },
    },
  },
};

const WITHHELD_BY_BUYER: IssSituationFacts = {
  field: "issWithholding",
  value: 2,
  rule: "ISS_RETIDO",
  pairType: "SEM_REDISTRIBUICAO",
};

describe("chooseRatePair", () => {
  it("takes the pair without redistribution when the ISS is withheld", () => {
    const input = {
      activity: SERVICE_ACTIVITY,
      rateLine: RATE_LINE,
      facts: { issTaxation: 1, issWithholding: 2 },
      situations: [WITHHELD_BY_BUYER],
    };

    const expected = { rule: "ISS_RETIDO", path: "annexIII.withoutIssRedistribution" };
    const choice = chooseRatePair(input);
    const actual = choice.kind === "chosen" ? { rule: choice.rule, path: choice.path } : choice;

    expect(actual).toStrictEqual(expected);
  });

  it("stops at the first matching situation, even one that keeps the pair with redistribution", () => {
    const keepingSituation: IssSituationFacts = {
      ...WITHHELD_BY_BUYER,
      rule: "ISS_NAO_INCIDE",
      field: "issTaxation",
      value: 1,
      pairType: "COM_REDISTRIBUICAO",
    };
    const input = {
      activity: SERVICE_ACTIVITY,
      rateLine: RATE_LINE,
      facts: { issTaxation: 1, issWithholding: 2 },
      situations: [keepingSituation, WITHHELD_BY_BUYER],
    };

    const expected = { rule: "ISS_NAO_INCIDE", path: "annexIII" };
    const choice = chooseRatePair(input);
    const actual = choice.kind === "chosen" ? { rule: choice.rule, path: choice.path } : choice;

    expect(actual).toStrictEqual(expected);
  });

  it("answers a zero pair for the non-taxable activity and none for one the document refuses", () => {
    const nonTaxable = { ...SERVICE_ACTIVITY, annexWithoutFatorR: null };
    const refused = { ...SERVICE_ACTIVITY, isAllowedOnDocument: false };
    const shared = { rateLine: RATE_LINE, facts: {}, situations: [] };

    const expected = ["zero", "notAllowed"];
    const actual = [
      chooseRatePair({ ...shared, activity: nonTaxable }).kind,
      chooseRatePair({ ...shared, activity: refused }).kind,
    ];

    expect(actual).toStrictEqual(expected);
  });
});
