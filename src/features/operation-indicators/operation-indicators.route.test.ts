import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { postLargestCalculations } from "@/shared/testing/calculation.limit.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { completeWithinOneWindow, RATE_LIMIT_TEST_TIMEOUT } from "@/shared/testing/rate.window.ts";
import type { OperationIndicatorsResult } from "./operation-indicators.dto.ts";
import { findOperationIndicators } from "./operation-indicators.repository.ts";

const SCHOOL_SERVICE = "nbsCode=122011200&cClassTrib=200028";
// why: measured at 16 to 102 rows with the index on the NBS code, 2026-11-21 (3,296 without it).
const ROWS_READ_BUDGET = 150;
// why: 123019900 has the most rows in CLASSIF_NBS_INDOP_LC (46), so it is the costliest lookup.
const MOST_MAPPED_NBS_CODE = "123019900";

describe("GET /api/operation-indicators", () => {
  beforeAll(seedOpenData);

  it("lists the four indicators of a school service until November 2026", async () => {
    const path = `/api/operation-indicators?${SCHOOL_SERVICE}&date=2026-03-10`;

    const expectedServiceItem = {
      lc116Code: "8.01",
      nationalTaxCode: "080101",
      description: "Ensino regular pré-escolar, fundamental, médio e superior.",
    };
    const expectedIndicators = [
      ["030101", "Estabelecimento do Prestador/Fornecedor"],
      ["030102", "Endereço do Tomador/Adquirente"],
      ["030103", "Endereço do Destinatário"],
      ["030104", "Local da Prestação"],
    ];
    const expectedAction = "operationIndicators.lookup";
    const actual = expectSuccess(await requestApi<OperationIndicatorsResult>(path));
    const [actualServiceItem] = actual.data.serviceItems;
    const { indicators: actualIndicatorList = [], ...actualServiceFields } =
      actualServiceItem ?? {};
    const actualIndicators = actualIndicatorList.map((indicator) => [
      indicator.indicatorCode,
      indicator.incidencePlace,
    ]);
    const actualServiceItemCount = actual.data.serviceItems.length;
    const actualAction = actual.meta.action;

    expect(actualServiceItemCount).toBe(1);
    expect(actualServiceFields).toStrictEqual(expectedServiceItem);
    expect(actualIndicators).toStrictEqual(expectedIndicators);
    expect(actualAction).toBe(expectedAction);
  });

  it("follows the indicator table from December 2026, when 030102 changes meaning", async () => {
    const path = `/api/operation-indicators?${SCHOOL_SERVICE}&date=2026-12-01`;

    const expectedIndicators = [
      ["030101", "Estabelecimento do Prestador/Fornecedor"],
      ["030102", "Local da Prestação"],
    ];
    const actual = expectSuccess(await requestApi<OperationIndicatorsResult>(path));
    const actualIndicators = (actual.data.serviceItems[0]?.indicators ?? []).map((indicator) => [
      indicator.indicatorCode,
      indicator.incidencePlace,
    ]);

    expect(actualIndicators).toStrictEqual(expectedIndicators);
  });

  it("returns one service item per LC 116 subitem the NBS maps to", async () => {
    const path = "/api/operation-indicators?nbsCode=101011100&cClassTrib=200045&date=2026-03-10";

    const expectedCodes = [
      ["7.02", "070201"],
      ["7.05", "070501"],
    ];
    const actual = expectSuccess(await requestApi<OperationIndicatorsResult>(path));
    const actualCodes = actual.data.serviceItems.map((serviceItem) => [
      serviceItem.lc116Code,
      serviceItem.nationalTaxCode,
    ]);

    expect(actualCodes).toStrictEqual(expectedCodes);
  });

  it("answers an empty list when the open data maps no service to the pair", async () => {
    const path = "/api/operation-indicators?nbsCode=122011200&cClassTrib=000001&date=2026-03-10";

    const expected = { nbsCode: "122011200", cClassTrib: "000001", serviceItems: [] };
    const actual = expectSuccess(await requestApi<OperationIndicatorsResult>(path));
    const actualResult = actual.data;

    expect(actualResult).toStrictEqual(expected);
  });

  it("answers 400 listing every malformed parameter", async () => {
    const path = "/api/operation-indicators?nbsCode=12201&cClassTrib=2000&date=2026-02-30";

    const expectedStatus = 400;
    const expectedFields = ["nbsCode", "cClassTrib", "date"];
    const actual = await requestApi<OperationIndicatorsResult>(path);
    const actualStatus = actual.status;
    const actualFields = (expectFailure(actual).error.errors ?? []).map((issue) => issue.field);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualFields).toStrictEqual(expectedFields);
  });

  it(
    "counts against the calculation limit of the address",
    async () => {
      const path = `/api/operation-indicators?${SCHOOL_SERVICE}&date=2026-03-10`;

      const expected = { refusedStatus: 429, refusedCode: "RATE_LIMITED", otherAddressStatus: 200 };
      const actual = await completeWithinOneWindow(async (clientAddress) => {
        await postLargestCalculations({ clientAddress, postCount: 3 });

        const refused = await requestApi<OperationIndicatorsResult>(path, { clientAddress });
        const otherAddress = await requestApi<OperationIndicatorsResult>(path);
        const outcome = {
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

describe("findOperationIndicators rows read", () => {
  beforeAll(seedOpenData);

  it("reads the mapping through the NBS index, within the read budget", async () => {
    const inputs = ["122011200", MOST_MAPPED_NBS_CODE].map((nbsCode) => ({
      nbsCode,
      cClassTrib: "200028",
      date: "2026-03-10",
    }));

    const expectedMaximum = ROWS_READ_BUDGET;
    const actual = await Promise.all(
      inputs.map((input) => findOperationIndicators(env.OPEN_DATA, input)),
    );
    const actualRowsRead = Math.max(...actual.map((outcome) => outcome.rowsRead));

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });
});
