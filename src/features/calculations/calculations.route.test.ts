import { beforeAll, describe, expect, it } from "vitest";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { LARGEST_OPERATION, postLargestCalculations } from "@/shared/testing/calculation.limit.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { completeWithinOneWindow, RATE_LIMIT_TEST_TIMEOUT } from "@/shared/testing/rate.window.ts";
import type { CalculationResult } from "./calculation.dto.ts";

const PATH = "/api/calculations";
const POST = "POST";

const BASIC_FOOD_ITEM = {
  itemNumber: 1,
  ncmCode: "10063021",
  cstCode: "200",
  cClassTrib: "200003",
  baseAmount: "100.00",
};

const OPERATION = {
  taxEventDate: "2026-03-10T10:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 55,
  items: [BASIC_FOOD_ITEM],
};

function postOperation(body: unknown, clientAddress?: string) {
  const reply = requestApi<CalculationResult>(PATH, { method: POST, body, clientAddress });
  return reply;
}

describe("POST /api/calculations", () => {
  beforeAll(seedOpenData);

  it("calculates a basic food basket item with its 100% reduction", async () => {
    const body = OPERATION;

    const expectedTaxes = {
      baseAmount: "100.00",
      cbs: { rate: "0.90", reductionPercent: "100.00", effectiveRate: "0.00", amount: "0.00" },
      ibsUf: { rate: "0.10", reductionPercent: "100.00", effectiveRate: "0.00", amount: "0.00" },
      ibsMun: { rate: "0.00", reductionPercent: "100.00", effectiveRate: "0.00", amount: "0.00" },
      ibsAmount: "0.00",
    };
    const expectedSteps = ["rate", "effectiveRate", "base", "calculatedTax", "taxDue"];
    const expectedReduction = { percentualReducao: "1" };
    const expectedAction = "calculations.calculate";
    const actual = expectSuccess(await postOperation(body));
    const [actualItem] = actual.data.items;
    const actualTaxes = actualItem && "taxes" in actualItem ? actualItem.taxes : undefined;
    const actualCbsSteps = actualTaxes?.cbs.calculationSteps ?? [];
    const actualSteps = actualCbsSteps.map((calculationStep) => calculationStep.step);
    const actualReduction = actualCbsSteps.at(1)?.values;
    const actualAction = actual.meta.action;

    expect(actualTaxes).toMatchObject(expectedTaxes);
    expect(actualSteps).toStrictEqual(expectedSteps);
    expect(actualReduction).toMatchObject(expectedReduction);
    expect(actualAction).toBe(expectedAction);
  });

  it("answers 200 with the rule an item breaks", async () => {
    const body = {
      ...OPERATION,
      items: [{ ...BASIC_FOOD_ITEM, ncmCode: "02013000", cClassTrib: "200035" }],
    };

    const expectedStatus = 200;
    const expectedViolation = { ruleCode: "REG-011", field: "items[0].ncmCode" };
    const reply = await postOperation(body);
    const [actualItem] = expectSuccess(reply).data.items;
    const actualViolation =
      actualItem?.status === "rejected"
        ? { ruleCode: actualItem.violations[0]?.ruleCode, field: actualItem.violations[0]?.field }
        : actualItem;
    const actualStatus = reply.status;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualViolation).toStrictEqual(expectedViolation);
  });

  it("lists every invalid field in a 400", async () => {
    const body = { ...OPERATION, uf: "Rio Grande do Sul", items: [] };

    const expectedStatus = 400;
    const expectedCode = "INVALID_INPUT";
    const expectedFields = ["uf", "items"];
    const reply = await postOperation(body);
    const actualError = expectFailure(reply).error;
    const actualFields = actualError.errors?.map((issue) => issue.field);
    const actualCode = actualError.code;
    const actualStatus = reply.status;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCode).toBe(expectedCode);
    expect(actualFields).toStrictEqual(expectedFields);
  });

  it("refuses malformed JSON, an unknown document type and a misplaced municipality", async () => {
    const bodies = [
      "{ not json",
      { ...OPERATION, documentType: 99 },
      { ...OPERATION, municipalityCode: 3550308 },
    ];

    const expected = [
      [400, "body"],
      [400, "documentType"],
      [400, "municipalityCode"],
    ];
    const actual = await Promise.all(
      bodies.map(async (body) => {
        const reply = await postOperation(body);
        const field = expectFailure(reply).error.errors?.at(0)?.field;
        const outcome = [reply.status, field];
        return outcome;
      }),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("refuses a body above the size cap", async () => {
    const body = { ...OPERATION, padding: "x".repeat(40 * 1024) };

    const expected = [400, "body"];
    const reply = await postOperation(body);
    const actual = [reply.status, expectFailure(reply).error.errors?.at(0)?.field];

    expect(actual).toStrictEqual(expected);
  });

  it(
    "answers 429 once an address calculated 60 items in a minute, charging no invalid body",
    async () => {
      const invalidLargestBody = { ...LARGEST_OPERATION, uf: "Rio Grande do Sul" };

      const expected = {
        invalidBodyStatus: 400,
        servedStatuses: [200, 200, 200],
        refusedStatus: 429,
        refusedCode: "RATE_LIMITED",
        invalidBodyPastLimitStatus: 400,
      };
      const actual = await completeWithinOneWindow(async (clientAddress) => {
        const invalidBody = await postOperation(invalidLargestBody, clientAddress);
        const servedStatuses = await postLargestCalculations({ clientAddress, postCount: 3 });
        const refused = await postOperation(OPERATION, clientAddress);
        const invalidBodyPastLimit = await postOperation(invalidLargestBody, clientAddress);
        const outcome = {
          invalidBodyStatus: invalidBody.status,
          servedStatuses,
          refusedStatus: refused.status,
          refusedCode: expectFailure(refused).error.code,
          invalidBodyPastLimitStatus: invalidBodyPastLimit.status,
        };
        return outcome;
      });

      expect(actual).toStrictEqual(expected);
    },
    RATE_LIMIT_TEST_TIMEOUT,
  );
});
