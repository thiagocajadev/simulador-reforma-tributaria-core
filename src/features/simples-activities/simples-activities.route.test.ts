import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type { SimplesActivityListResult } from "./simples-activities.dto.ts";

const PATH = "/api/simples-nacional-activities";

function listActivityCodes(reply: { data: SimplesActivityListResult }) {
  const codes = reply.data.items.map((activity) => activity.activityCode);
  return codes;
}

describe("GET /api/simples-nacional-activities", () => {
  beforeAll(seedOpenData);

  it("lists the activities the NF-e admits in 2027, in catalogue order", async () => {
    const path = `${PATH}?date=2027-03-10&documentType=55`;

    const expectedFirst = {
      activityCode: "01",
      description:
        "Revenda de mercadorias, venda de mercadorias industrializadas pelo contribuinte",
      annex: "I",
      isNonTaxable: false,
      annexWithoutFatorR: "I",
      annexWithFatorR: null,
      hasIssInSimples: false,
      allowsMunicipalBenefit: false,
    };
    const expectedLeftOut = "07";
    const actual = expectSuccess(await requestApi<SimplesActivityListResult>(path));
    const actualFirst = actual.data.items.at(0);
    const actualCodes = listActivityCodes(actual);
    const actualSortedCodes = actualCodes.toSorted();

    expect(actualFirst).toStrictEqual(expectedFirst);
    expect(actualCodes).toStrictEqual(actualSortedCodes);
    expect(actualCodes).not.toContain(expectedLeftOut);
  });

  it("lists nothing before the Simples calculation starts", async () => {
    const path = `${PATH}?date=2026-06-10&documentType=55`;

    const expected: string[] = [];
    const actual = listActivityCodes(
      expectSuccess(await requestApi<SimplesActivityListResult>(path)),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("answers 400 without a document type and with a malformed date", async () => {
    const path = `${PATH}?date=20270310`;

    const expectedStatus = 400;
    const expectedFields = ["date", "documentType"];
    const reply = await requestApi<SimplesActivityListResult>(path);
    const actualStatus = reply.status;
    const actualFields = expectFailure(reply).error.errors?.map((issue) => issue.field);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualFields).toStrictEqual(expectedFields);
  });
});
