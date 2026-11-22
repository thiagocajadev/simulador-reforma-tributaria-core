import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type {
  ClassificationSearchResult,
  SelectiveTaxClassificationList,
} from "./classifications.dto.ts";
import { listSelectiveTaxClassifications } from "./selective.classifications.repository.ts";

const ROWS_READ_BUDGET = 500;
const IMPOSTO_SELETIVO_RATE_TYPE = "Alíquotas Combinadas (Ad Valorem e Ad Rem)";

describe("GET /api/classifications", () => {
  beforeAll(seedOpenData);

  it("finds the basic food basket by text, as a CBS/IBS classification", async () => {
    const path = "/api/classifications?q=alimentacao%20humana&date=2026-06-01";

    const expectedMatch = {
      cClassTrib: "200003",
      description: "Vendas de produtos destinados à alimentação humana (Anexo I)",
      cstCode: "200",
      rateType: "Padrão",
      nomenclature: "NCM",
      validFrom: "2026-01-01",
      validTo: null,
    };
    const actual = expectSuccess(await requestApi<ClassificationSearchResult>(path));
    const actualMatch = actual.data.items.find((match) => match.cClassTrib === "200003");

    expect(actualMatch).toStrictEqual(expectedMatch);
  });

  it("returns one row per code, never the Imposto Seletivo twin from 2027", async () => {
    const path = "/api/classifications?q=000001&date=2027-06-01";

    const expectedCodes = ["000001"];
    const actual = expectSuccess(await requestApi<ClassificationSearchResult>(path));
    const actualCodes = actual.data.items.map((match) => match.cClassTrib);
    const actualRateTypes = actual.data.items.map((match) => match.rateType);

    expect(actualCodes).toStrictEqual(expectedCodes);
    expect(actualRateTypes).not.toContain(IMPOSTO_SELETIVO_RATE_TYPE);
  });

  it("lists one CST's classifications when only cstCode is given", async () => {
    const path = "/api/classifications?cstCode=200&date=2026-06-01&limit=20";

    const expectedCstCodes = ["200"];
    const expectedHasMore = true;
    const actual = expectSuccess(await requestApi<ClassificationSearchResult>(path));
    const actualCstCodes = [...new Set(actual.data.items.map((match) => match.cstCode))];
    const actualHasMore = actual.data.hasMore;

    expect(actualCstCodes).toStrictEqual(expectedCstCodes);
    expect(actualHasMore).toBe(expectedHasMore);
  });

  it("answers 400 without q nor cstCode, and for a malformed cstCode", async () => {
    const withoutBoth = "/api/classifications";
    const malformedCst = "/api/classifications?cstCode=20";

    const expectedFields = [["q"], ["cstCode", "q"]];
    const actualFields = await Promise.all(
      [withoutBoth, malformedCst].map(async (path) => {
        const failure = expectFailure(await requestApi<ClassificationSearchResult>(path));
        const fields = (failure.error.errors ?? []).map((issue) => issue.field).toSorted();
        return fields;
      }),
    );

    expect(actualFields).toStrictEqual(expectedFields);
  });
});

describe("GET /api/classifications/selective-tax", () => {
  beforeAll(seedOpenData);

  it("lists every Imposto Seletivo classification of 2027 in code order, with its CST", async () => {
    const path = "/api/classifications/selective-tax?date=2027-03-10";

    const expectedCount = 29;
    const expectedFirst = {
      cClassTrib: "000001",
      description: "Primeiro fornecimento a qualquer título de bem",
      cstCode: "000",
      cstDescription: "Tributado com Imposto Seletivo",
      isCalculated: true,
    };
    const expectedCalculated = { "200007": false, "300001": true, "500007": false };
    const expectedAction = "classifications.selectiveTax.list";
    const actual = expectSuccess(await requestApi<SelectiveTaxClassificationList>(path));
    const actualCodes = actual.data.items.map((classification) => classification.cClassTrib);
    const actualCalculated = Object.fromEntries(
      actual.data.items
        .filter((classification) => classification.cClassTrib in expectedCalculated)
        .map((classification) => [classification.cClassTrib, classification.isCalculated]),
    );

    expect(actualCodes).toHaveLength(expectedCount);
    expect(actualCodes).toStrictEqual(actualCodes.toSorted());
    expect(actual.data.items[0]).toStrictEqual(expectedFirst);
    expect(actualCalculated).toStrictEqual(expectedCalculated);
    expect(actual.meta.action).toBe(expectedAction);
  });

  it("lists none before 2027, and stays within the D1 read budget", async () => {
    const before = "/api/classifications/selective-tax?date=2026-06-01";

    const expectedBefore: unknown[] = [];
    const expectedMaximum = ROWS_READ_BUDGET;
    const actualBefore = expectSuccess(await requestApi<SelectiveTaxClassificationList>(before))
      .data.items;
    const actualRowsRead = (await listSelectiveTaxClassifications(env.OPEN_DATA, "2027-03-10"))
      .rowsRead;

    expect(actualBefore).toStrictEqual(expectedBefore);
    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });

  it("answers 400 for a malformed date", async () => {
    const path = "/api/classifications/selective-tax?date=2027-02-30";

    const expectedFields = ["date"];
    const failure = expectFailure(await requestApi<SelectiveTaxClassificationList>(path));
    const actualFields = (failure.error.errors ?? []).map((issue) => issue.field);

    expect(actualFields).toStrictEqual(expectedFields);
  });
});
