import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { completeWithinOneWindow, RATE_LIMIT_TEST_TIMEOUT } from "@/shared/testing/rate.window.ts";
import { toSearchQuery } from "@/shared/testing/search.query.ts";
import type { NcmSearchResult } from "./ncm.dto.ts";
import { searchNcm } from "./ncm.repository.ts";

const ROWS_READ_BUDGET = 500;
// why: the limit of SEARCH_RATE_LIMITER in wrangler.jsonc.
const SEARCHES_PER_MINUTE = 60;
const OK_STATUS = 200;
const FULL_NCM_CODE = /^\d{8}$/;

describe("GET /api/ncm", () => {
  beforeAll(seedOpenData);

  it("finds a full code through its parent descriptions, without accents", async () => {
    const path = "/api/ncm?q=feijao%20comum%20preto&date=2026-06-01";

    const expectedMatch = {
      ncmCode: "07133319",
      description: "Outros",
      context:
        "Legumes de vagem, secos, em grão, mesmo pelados ou partidos. › Feijões (Vigna spp., Phaseolus spp.): › Feijão comum (Phaseolus vulgaris) › Preto",
      validFrom: "2022-04-01",
      validTo: null,
      selectiveTax: null,
      selectiveTaxWindows: [],
    };
    const expectedAction = "ncm.search";
    const actual = expectSuccess(await requestApi<NcmSearchResult>(path));
    const actualMatches = actual.data.items;
    const actualAction = actual.meta.action;

    expect(actualMatches).toContainEqual(expectedMatch);
    expect(actualAction).toBe(expectedAction);
  });

  it("lists full codes under a typed code prefix, in code order", async () => {
    const path = "/api/ncm?q=0713.33&date=2026-06-01";

    const expectedCodes = ["07133311", "07133319", "07133321", "07133329", "07133391", "07133399"];
    const expectedHasMore = false;
    const actual = expectSuccess(await requestApi<NcmSearchResult>(path));
    const actualCodes = actual.data.items.map((match) => match.ncmCode);
    const actualHasMore = actual.data.hasMore;

    expect(actualCodes).toStrictEqual(expectedCodes);
    expect(actualHasMore).toBe(expectedHasMore);
  });

  it("stops at the limit and tells there is more", async () => {
    const path = "/api/ncm?q=0713&limit=2&date=2026-06-01";

    const expectedLength = 2;
    const expectedHasMore = true;
    const expectedAreFullCodes = true;
    const actual = expectSuccess(await requestApi<NcmSearchResult>(path));
    const actualLength = actual.data.items.length;
    const actualHasMore = actual.data.hasMore;
    const actualAreFullCodes = actual.data.items.every((match) =>
      FULL_NCM_CODE.test(match.ncmCode),
    );

    expect(actualLength).toBe(expectedLength);
    expect(actualHasMore).toBe(expectedHasMore);
    expect(actualAreFullCodes).toBe(expectedAreFullCodes);
  });

  it("returns text matches in code order", async () => {
    const path = "/api/ncm?q=feijao&date=2026-06-01";

    const actual = expectSuccess(await requestApi<NcmSearchResult>(path));
    const actualCodes = actual.data.items.map((match) => match.ncmCode);
    const expectedCodes = actualCodes.toSorted();

    expect(actualCodes).toStrictEqual(expectedCodes);
  });

  it("leaves out a code whose validity ended before the date", async () => {
    const before = "/api/ncm?q=59039000&date=2026-01-15";
    const after = "/api/ncm?q=59039000&date=2026-02-01";

    const expectedBefore = [{ ncmCode: "59039000", validTo: "2026-01-31" }];
    const expectedAfter: unknown[] = [];
    const actualBefore = expectSuccess(await requestApi<NcmSearchResult>(before)).data.items;
    const actualAfter = expectSuccess(await requestApi<NcmSearchResult>(after)).data.items;
    const actualBeforeSummary = actualBefore.map(({ ncmCode, validTo }) => ({ ncmCode, validTo }));

    expect(actualBeforeSummary).toStrictEqual(expectedBefore);
    expect(actualAfter).toStrictEqual(expectedAfter);
  });

  it("says which Imposto Seletivo rates apply to a code on the date", async () => {
    const cigarettes = "/api/ncm?q=24021000&date=2027-03-10";
    const vehicle = "/api/ncm?q=87032100&date=2028-03-10";
    const beforeTheTax = "/api/ncm?q=24021000&date=2026-06-01";
    const withoutTheTax = "/api/ncm?q=84713012&date=2027-03-10";

    const expectedCigarettes = {
      hasAdValorem: true,
      adRemUnit: { code: "VN", description: "Vintena de cigarro" },
      officialRates: { adValorem: null, adRem: null },
    };
    const expectedVehicle = {
      hasAdValorem: true,
      adRemUnit: null,
      officialRates: { adValorem: null, adRem: null },
    };
    const actualCigarettes = expectSuccess(await requestApi<NcmSearchResult>(cigarettes)).data
      .items[0]?.selectiveTax;
    const actualVehicle = expectSuccess(await requestApi<NcmSearchResult>(vehicle)).data.items[0]
      ?.selectiveTax;
    const actualBeforeTheTax = expectSuccess(await requestApi<NcmSearchResult>(beforeTheTax)).data
      .items[0]?.selectiveTax;
    const actualWithoutTheTax = expectSuccess(await requestApi<NcmSearchResult>(withoutTheTax)).data
      .items[0]?.selectiveTax;

    expect(actualCigarettes).toStrictEqual(expectedCigarettes);
    expect(actualVehicle).toStrictEqual(expectedVehicle);
    expect(actualBeforeTheTax).toBeNull();
    expect(actualWithoutTheTax).toBeNull();
  });

  it("answers 400 with every invalid parameter listed", async () => {
    const path = "/api/ncm?q=a&date=2026-02-30&limit=50";

    const expectedStatus = 400;
    const expectedCode = "INVALID_INPUT";
    const expectedFields = ["q", "date", "limit"];
    const actual = await requestApi<NcmSearchResult>(path);
    const actualStatus = actual.status;
    const actualError = expectFailure(actual).error;
    const actualFields = actualError.errors?.map((issue) => issue.field);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualError.code).toBe(expectedCode);
    expect(actualError.status).toBe(expectedStatus);
    expect(actualFields).toStrictEqual(expectedFields);
  });

  it("treats FTS5 operators in the text as words instead of failing", async () => {
    const path = "/api/ncm?q=feijao%20OR%20%22NEAR(&date=2026-06-01";

    const expectedStatus = 200;
    const actual = await requestApi<NcmSearchResult>(path);
    const actualStatus = actual.status;

    expect(actualStatus).toBe(expectedStatus);
  });
});

describe("GET /api/ncm past the rate limit", () => {
  beforeAll(seedOpenData);

  it(
    "answers 429 to the 61st search in a minute from one address, before validating it",
    async () => {
      const validPath = "/api/ncm?q=0713.33&date=2026-06-01";
      const invalidPath = "/api/ncm?q=a";

      const expected = {
        servedCount: SEARCHES_PER_MINUTE,
        refusedStatus: 429,
        refusedCode: "RATE_LIMITED",
        otherAddressStatus: 200,
      };
      const actual = await completeWithinOneWindow(async (clientAddress) => {
        const servedStatuses: number[] = [];

        for (let searchNumber = 0; searchNumber < SEARCHES_PER_MINUTE; searchNumber += 1) {
          const served = await requestApi<NcmSearchResult>(validPath, { clientAddress });
          servedStatuses.push(served.status);
        }

        const refused = await requestApi<NcmSearchResult>(invalidPath, { clientAddress });
        const otherAddress = await requestApi<NcmSearchResult>(validPath);
        const outcome = {
          servedCount: servedStatuses.filter((status) => status === OK_STATUS).length,
          refusedStatus: refused.status,
          refusedCode: expectFailure(refused).error.code,
          otherAddressStatus: otherAddress.status,
        };
        return outcome;
      });

      expect(actual).toStrictEqual(expected);
    },
    RATE_LIMIT_TEST_TIMEOUT,
  );
});

describe("searchNcm rows read", () => {
  beforeAll(seedOpenData);

  it("stays within the D1 read budget for common words and short code prefixes", async () => {
    const searchTexts = ["feijao", "de", "outros", "84", "01"];
    const searches = searchTexts.map((text) =>
      searchNcm(env.OPEN_DATA, { query: toSearchQuery(text), date: "2026-06-01", limit: 20 }),
    );

    const expectedMaximum = ROWS_READ_BUDGET;
    const actual = await Promise.all(searches);
    const actualRowsRead = Math.max(...actual.map((outcome) => outcome.rowsRead));

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });

  it("stays within the budget where the Imposto Seletivo applies", async () => {
    const searchTexts = ["cigarros", "cerveja", "24", "8802", "outros"];
    const searches = searchTexts.map((text) =>
      searchNcm(env.OPEN_DATA, { query: toSearchQuery(text), date: "2027-03-10", limit: 20 }),
    );

    const expectedMaximum = ROWS_READ_BUDGET;
    const actual = await Promise.all(searches);
    const actualRowsRead = Math.max(...actual.map((outcome) => outcome.rowsRead));

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });
});
