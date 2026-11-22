import { beforeAll, describe, expect, it } from "vitest";
import { requestApi } from "@/shared/testing/api.request.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { CALCULATION_EXAMPLE, listApiOperations } from "./openapi.reference.ts";

const OK_STATUS = 200;

// why: a reference prints these addresses for people to paste; each must answer.
const GET_EXAMPLES = listApiOperations()
  .filter((operation) => operation.method === "GET")
  .map((operation) => ({ operationId: operation.operationId, example: operation.example }));

describe("the GET examples of the API reference", () => {
  beforeAll(seedOpenData);

  it.each(GET_EXAMPLES)("answers 200 with data for $operationId", async ({ example }) => {
    const reply = await requestApi<unknown>(example);
    const payload = (reply.body as { data?: { items?: unknown[]; serviceItems?: unknown[] } }).data;
    const entries = payload?.items ?? payload?.serviceItems;

    const expectedStatus = OK_STATUS;
    const actualStatus = reply.status;
    const actualHasData = entries === undefined || entries.length > 0;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualHasData).toBe(true);
  });

  it("calculates the curl example the page prints", async () => {
    const reply = await requestApi<{ items: Array<{ status: string }> }>("/api/calculations", {
      method: "POST",
      body: CALCULATION_EXAMPLE,
    });
    const statuses = reply.body.ok ? reply.body.data.items.map((item) => item.status) : [];

    const expectedStatus = OK_STATUS;
    const expectedStatuses = ["calculated"];
    const actualStatus = reply.status;
    const actualStatuses = statuses;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualStatuses).toStrictEqual(expectedStatuses);
  });
});
