import { describe, expect, it } from "vitest";
import type { SelectiveTaxIncidence } from "@/features/ncm/ncm.dto.ts";
import { findDemoOperation } from "./demo.operations.ts";
import { checkDraft, type OperationDraft, toFieldErrors } from "./operation.draft.ts";
import {
  checkSelectiveTaxDraft,
  createSelectiveTaxDraft,
  findSelectiveTaxIncidence,
} from "./selective.tax.draft.ts";

const NO_OFFICIAL_RATES = { adValorem: null, adRem: null };
const BOTH_RATES: SelectiveTaxIncidence = {
  hasAdValorem: true,
  adRemUnit: { code: "VN", description: "Vintena de cigarro" },
  officialRates: NO_OFFICIAL_RATES,
};
const AD_VALOREM_ONLY: SelectiveTaxIncidence = {
  hasAdValorem: true,
  adRemUnit: null,
  officialRates: NO_OFFICIAL_RATES,
};

function readCigarsDraft() {
  const demo = findDemoOperation("cigars");

  if (!demo) {
    throw new Error("The cigars demo is missing");
  }

  return demo.draft;
}

describe("checkSelectiveTaxDraft", () => {
  it("reads the typed rates, quantity and unit into the item's IS group", () => {
    const draft = {
      ...createSelectiveTaxDraft(BOTH_RATES),
      adValoremRate: "13",
      adRemRate: "21,30",
      quantity: "2,5",
      unit: "vn",
    };

    const expected = {
      isValid: true,
      selectiveTax: {
        cstCode: "000",
        cClassTrib: "000001",
        adValoremRate: "13",
        adRemRate: "21.30",
        quantity: "2.5",
        unit: "VN",
      },
    };
    const actual = checkSelectiveTaxDraft(draft, BOTH_RATES);

    expect(actual).toStrictEqual(expected);
  });

  it("asks for a rate, and for the quantity and unit of an ad rem rate", () => {
    const empty = createSelectiveTaxDraft(BOTH_RATES);
    const adRemWithoutQuantity = { ...empty, adRemRate: "21,30", unit: "" };

    const expectedEmpty = { adValoremRate: "Informe a alíquota ad valorem, a ad rem ou as duas." };
    const expectedAdRem = ["quantity", "unit"];
    const actualEmpty = checkSelectiveTaxDraft(empty, BOTH_RATES);
    const actualAdRem = checkSelectiveTaxDraft(adRemWithoutQuantity, BOTH_RATES);

    expect(actualEmpty.isValid ? null : actualEmpty.errors).toStrictEqual(expectedEmpty);
    expect(actualAdRem.isValid ? [] : Object.keys(actualAdRem.errors)).toStrictEqual(expectedAdRem);
  });

  it("needs the ad valorem rate where the NCM has no ad rem one, and ignores its fields", () => {
    const typed = { ...createSelectiveTaxDraft(AD_VALOREM_ONLY), adRemRate: "abc" };

    const expectedErrors = { adValoremRate: "Informe a alíquota ad valorem." };
    const actual = checkSelectiveTaxDraft(typed, AD_VALOREM_ONLY);

    expect(actual.isValid ? null : actual.errors).toStrictEqual(expectedErrors);
  });

  it("takes a blank rate once the open data holds the official one, still asking the quantity", () => {
    const officialBoth: SelectiveTaxIncidence = {
      ...BOTH_RATES,
      officialRates: { adValorem: "13.5", adRem: "21.3" },
    };
    const blank = createSelectiveTaxDraft(officialBoth);
    const withQuantity = { ...blank, quantity: "10" };

    const expectedBlank = {
      quantity: "Informe uma quantidade maior que zero, com até 4 casas decimais. Exemplo: 10.",
    };
    const expectedWithQuantity = {
      isValid: true,
      selectiveTax: { cstCode: "000", cClassTrib: "000001", quantity: "10", unit: "VN" },
    };
    const actualBlank = checkSelectiveTaxDraft(blank, officialBoth);
    const actualWithQuantity = checkSelectiveTaxDraft(withQuantity, officialBoth);

    expect(actualBlank.isValid ? null : actualBlank.errors).toStrictEqual(expectedBlank);
    expect(actualWithQuantity).toStrictEqual(expectedWithQuantity);
  });

  it("takes a blank ad valorem rate with an official one, and leaves the ad rem fields out", () => {
    const officialAdValorem: SelectiveTaxIncidence = {
      ...AD_VALOREM_ONLY,
      officialRates: { adValorem: "4.2", adRem: null },
    };

    const expected = { isValid: true, selectiveTax: { cstCode: "000", cClassTrib: "000001" } };
    const actual = checkSelectiveTaxDraft(
      createSelectiveTaxDraft(officialAdValorem),
      officialAdValorem,
    );

    expect(actual).toStrictEqual(expected);
  });
});

describe("findSelectiveTaxIncidence", () => {
  it("shows the block only from 2027, on an NCM document, for an NCM with the IS", () => {
    const draft = readCigarsDraft();
    const itemDraft = draft.operationItems[0];

    if (!itemDraft) {
      throw new Error("The cigars demo has no item");
    }

    const before2027: OperationDraft = { ...draft, taxEventDate: "2026-12-31" };
    const onNfse: OperationDraft = { ...draft, documentKind: "nfse" };

    const expected = BOTH_RATES;
    const actual = findSelectiveTaxIncidence(draft, itemDraft);
    const actualBefore2027 = findSelectiveTaxIncidence(before2027, itemDraft);
    const actualOnNfse = findSelectiveTaxIncidence(onNfse, itemDraft);

    expect(actual).toStrictEqual(expected);
    expect(actualBefore2027).toBeNull();
    expect(actualOnNfse).toBeNull();
  });
});

describe("the operation draft with an IS block", () => {
  it("sends the IS group of the cigars demo, and none once the date leaves 2027", () => {
    const draft = readCigarsDraft();

    const expected = {
      cstCode: "000",
      cClassTrib: "000001",
      adValoremRate: "13",
      adRemRate: "21.30",
      quantity: "10",
      unit: "VN",
    };
    const check = checkDraft(draft);
    const actual = check.isValid ? check.operation.items[0]?.selectiveTax : null;
    const before2027 = checkDraft({ ...draft, taxEventDate: "2026-12-31" });
    const actualBefore2027 = before2027.isValid
      ? before2027.operation.items[0]?.selectiveTax
      : "invalid";

    expect(actual).toStrictEqual(expected);
    expect(actualBefore2027).toBeUndefined();
  });

  it("puts an API error on the IS field it names", () => {
    const issues = [
      { field: "items[0].selectiveTax.quantity", message: "Must be a decimal string" },
      { field: "items[1].selectiveTax.cClassTrib", message: "Must be 6 digits" },
    ];

    const expected = ["items.0.selectiveTax.quantity", "items.1.selectiveTax.classification"];
    const actual = Object.keys(toFieldErrors(issues));

    expect(actual).toStrictEqual(expected);
  });
});
