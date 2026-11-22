import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { toSearchQuery } from "@/shared/testing/search.query.ts";
import type { MunicipalitySearchResult } from "./municipalities.dto.ts";
import { searchMunicipalities } from "./municipalities.repository.ts";

const ROWS_READ_BUDGET = 500;
const SAO_PAULO_UF_CODE = 35;

describe("GET /api/municipalities", () => {
  beforeAll(seedOpenData);

  it("finds a municipality by name without accents, only within the state", async () => {
    const path = "/api/municipalities?uf=rs&q=porto%20alegre";

    const expectedFirst = { municipalityCode: 4314902, name: "Porto Alegre", uf: "RS" };
    const expectedStates = ["RS"];
    const actual = expectSuccess(await requestApi<MunicipalitySearchResult>(path));
    const actualFirst = actual.data.items.at(0);
    const actualStates = [...new Set(actual.data.items.map((match) => match.uf))];

    expect(actualFirst).toStrictEqual(expectedFirst);
    expect(actualStates).toStrictEqual(expectedStates);
  });

  it("matches São Paulo when the visitor types sao paulo", async () => {
    const path = "/api/municipalities?uf=SP&q=sao%20paulo";

    const expectedName = "São Paulo";
    const actual = expectSuccess(await requestApi<MunicipalitySearchResult>(path));
    const actualNames = actual.data.items.map((match) => match.name);

    expect(actualNames).toContain(expectedName);
  });

  it("matches the typed words against names only, never against the state code", async () => {
    const path = "/api/municipalities?uf=SP&q=sp";

    const expectedMatches: unknown[] = [];
    const actual = expectSuccess(await requestApi<MunicipalitySearchResult>(path));
    const actualMatches = actual.data.items;

    expect(actualMatches).toStrictEqual(expectedMatches);
  });

  it("finds a municipality by an IBGE code prefix, and nothing for a code too long", async () => {
    const prefixPath = "/api/municipalities?uf=RS&q=431490";
    const tooLongPath = "/api/municipalities?uf=RS&q=43149029";

    const expectedPrefixCodes = [4314902];
    const expectedTooLongCodes: number[] = [];
    const actualPrefix = expectSuccess(await requestApi<MunicipalitySearchResult>(prefixPath));
    const actualTooLong = expectSuccess(await requestApi<MunicipalitySearchResult>(tooLongPath));
    const actualPrefixCodes = actualPrefix.data.items.map((match) => match.municipalityCode);
    const actualTooLongCodes = actualTooLong.data.items.map((match) => match.municipalityCode);

    expect(actualPrefixCodes).toStrictEqual(expectedPrefixCodes);
    expect(actualTooLongCodes).toStrictEqual(expectedTooLongCodes);
  });

  it("searches every state when no UF is given, each match carrying its own UF", async () => {
    const path = "/api/municipalities?q=sao%20paulo";

    const expectedMatch = { municipalityCode: 3550308, name: "São Paulo", uf: "SP" };
    const actual = expectSuccess(await requestApi<MunicipalitySearchResult>(path));
    const actualStates = new Set(actual.data.items.map((match) => match.uf));
    const actualHasManyStates = actualStates.size > 1;

    expect(actual.data.items).toContainEqual(expectedMatch);
    expect(actualHasManyStates).toBe(true);
  });

  it("finds a municipality by its IBGE code prefix without a UF", async () => {
    const path = "/api/municipalities?q=431490";

    const expectedCodes = [4314902];
    const actual = expectSuccess(await requestApi<MunicipalitySearchResult>(path));
    const actualCodes = actual.data.items.map((match) => match.municipalityCode);

    expect(actualCodes).toStrictEqual(expectedCodes);
  });

  it("answers 400 for a state code that does not exist", async () => {
    const path = "/api/municipalities?uf=ZZ&q=porto";

    const expectedStatus = 400;
    const expectedFields = ["uf"];
    const actual = await requestApi<MunicipalitySearchResult>(path);
    const actualStatus = actual.status;
    const actualFields = expectFailure(actual).error.errors?.map((issue) => issue.field);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualFields).toStrictEqual(expectedFields);
  });
});

describe("searchMunicipalities rows read", () => {
  beforeAll(seedOpenData);

  it("searches one state only, so a common prefix stays within the read budget", async () => {
    const input = {
      query: toSearchQuery("sao"),
      uf: "SP",
      ufCode: SAO_PAULO_UF_CODE,
      date: "2026-06-01",
      limit: 20,
    };

    const expectedMaximum = ROWS_READ_BUDGET;
    const actual = await searchMunicipalities(env.OPEN_DATA, input);
    const actualRowsRead = actual.rowsRead;

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });

  // why: measured on 2026-11-21 at 62 rows at most nationwide (sao, santa, de), since results stop at the limit.
  it("keeps a nationwide search of a common word within the read budget", async () => {
    const texts = ["sao", "santa", "de", "ma"];
    const outcomes = await Promise.all(
      texts.map((text) =>
        searchMunicipalities(env.OPEN_DATA, {
          query: toSearchQuery(text),
          uf: null,
          ufCode: null,
          date: "2026-06-01",
          limit: 20,
        }),
      ),
    );

    const expectedMaximum = ROWS_READ_BUDGET;
    const actualRowsRead = Math.max(...outcomes.map((outcome) => outcome.rowsRead));

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });
});
