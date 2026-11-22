import { describe, expect, it } from "vitest";
import type { ClassificationOption } from "@/features/classifications/classifications.service.ts";
import {
  addItem,
  applyStatutoryIbsRates,
  changeDocumentKind,
  checkDraft,
  chooseMunicipality,
  clearFieldErrors,
  createDraft,
  type OperationDraft,
  removeItem,
  removeItemErrors,
  toFieldErrors,
  updateItem,
} from "./operation.draft.ts";

const PORTO_ALEGRE = { code: "4314902", label: "Porto Alegre", hint: "RS" };
const SCHOOL_SERVICE = { code: "122011200", label: "Serviços de educação", hint: null };
const EDUCATION_60_PERCENT: ClassificationOption = {
  code: "200028",
  label: "Fornecimento dos serviços de educação",
  hint: "CST 200",
  cstCode: "200",
};

function createSchoolDraft(taxEventDate: string) {
  const draft = createDraft(taxEventDate);
  const filledDraft: OperationDraft = {
    ...updateItem(draft, 1, {
      product: SCHOOL_SERVICE,
      classification: EDUCATION_60_PERCENT,
      baseAmount: "1.200,00",
    }),
    uf: "RS",
    municipality: PORTO_ALEGRE,
  };
  return filledDraft;
}

describe("checkDraft", () => {
  it("turns a filled NFS-e draft into the calculation request", () => {
    const draft = createSchoolDraft("2026-03-10");

    const expected = {
      isValid: true,
      operation: {
        taxEventDate: "2026-03-10T12:00:00-03:00",
        uf: "RS",
        municipalityCode: 4314902,
        documentType: 91,
        items: [
          {
            itemNumber: 1,
            nbsCode: "122011200",
            cstCode: "200",
            cClassTrib: "200028",
            baseAmount: "1200.00",
          },
        ],
      },
    };
    const actual = checkDraft(draft);

    expect(actual).toStrictEqual(expected);
  });

  it("sends the nominal rates on every item from 2027", () => {
    const draft: OperationDraft = {
      ...createSchoolDraft("2027-01-15"),
      nominalRates: { cbsRate: "8,8", ibsUfRate: "0,1", ibsMunRate: "0" },
    };

    const expectedRates = { cbsRate: "8.8", ibsUfRate: "0.1", ibsMunRate: "0" };
    const actual = checkDraft(draft);
    const actualRates = actual.isValid ? actual.operation.items[0]?.nominalRates : null;

    expect(actualRates).toStrictEqual(expectedRates);
  });

  it("lists every missing or unreadable field, in Portuguese", () => {
    const draft: OperationDraft = {
      ...createDraft("2027-01-15"),
      nominalRates: { cbsRate: "", ibsUfRate: "", ibsMunRate: "" },
      operationItems: [
        {
          draftId: 1,
          product: null,
          description: "",
          classification: null,
          baseAmount: "0,00",
          selectiveTax: null,
        },
      ],
    };

    const expectedKeys = [
      "items.0.baseAmount",
      "items.0.classification",
      "items.0.product",
      "municipality",
      "nominalRates.cbsRate",
      "nominalRates.ibsMunRate",
      "nominalRates.ibsUfRate",
    ];
    const expectedProductMessage = "Escolha o NBS do serviço.";
    const actual = checkDraft(draft);
    const actualErrors = actual.isValid ? {} : actual.fieldErrors;
    const actualKeys = Object.keys(actualErrors).toSorted();
    const actualProductMessage = actualErrors["items.0.product"];

    expect(actualKeys).toStrictEqual(expectedKeys);
    expect(actualProductMessage).toBe(expectedProductMessage);
  });
});

describe("draft editing", () => {
  it("keeps one service on an NFS-e and up to 20 goods on an NF-e", () => {
    const nfseDraft = createDraft("2026-03-10");
    const nfeDraft = changeDocumentKind(nfseDraft, "nfe");

    const expectedNfseCount = 1;
    const expectedNfeCount = 3;
    const actualNfseCount = addItem(nfseDraft).operationItems.length;
    const actualNfeCount = addItem(addItem(nfeDraft)).operationItems.length;

    expect(actualNfseCount).toBe(expectedNfseCount);
    expect(actualNfeCount).toBe(expectedNfeCount);
  });

  it("clears the products and drops extra items when the nomenclature changes", () => {
    const nfeDraft = addItem(changeDocumentKind(createSchoolDraft("2026-03-10"), "nfe"));
    const nfseDraft = changeDocumentKind(nfeDraft, "nfse");

    const expectedCount = 1;
    const expectedProduct = null;
    const expectedClassification = "200028";
    const actualCount = nfseDraft.operationItems.length;
    const actualProduct = nfseDraft.operationItems[0]?.product;
    const actualClassification = nfseDraft.operationItems[0]?.classification?.code;

    expect(actualCount).toBe(expectedCount);
    expect(actualProduct).toBe(expectedProduct);
    expect(actualClassification).toBe(expectedClassification);
  });

  it("never removes the last item", () => {
    const draft = createDraft("2026-03-10");

    const expectedCount = 1;
    const actualCount = removeItem(draft, 1).operationItems.length;

    expect(actualCount).toBe(expectedCount);
  });
});

describe("applyStatutoryIbsRates", () => {
  it("fills the IBS that LC 214/2025 fixes for 2027 and 2028, and leaves the CBS to the visitor", () => {
    const draft = createDraft("2028-12-31");

    const expected = { cbsRate: "", ibsUfRate: "0,05", ibsMunRate: "0,05" };
    const actual = draft.nominalRates;

    expect(actual).toStrictEqual(expected);
  });

  it("fills nothing outside 2027 and 2028, and never overwrites a typed rate", () => {
    const typed = { cbsRate: "11,2", ibsUfRate: "0,1", ibsMunRate: "" };
    const inside = applyStatutoryIbsRates({
      ...createDraft("2026-06-01"),
      taxEventDate: "2027-05-01",
      nominalRates: typed,
    });

    const expected = [
      { cbsRate: "", ibsUfRate: "", ibsMunRate: "" },
      { cbsRate: "", ibsUfRate: "", ibsMunRate: "" },
      { cbsRate: "11,2", ibsUfRate: "0,1", ibsMunRate: "0,05" },
    ];
    const actual = [
      createDraft("2026-12-31").nominalRates,
      createDraft("2029-01-01").nominalRates,
      inside.nominalRates,
    ];

    expect(actual).toStrictEqual(expected);
  });

  it("empties the statutory IBS when the date leaves 2028, and keeps a rate the visitor typed", () => {
    const from2028 = createDraft("2028-06-01");
    const typedMunicipal = {
      ...from2028,
      nominalRates: { ...from2028.nominalRates, ibsMunRate: "0,2" },
    };
    const moved = applyStatutoryIbsRates({ ...typedMunicipal, taxEventDate: "2029-01-01" });

    const expected = { cbsRate: "", ibsUfRate: "", ibsMunRate: "0,2" };
    const actual = moved.nominalRates;

    expect(actual).toStrictEqual(expected);
  });
});

describe("chooseMunicipality", () => {
  it("fills a blank UF with the UF of the municipality found nationwide", () => {
    const draft = createDraft("2026-03-10");

    const expectedUf = "RS";
    const expectedMunicipality = PORTO_ALEGRE;
    const actual = chooseMunicipality(draft, PORTO_ALEGRE);

    expect(actual.uf).toBe(expectedUf);
    expect(actual.municipality).toStrictEqual(expectedMunicipality);
  });

  it("keeps the UF when the option carries no known state code", () => {
    const draft = { ...createDraft("2026-03-10"), uf: "SP" };
    const unknownState = { ...PORTO_ALEGRE, hint: null };

    const expectedUf = "SP";
    const actual = chooseMunicipality(draft, unknownState);

    expect(actual.uf).toBe(expectedUf);
  });
});

describe("toFieldErrors", () => {
  it("places each API issue under the form field it belongs to", () => {
    const issues = [
      { field: "municipalityCode", message: "Unknown." },
      { field: "items[1].ncmCode", message: "Bad code." },
      { field: "items[0].nominalRates.ibsUfRate", message: "Bad rate." },
      { field: "body", message: "Must be a JSON object." },
    ];

    const expectedKeys = ["municipality", "items.1.product", "nominalRates.ibsUfRate", "form"];
    const actualKeys = Object.keys(toFieldErrors(issues));

    expect(actualKeys).toStrictEqual(expectedKeys);
  });
});

describe("field error upkeep", () => {
  it("clears an edited field and the fields under it, never a longer index", () => {
    const errors = {
      "nominalRates.cbsRate": "a",
      "nominalRates.ibsUfRate": "b",
      "items.1.product": "c",
      "items.10.product": "d",
      municipality: "e",
    };

    const expectedKeys = ["items.10.product", "municipality"];
    const actualKeys = Object.keys(clearFieldErrors(errors, ["nominalRates", "items.1"]));

    expect(actualKeys).toStrictEqual(expectedKeys);
  });

  it("drops the removed item's errors and moves the later items' errors up one slot", () => {
    const errors = {
      "items.0.baseAmount": "first",
      "items.1.product": "second",
      "items.2.classification": "third",
      municipality: "operation",
    };

    const expected = {
      "items.0.baseAmount": "first",
      "items.1.classification": "third",
      municipality: "operation",
    };
    const actual = removeItemErrors(errors, 1);

    expect(actual).toStrictEqual(expected);
  });
});
