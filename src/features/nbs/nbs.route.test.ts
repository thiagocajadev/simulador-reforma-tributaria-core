import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type { NbsSearchResult } from "./nbs.dto.ts";

const FULL_NBS_CODE = /^\d{9}$/;

describe("GET /api/nbs", () => {
  beforeAll(seedOpenData);

  it("finds full codes by text, without accents, with their parent context", async () => {
    const path = "/api/nbs?q=edificacoes%20residenciais&date=2026-06-01";

    const expectedMatch = {
      nbsCode: "101011100",
      description: "Serviços de construção de edificações residenciais de um e dois pavimentos",
      context:
        "Serviços de construção de edificações › Serviços de construção de edificações residenciais",
      validFrom: "2026-01-01",
      validTo: null,
    };
    const actual = expectSuccess(await requestApi<NbsSearchResult>(path));
    const actualMatches = actual.data.items;
    const actualAreFullCodes = actualMatches.every((match) => FULL_NBS_CODE.test(match.nbsCode));
    const expectedAreFullCodes = true;

    expect(actualMatches).toContainEqual(expectedMatch);
    expect(actualAreFullCodes).toBe(expectedAreFullCodes);
  });

  it("lists full codes under a typed code prefix", async () => {
    const path = "/api/nbs?q=1.0101.1&date=2026-06-01";

    const expectedCodes = ["101011100", "101011200"];
    const actual = expectSuccess(await requestApi<NbsSearchResult>(path));
    const actualCodes = actual.data.items.map((match) => match.nbsCode);

    expect(actualCodes).toStrictEqual(expectedCodes);
  });

  it("answers 400 when the text is missing", async () => {
    const path = "/api/nbs";

    const expectedStatus = 400;
    const expectedFields = ["q"];
    const actual = await requestApi<NbsSearchResult>(path);
    const actualStatus = actual.status;
    const actualFields = expectFailure(actual).error.errors?.map((issue) => issue.field);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualFields).toStrictEqual(expectedFields);
  });
});
