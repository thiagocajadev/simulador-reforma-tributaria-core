import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_ITEMS } from "@/features/calculations/calculation.request.ts";
import { expectFailure, expectSuccess, requestApi } from "@/shared/testing/api.request.ts";
import { postLargestCalculations } from "@/shared/testing/calculation.limit.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { completeWithinOneWindow, RATE_LIMIT_TEST_TIMEOUT } from "@/shared/testing/rate.window.ts";
import { calculateSimplesOperation } from "./operation.simples.ts";
import type { SimplesCalculationResult, SimplesOperation } from "./simples.dto.ts";

const PATH = "/api/simples-nacional-calculations";
const POST = "POST";
// why: measured at 550 to 640 rows per item with the calculation indexes, 2026-11-21.
const MAX_ROWS_READ_PER_ITEM = 800;

const RESALE_ITEM = {
  itemNumber: 1,
  activityCode: "01",
  cClassTrib: "000001",
  ncmCode: "22030000",
  baseAmount: "1000.00",
  selectiveTaxAmount: "0.00",
  cbsSimplesRate: "2.3591",
  ibsSimplesRate: "0.0260",
};

const OPERATION = {
  taxEventDate: "2027-03-10",
  documentType: 55,
  crt: 1,
  items: [RESALE_ITEM],
};

const CONSULTING_ITEM = {
  itemNumber: 1,
  activityCode: "07",
  cClassTrib: "000001",
  nbsCode: "114011100",
  baseAmount: "10000.00",
  issTaxation: 1,
  issWithholding: 2,
};

const NFSE_OPERATION = {
  taxEventDate: "2027-03-10",
  documentType: 91,
  simplesOption: 3,
  ibsCbsAssessmentRegime: 1,
  simplesTaxesAssessmentRegime: 1,
  effectiveRates: {
    isFatorRAtLeast28: false,
    annexIII: {
      cbsSimplesRate: "2.3874",
      ibsSimplesRate: "0.0263",
      withoutIssRedistribution: { cbsSimplesRate: "2.1012", ibsSimplesRate: "0.0231" },
    },
  },
  items: [CONSULTING_ITEM],
};

function postOperation(body: unknown, clientAddress?: string) {
  const reply = requestApi<SimplesCalculationResult>(PATH, { method: POST, body, clientAddress });
  return reply;
}

describe("POST /api/simples-nacional-calculations", () => {
  beforeAll(seedOpenData);

  it("calculates a resale item at the Simples effective rates", async () => {
    const body = OPERATION;

    const expectedItem = {
      itemNumber: 1,
      status: "calculated",
      grossRevenue: "1000.00",
      revenueType: { code: 1, description: "Receita bruta - interna" },
      baseAmount: "1000.00",
      cbs: { rate: "2.3591", dueAmount: "23.59", pendingAmount: "0.00" },
      ibs: { rate: "0.026", dueAmount: "0.26", pendingAmount: "0.00" },
      selectiveTaxAmount: "0.00",
      itemTotal: "23.85",
    };
    const expectedAction = "simplesNacionalCalculations.calculate";
    const actual = expectSuccess(await postOperation(body));
    const actualItem = actual.data.items.at(0);
    const actualAction = actual.meta.action;

    expect(actualItem).toMatchObject(expectedItem);
    expect(actualAction).toBe(expectedAction);
  });

  it("answers 200 with the codes of a rejected item, next to a calculated one", async () => {
    const body = {
      ...OPERATION,
      items: [RESALE_ITEM, { ...RESALE_ITEM, itemNumber: 2, cbsSimplesRate: undefined }],
    };

    const expectedStatus = 200;
    const expectedStatuses = ["calculated", "rejected"];
    const expectedViolation = { ruleCode: "VSN-004", field: "items[1].cbsSimplesRate" };
    const reply = await postOperation(body);
    const actualItems = expectSuccess(reply).data.items;
    const actualStatuses = actualItems.map((result) => result.status);
    const rejected = actualItems.at(1);
    const actualViolation =
      rejected?.status === "rejected"
        ? { ruleCode: rejected.violations[0]?.ruleCode, field: rejected.violations[0]?.field }
        : rejected;
    const actualStatus = reply.status;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualStatuses).toStrictEqual(expectedStatuses);
    expect(actualViolation).toStrictEqual(expectedViolation);
  });

  it("answers items in number order and trims the codes it looks up, as upstream", async () => {
    const body = {
      ...OPERATION,
      items: [
        { ...RESALE_ITEM, itemNumber: 2, activityCode: " 01 ", cClassTrib: "000001 " },
        RESALE_ITEM,
      ],
    };

    const expected = [
      [1, "calculated"],
      [2, "calculated"],
    ];
    const actual = expectSuccess(await postOperation(body)).data.items.map((result) => [
      result.itemNumber,
      result.status,
    ]);

    expect(actual).toStrictEqual(expected);
  });

  it("lists every invalid field in a 400", async () => {
    const body = { ...OPERATION, taxEventDate: "10/03/2027", crt: 9, items: [] };

    const expectedStatus = 400;
    const expectedCode = "INVALID_INPUT";
    const expectedFields = ["taxEventDate", "crt", "items"];
    const reply = await postOperation(body);
    const actualError = expectFailure(reply).error;
    const actualFields = actualError.errors?.map((issue) => issue.field);
    const actualCode = actualError.code;
    const actualStatus = reply.status;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCode).toBe(expectedCode);
    expect(actualFields).toStrictEqual(expectedFields);
  });

  it("refuses malformed JSON, a 2026 date and the MEI as operation issues", async () => {
    const bodies = [
      "{ not json",
      { ...OPERATION, taxEventDate: "2026-06-10" },
      { ...OPERATION, crt: 4 },
    ];

    const expected = [
      [400, "body"],
      [400, "documentType"],
      [400, "crt"],
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
    "shares the 60 items a minute with the regular regime, charging its own items",
    async () => {
      const largestBody = {
        ...OPERATION,
        items: Array.from({ length: MAX_ITEMS }, (_entry, position) => ({
          ...RESALE_ITEM,
          itemNumber: position + 1,
        })),
      };

      const expected = {
        regularStatuses: [200, 200],
        simplesStatus: 200,
        refusedStatus: 429,
        refusedCode: "RATE_LIMITED",
      };
      const actual = await completeWithinOneWindow(async (clientAddress) => {
        const regularStatuses = await postLargestCalculations({ clientAddress, postCount: 2 });
        const served = await postOperation(largestBody, clientAddress);
        const refused = await postOperation(OPERATION, clientAddress);
        const outcome = {
          regularStatuses,
          simplesStatus: served.status,
          refusedStatus: refused.status,
          refusedCode: expectFailure(refused).error.code,
        };
        return outcome;
      });

      expect(actual).toStrictEqual(expected);
    },
    RATE_LIMIT_TEST_TIMEOUT,
  );

  it("calculates an NFS-e item with the pair its ISS situation picks, at 2-place rates", async () => {
    const body = NFSE_OPERATION;

    const expectedItem = {
      itemNumber: 1,
      status: "calculated",
      grossRevenue: "10000.00",
      revenueType: { code: 1, description: "Receita bruta - interna" },
      baseAmount: "10000.00",
      cbs: { rate: "2.10", dueAmount: "210.00", pendingAmount: "0.00" },
      ibs: { rate: "0.02", dueAmount: "2.00", pendingAmount: "0.00" },
      selectiveTaxAmount: null,
      itemTotal: "212.00",
    };
    const actualItem = expectSuccess(await postOperation(body)).data.items.at(0);

    expect(actualItem).toMatchObject(expectedItem);
  });

  it("rejects an NFS-e item whose chosen pair lacks a rate, pointing inside the line", async () => {
    const body = {
      ...NFSE_OPERATION,
      effectiveRates: {
        annexIII: {
          cbsSimplesRate: "2.3874",
          ibsSimplesRate: "0.0263",
          withoutIssRedistribution: { ibsSimplesRate: "0.0231" },
        },
      },
    };

    const expected = {
      status: "rejected",
      violations: [
        {
          ruleCode: "VSN-004",
          field: "effectiveRates.annexIII.withoutIssRedistribution.cbsSimplesRate",
        },
      ],
    };
    const rejected = expectSuccess(await postOperation(body)).data.items.at(0);
    const actual =
      rejected?.status === "rejected"
        ? {
            status: rejected.status,
            violations: rejected.violations.map(({ ruleCode, field }) => ({ ruleCode, field })),
          }
        : rejected;

    expect(actual).toStrictEqual(expected);
  });

  it("refuses the fields of the other document family", async () => {
    const bodies = [
      { ...NFSE_OPERATION, crt: 1, items: [{ ...CONSULTING_ITEM, cbsSimplesRate: "2.3874" }] },
      { ...OPERATION, simplesOption: 3, effectiveRates: NFSE_OPERATION.effectiveRates },
    ];

    const expected = [
      ["crt", "items[0].cbsSimplesRate"],
      ["simplesOption", "effectiveRates"],
    ];
    const actual = await Promise.all(
      bodies.map(async (body) => {
        const reply = await postOperation(body);
        const fields = expectFailure(reply).error.errors?.map((issue) => issue.field);
        return fields;
      }),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("reads a bounded number of D1 rows for the largest operation", async () => {
    const operation: SimplesOperation = {
      ...OPERATION,
      items: Array.from({ length: MAX_ITEMS }, (_entry, position) => ({
        ...RESALE_ITEM,
        itemNumber: position + 1,
        cClassTrib: "550001",
      })),
    };

    const expectedMaximum = MAX_ROWS_READ_PER_ITEM * MAX_ITEMS;
    const outcome = await calculateSimplesOperation(env.OPEN_DATA, operation);
    const actualRowsRead = outcome.kind === "calculated" ? outcome.rowsRead : Infinity;

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });
});
