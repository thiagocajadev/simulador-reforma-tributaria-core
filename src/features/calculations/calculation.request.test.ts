import { describe, expect, it } from "vitest";
import { MAX_ITEMS, parseOperation } from "./calculation.request.ts";

const VALID_ITEM = {
  itemNumber: 1,
  ncmCode: "10063021",
  cstCode: "200",
  cClassTrib: "200003",
  baseAmount: "100.00",
};

const VALID_BODY = {
  taxEventDate: "2026-03-10T10:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 55,
  items: [VALID_ITEM],
};

function listInvalidFields(body: unknown) {
  const parsed = parseOperation(body);
  const fields = parsed.isValid ? [] : parsed.issues.map((issue) => issue.field);
  return fields;
}

describe("parseOperation", () => {
  it("reads a valid body into an operation", () => {
    const body = VALID_BODY;

    const expected = {
      isValid: true,
      operation: {
        ...VALID_BODY,
        items: [
          { ...VALID_ITEM, nbsCode: undefined, nominalRates: undefined, selectiveTax: undefined },
        ],
      },
    };
    const actual = parseOperation(body);

    expect(actual).toStrictEqual(expected);
  });

  it("reads nominal rates and leaves documentType optional", () => {
    const nominalRates = { cbsRate: "8.8123", ibsUfRate: "0.05", ibsMunRate: "0" };
    const body = {
      ...VALID_BODY,
      documentType: undefined,
      items: [{ ...VALID_ITEM, nominalRates }],
    };

    const expectedRates = nominalRates;
    const expectedDocumentType = undefined;
    const parsed = parseOperation(body);
    const actualRates = parsed.isValid ? parsed.operation.items[0]?.nominalRates : null;
    const actualDocumentType = parsed.isValid ? parsed.operation.documentType : null;

    expect(actualRates).toStrictEqual(expectedRates);
    expect(actualDocumentType).toBe(expectedDocumentType);
  });

  it("reads the Imposto Seletivo group, its optional rates, quantity and unit", () => {
    const selectiveTax = {
      cstCode: "000",
      cClassTrib: "000001",
      adValoremRate: "13",
      adRemRate: "21.3",
      quantity: "2.5",
      unit: "VN",
    };
    const adValoremOnly = { cstCode: "000", cClassTrib: "000001", adValoremRate: "5.27" };
    const body = {
      ...VALID_BODY,
      items: [
        { ...VALID_ITEM, selectiveTax },
        { ...VALID_ITEM, itemNumber: 2, selectiveTax: adValoremOnly },
      ],
    };

    const expectedGroups = [
      selectiveTax,
      { ...adValoremOnly, adRemRate: undefined, quantity: undefined, unit: undefined },
    ];
    const parsed = parseOperation(body);
    const actualGroups = parsed.isValid
      ? parsed.operation.items.map((item) => item.selectiveTax)
      : [];

    expect(actualGroups).toStrictEqual(expectedGroups);
  });

  it("lists every invalid field of the Imposto Seletivo group", () => {
    const selectiveTax = {
      cstCode: "0",
      cClassTrib: "1",
      adValoremRate: "1000",
      adRemRate: "-1",
      quantity: "1.23456",
      unit: "VINTENAS",
    };
    const body = { ...VALID_BODY, items: [{ ...VALID_ITEM, selectiveTax }] };

    const expected = [
      "items[0].selectiveTax.cstCode",
      "items[0].selectiveTax.cClassTrib",
      "items[0].selectiveTax.adValoremRate",
      "items[0].selectiveTax.adRemRate",
      "items[0].selectiveTax.quantity",
      "items[0].selectiveTax.unit",
    ];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("lists every invalid field at once", () => {
    const body = {
      taxEventDate: "2026-02-30T10:00:00-03:00",
      uf: "rs",
      municipalityCode: "431490",
      documentType: 5,
      items: [
        {
          itemNumber: 0,
          ncmCode: "1006.30.21",
          cstCode: "20",
          cClassTrib: "2000",
          baseAmount: 100,
          nominalRates: { cbsRate: "8.81234", ibsUfRate: "0.1" },
        },
      ],
    };

    const expected = [
      "taxEventDate",
      "uf",
      "municipalityCode",
      "documentType",
      "items[0].itemNumber",
      "items[0].ncmCode",
      "items[0].cstCode",
      "items[0].cClassTrib",
      "items[0].baseAmount",
      "items[0].nominalRates.cbsRate",
      "items[0].nominalRates.ibsMunRate",
    ];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("refuses a body that is not an object, and a list out of bounds", () => {
    const tooMany = {
      ...VALID_BODY,
      items: Array.from({ length: MAX_ITEMS + 1 }, () => VALID_ITEM),
    };

    const expected = [["body"], ["body"], ["items"], ["items"], ["items[0]"]];
    const actual = [
      listInvalidFields([]),
      listInvalidFields("operation"),
      listInvalidFields({ ...VALID_BODY, items: [] }),
      listInvalidFields(tooMany),
      listInvalidFields({ ...VALID_BODY, items: ["item"] }),
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("refuses a date without offset and amounts beyond the layout", () => {
    const body = {
      ...VALID_BODY,
      taxEventDate: "2026-03-10T10:00:00",
      items: [
        { ...VALID_ITEM, baseAmount: "12345678901234.00" },
        { ...VALID_ITEM, baseAmount: "-1.00" },
      ],
    };

    const expected = ["taxEventDate", "items[0].baseAmount", "items[1].baseAmount"];
    const actual = listInvalidFields(body);

    expect(actual).toStrictEqual(expected);
  });

  it("refuses impossible times and offsets", () => {
    const dates = ["2026-03-10T24:00:00-03:00", "2026-03-10T10:60-03:00", "2026-03-10T10:00+99:99"];

    const expected = [["taxEventDate"], ["taxEventDate"], ["taxEventDate"]];
    const actual = dates.map((taxEventDate) => listInvalidFields({ ...VALID_BODY, taxEventDate }));

    expect(actual).toStrictEqual(expected);
  });

  it("reads a null or blank NCM and NBS as not sent", () => {
    const body = { ...VALID_BODY, items: [{ ...VALID_ITEM, ncmCode: "", nbsCode: null }] };

    const expected = [undefined, undefined];
    const parsed = parseOperation(body);
    const firstItem = parsed.isValid ? parsed.operation.items[0] : null;
    const actual = [firstItem?.ncmCode, firstItem?.nbsCode];

    expect(actual).toStrictEqual(expected);
  });
});
