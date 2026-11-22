import { describe, expect, it } from "vitest";
import type { OperationItem, SelectiveTaxInput } from "./calculation.dto.ts";
import type { ItemFacts, SelectiveTaxFacts } from "./calculation.facts.ts";
import { checkSelectiveTaxRules } from "./selective.tax.validate.ts";

const CIGARETTES_RATES: SelectiveTaxFacts["rates"] = {
  adValorem: { percent: null },
  adRem: { amount: null, unit: "VN" },
};
const CALCULATED_CLASSIFICATION: SelectiveTaxFacts["classification"] = {
  cstCode: "000",
  treatment: {
    description: "Tributação pelo Imposto Seletivo - Com Cálculo",
    formulas: {
      base: "baseCalculoInformada",
      calculatedTax: "baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem",
      taxDue: "tributoCalculado",
    },
  },
};
const TYPED_GROUP: SelectiveTaxInput = {
  cstCode: "000",
  cClassTrib: "000001",
  adValoremRate: "13",
  adRemRate: "21.3",
  quantity: "10",
  unit: "VN",
};

function checkRule(input: {
  group?: SelectiveTaxInput;
  facts?: Partial<SelectiveTaxFacts>;
  date?: string;
  documentAcronym?: string | null;
}) {
  const operationItem: OperationItem = {
    itemNumber: 1,
    ncmCode: "24021000",
    cstCode: "000",
    cClassTrib: "000001",
    baseAmount: "2000.00",
    selectiveTax: input.group,
  };
  const selectiveTax: SelectiveTaxFacts = {
    isCstFound: true,
    classification: CALCULATED_CLASSIFICATION,
    rates: CIGARETTES_RATES,
    ...input.facts,
  };
  const violation = checkSelectiveTaxRules({
    item: operationItem,
    facts: { selectiveTax } as ItemFacts,
    date: input.date ?? "2027-03-10",
    documentAcronym: input.documentAcronym === undefined ? "NFE" : input.documentAcronym,
  });
  const rule = violation ? `${violation.ruleCode} ${violation.field ?? "item"}` : null;
  return rule;
}

describe("checkSelectiveTaxRules", () => {
  it("accepts a typed group on an NCM with the IS, on an NF-e and on no document", () => {
    const actualOnNfe = checkRule({ group: TYPED_GROUP });
    const actualWithoutDocument = checkRule({ group: TYPED_GROUP, documentAcronym: null });

    expect(actualOnNfe).toBeNull();
    expect(actualWithoutDocument).toBeNull();
  });

  it("asks for the group, then for a rate, where the open data has an IS row without value", () => {
    const withoutRates = { cstCode: "000", cClassTrib: "000001" };

    const expectedWithoutGroup = "REG-013 selectiveTax";
    const expectedWithoutRates = "REG-035 selectiveTax";
    const actualWithoutGroup = checkRule({});
    const actualWithoutRates = checkRule({ group: withoutRates });
    const actualBefore2027 = checkRule({ date: "2026-12-31" });
    const actualWithoutIncidence = checkRule({
      facts: { rates: { adValorem: null, adRem: null } },
    });

    expect(actualWithoutGroup).toBe(expectedWithoutGroup);
    expect(actualWithoutRates).toBe(expectedWithoutRates);
    expect(actualBefore2027).toBeNull();
    expect(actualWithoutIncidence).toBeNull();
  });

  it("refuses the IS group codes the open data does not hold for tribute 1", () => {
    const otherCst = { cstCode: "200", treatment: CALCULATED_CLASSIFICATION?.treatment ?? null };

    const expected = [
      "REG-004 selectiveTax.cstCode",
      "REG-005 selectiveTax.cClassTrib",
      "REG-006 selectiveTax.cClassTrib",
      "REG-008 selectiveTax.cClassTrib",
    ];
    const actual = [
      checkRule({ group: TYPED_GROUP, facts: { isCstFound: false } }),
      checkRule({ group: TYPED_GROUP, facts: { classification: null } }),
      checkRule({ group: TYPED_GROUP, facts: { classification: otherCst } }),
      checkRule({
        group: TYPED_GROUP,
        facts: { classification: { cstCode: "000", treatment: null } },
      }),
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("asks for the unit and a positive quantity of an ad rem rate", () => {
    const withoutUnit = { ...TYPED_GROUP, unit: undefined };
    const withoutQuantity = { ...TYPED_GROUP, quantity: undefined };
    const zeroQuantity = { ...TYPED_GROUP, quantity: "0.000" };
    const adValoremOnly = { ...TYPED_GROUP, adRemRate: undefined, quantity: undefined };

    const expected = ["REG-023 selectiveTax.unit", "REG-023 item", "REG-023 item", null];
    const actual = [withoutUnit, withoutQuantity, zeroQuantity, adValoremOnly].map((group) =>
      checkRule({ group }),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("refuses an IS rate on a document other than NF-e and NFC-e", () => {
    const expected = "REG-032 selectiveTax";
    const actualOnNfse = checkRule({ group: TYPED_GROUP, documentAcronym: "NFSE" });
    const actualOnNfce = checkRule({ group: TYPED_GROUP, documentAcronym: "NFCE" });

    expect(actualOnNfse).toBe(expected);
    expect(actualOnNfce).toBeNull();
  });

  it("takes an official rate from the open data when the visitor types none", () => {
    const officialRates: SelectiveTaxFacts["rates"] = {
      adValorem: { percent: "13" },
      adRem: null,
    };
    const withoutRates = { cstCode: "000", cClassTrib: "000001" };

    const actual = checkRule({ group: withoutRates, facts: { rates: officialRates } });
    const actualWithoutGroup = checkRule({ facts: { rates: officialRates } });
    const actualWithoutGroup2026 = checkRule({
      date: "2026-06-01",
      facts: { rates: officialRates },
    });

    expect(actual).toBeNull();
    expect(actualWithoutGroup).toBe("REG-013 selectiveTax");
    expect(actualWithoutGroup2026).toBe("REG-013 selectiveTax");
  });
});
