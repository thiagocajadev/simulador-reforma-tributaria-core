import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type { CstListResult } from "./cst.dto.ts";

describe("GET /api/cst", () => {
  beforeAll(seedOpenData);

  it("lists the 18 CBS/IBS situations once each, in code order", async () => {
    const path = "/api/cst?date=2026-06-01";

    const expectedLength = 18;
    const expectedFirst = { cstCode: "000", description: "Tributação integral" };
    const expectedImpostoSeletivoOnly: string[] = [];
    const actual = expectSuccess(await requestApi<CstListResult>(path));
    const actualCodes = actual.data.items.map((match) => match.cstCode);
    const actualDistinctCodes = new Set(actualCodes).size;
    const actualSortedCodes = actualCodes.toSorted();
    const actualFirst = actual.data.items.at(0);
    const actualImpostoSeletivoOnly = actualCodes.filter((code) =>
      ["100", "300", "500", "600"].includes(code),
    );

    expect(actualCodes.length).toBe(expectedLength);
    expect(actualDistinctCodes).toBe(expectedLength);
    expect(actualCodes).toStrictEqual(actualSortedCodes);
    expect(actualFirst).toStrictEqual(expectedFirst);
    expect(actualImpostoSeletivoOnly).toStrictEqual(expectedImpostoSeletivoOnly);
  });

  it("answers 400 for a malformed date", async () => {
    const path = "/api/cst?date=20260601";

    const expectedStatus = 400;
    const expectedCode = "INVALID_INPUT";
    const actual = await requestApi<CstListResult>(path);
    const actualStatus = actual.status;
    const actualCode = expectFailure(actual).error.code;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCode).toBe(expectedCode);
  });
});
