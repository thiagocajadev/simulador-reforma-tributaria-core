import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type { RateLookupResult } from "./rates.dto.ts";

const PORTO_ALEGRE = "uf=RS&municipalityCode=4314902";
const RIO_GRANDE_DO_SUL_UF_CODE = 43;
const IBS_UF_REFERENCE_ID = 2;

// why: ALIQUOTA_PADRAO is empty upstream, so the standard rate join needs a row of its own.
const INSERT_RS_STANDARD_RATE = `
INSERT INTO ALIQUOTA_PADRAO (
  ALPA_ID, ALPA_VALOR, ALPA_MUNI_CD, ALPA_UF_CD, ALPA_ALRE_ID, ALPA_FORMA_APLICACAO, ALPA_INICIO_VIGENCIA
) VALUES (9001, 0.05, NULL, ?1, ?2, 'ACRESCIMO', '2026-01-01');`;

describe("GET /api/rates", () => {
  beforeAll(seedOpenData);

  it("returns the 2026 reference rates for Porto Alegre", async () => {
    const path = `/api/rates?date=2026-03-10&${PORTO_ALEGRE}`;

    const expected = {
      rates: [
        { tax: "CBS", rate: "0.9", source: "reference" },
        { tax: "IBS_UF", rate: "0.1", source: "reference" },
        { tax: "IBS_MUN", rate: "0", source: "reference" },
      ],
      requiresNominalRates: false,
    };
    const expectedAction = "rates.lookup";
    const actual = expectSuccess(await requestApi<RateLookupResult>(path));
    const actualResult = actual.data;
    const actualAction = actual.meta.action;

    expect(actualResult).toStrictEqual(expected);
    expect(actualAction).toBe(expectedAction);
  });

  it("asks for nominal rates from 2027, when the database has none", async () => {
    const path = `/api/rates?date=2027-01-01&${PORTO_ALEGRE}`;

    const expected = { rates: [], requiresNominalRates: true };
    const actual = expectSuccess(await requestApi<RateLookupResult>(path));
    const actualResult = actual.data;

    expect(actualResult).toStrictEqual(expected);
  });

  it("returns no rates before 2026, when CBS and IBS do not exist yet", async () => {
    const path = `/api/rates?date=2025-06-01&${PORTO_ALEGRE}`;

    const expected = { rates: [], requiresNominalRates: false };
    const actual = expectSuccess(await requestApi<RateLookupResult>(path));
    const actualResult = actual.data;

    expect(actualResult).toStrictEqual(expected);
  });

  it("answers 400 when the municipality is not in the state, or the state does not exist", async () => {
    const outsideState = "/api/rates?date=2026-03-10&uf=SC&municipalityCode=4314902";
    const unknownState = "/api/rates?date=2026-03-10&uf=ZZ&municipalityCode=4314902";

    const expectedFields = [["municipalityCode"], ["uf"]];
    const actualFields = await Promise.all(
      [outsideState, unknownState].map(async (path) => {
        const failure = expectFailure(await requestApi<RateLookupResult>(path));
        const fields = (failure.error.errors ?? []).map((issue) => issue.field);
        return fields;
      }),
    );

    expect(actualFields).toStrictEqual(expectedFields);
  });

  it("answers 400 listing both location parameters when they are missing", async () => {
    const path = "/api/rates";

    const expectedFields = ["uf", "municipalityCode"];
    const actual = await requestApi<RateLookupResult>(path);
    const actualFields = expectFailure(actual).error.errors?.map((issue) => issue.field);

    expect(actualFields).toStrictEqual(expectedFields);
  });
});

describe("GET /api/rates with a state standard rate", () => {
  beforeAll(async () => {
    await seedOpenData();
    await env.OPEN_DATA.prepare(INSERT_RS_STANDARD_RATE)
      .bind(RIO_GRANDE_DO_SUL_UF_CODE, IBS_UF_REFERENCE_ID)
      .run();
  });

  it("adds the RS standard rate to the IBS UF reference, and only there", async () => {
    const path = `/api/rates?date=2026-03-10&${PORTO_ALEGRE}`;

    const expectedRates = [
      { tax: "CBS", rate: "0.9", source: "reference" },
      { tax: "IBS_UF", rate: "0.15", source: "standard" },
      { tax: "IBS_MUN", rate: "0", source: "reference" },
    ];
    const actual = expectSuccess(await requestApi<RateLookupResult>(path));
    const actualRates = actual.data.rates;

    expect(actualRates).toStrictEqual(expectedRates);
  });
});
