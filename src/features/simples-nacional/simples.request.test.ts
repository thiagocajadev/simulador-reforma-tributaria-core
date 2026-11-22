import { describe, expect, it } from "vitest";
import { MAX_ITEMS } from "@/features/calculations/calculation.request.ts";
import { parseSimplesOperation } from "./simples.request.ts";

const VALID_ITEM = {
  itemNumber: 1,
  activityCode: "01",
  cClassTrib: "000001",
  ncmCode: "22030000",
  baseAmount: "1000.00",
  selectiveTaxAmount: "0.00",
  cbsSimplesRate: "2.3591",
  ibsSimplesRate: "0.0260",
};

const VALID_BODY = {
  taxEventDate: "2027-03-10",
  documentType: 55,
  crt: 1,
  items: [VALID_ITEM],
};

function listInvalidFields(body: unknown) {
  const parsed = parseSimplesOperation(body);
  const fields = parsed.isValid ? [] : parsed.issues.map((issue) => issue.field);
  return fields;
}

describe("parseSimplesOperation", () => {
  it("reads a valid body into an operation", () => {
    const body = VALID_BODY;

    const expected = {
      isValid: true,
      operation: {
        ...VALID_BODY,
        ibsCbsRegime: undefined,
        simplesOption: undefined,
        ibsCbsAssessmentRegime: undefined,
        simplesTaxesAssessmentRegime: undefined,
        governmentEntity: undefined,
        effectiveRates: undefined,
        items: [
          {
            ...VALID_ITEM,
            nbsCode: undefined,
            issTaxation: undefined,
            issWithholding: undefined,
            municipalBenefit: undefined,
          },
        ],
      },
    };
    const actual = parseSimplesOperation(body);

    expect(actual).toStrictEqual(expected);
  });

  it("reads the optional operation codes", () => {
    const body = { ...VALID_BODY, crt: 3, ibsCbsRegime: 2, governmentEntity: 4 };

    const expected = { crt: 3, ibsCbsRegime: 2, governmentEntity: 4 };
    const parsed = parseSimplesOperation(body);
    const actual = parsed.isValid
      ? {
          crt: parsed.operation.crt,
          ibsCbsRegime: parsed.operation.ibsCbsRegime,
          governmentEntity: parsed.operation.governmentEntity,
        }
      : null;

    expect(actual).toStrictEqual(expected);
  });

  it("leaves item values for the item rules, blank ones as not sent", () => {
    const looseItem = {
      ...VALID_ITEM,
      cbsSimplesRate: "2,5",
      ibsSimplesRate: " ",
      baseAmount: "-1",
    };
    const body = { ...VALID_BODY, items: [looseItem] };

    const expected = { cbsSimplesRate: "2,5", ibsSimplesRate: undefined, baseAmount: "-1" };
    const parsed = parseSimplesOperation(body);
    const parsedItem = parsed.isValid ? parsed.operation.items[0] : undefined;
    const actual = {
      cbsSimplesRate: parsedItem?.cbsSimplesRate,
      ibsSimplesRate: parsedItem?.ibsSimplesRate,
      baseAmount: parsedItem?.baseAmount,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("lists every invalid field at once", () => {
    const body = {
      taxEventDate: "2027-02-30",
      documentType: "5",
      crt: 5,
      ibsCbsRegime: 3,
      governmentEntity: "2",
      items: [{ itemNumber: 0, cClassTrib: 1, cbsSimplesRate: 2.5 }, "item"],
    };

    const expected = [
      "taxEventDate",
      "documentType",
      "crt",
      "ibsCbsRegime",
      "governmentEntity",
      "items[0].cClassTrib",
      "items[0].cbsSimplesRate",
      "items[0].itemNumber",
      "items[1]",
    ];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("reads the NFS-e regime fields, the rate line and the ISS codes", () => {
    const body = {
      taxEventDate: "2027-03-10",
      documentType: 91,
      simplesOption: 3,
      ibsCbsAssessmentRegime: 2,
      simplesTaxesAssessmentRegime: 3,
      effectiveRates: {
        isFatorRAtLeast28: true,
        isSublimitExceeded: false,
        annexI: { cbsSimplesRate: "1.1612", ibsSimplesRate: " " },
        annexV: {
          cbsSimplesRate: "2.7210",
          withoutIssRedistribution: { cbsSimplesRate: "2.4448" },
        },
      },
      items: [{ itemNumber: 1, cClassTrib: "000001", baseAmount: "10.00", issTaxation: 1 }],
    };

    const expected = {
      simplesOption: 3,
      ibsCbsAssessmentRegime: 2,
      simplesTaxesAssessmentRegime: 3,
      isFatorRAtLeast28: true,
      annexI: { cbsSimplesRate: "1.1612", ibsSimplesRate: undefined },
      annexVWithout: { cbsSimplesRate: "2.4448", ibsSimplesRate: undefined },
      issTaxation: 1,
    };
    const parsed = parseSimplesOperation(body);
    const operation = parsed.isValid ? parsed.operation : undefined;
    const actual = {
      simplesOption: operation?.simplesOption,
      ibsCbsAssessmentRegime: operation?.ibsCbsAssessmentRegime,
      simplesTaxesAssessmentRegime: operation?.simplesTaxesAssessmentRegime,
      isFatorRAtLeast28: operation?.effectiveRates?.isFatorRAtLeast28,
      annexI: operation?.effectiveRates?.annexI,
      annexVWithout: operation?.effectiveRates?.annexV?.withoutIssRedistribution,
      issTaxation: operation?.items[0]?.issTaxation,
    };

    expect(actual).toStrictEqual(expected);
  });

  it("lists every invalid NFS-e field at once", () => {
    const body = {
      taxEventDate: "2027-03-10",
      documentType: 91,
      simplesOption: 5,
      ibsCbsAssessmentRegime: 0,
      effectiveRates: {
        isFatorRAtLeast28: "yes",
        annexIII: "2.38",
        annexIV: { cbsSimplesRate: 2 },
      },
      items: [{ itemNumber: 1, cClassTrib: "000001", baseAmount: "10.00", issWithholding: "2" }],
    };

    const expected = [
      "simplesOption",
      "ibsCbsAssessmentRegime",
      "effectiveRates.annexIII",
      "effectiveRates.annexIV.cbsSimplesRate",
      "effectiveRates.isFatorRAtLeast28",
      "items[0].issWithholding",
    ];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("refuses a date with a time, as upstream takes a plain date", () => {
    const body = { ...VALID_BODY, taxEventDate: "2027-03-10T10:00:00-03:00" };

    const expected = ["taxEventDate"];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("refuses an empty list and more items than the limit", () => {
    const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_entry, position) => ({
      ...VALID_ITEM,
      itemNumber: position + 1,
    }));

    const expected = ["items"];
    const actualEmpty = listInvalidFields({ ...VALID_BODY, items: [] });
    const actualTooMany = listInvalidFields({ ...VALID_BODY, items: tooMany });

    expect(actualEmpty).toStrictEqual(expected);
    expect(actualTooMany).toStrictEqual(expected);
  });

  it("refuses a body that is not an object", () => {
    const body = [VALID_BODY];

    const expected = ["body"];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });
});
