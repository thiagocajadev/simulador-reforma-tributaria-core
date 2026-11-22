import { afterEach, describe, expect, it, vi } from "vitest";
import { requestApi } from "./api.client.ts";
import type { ErrorEnvelope, SuccessEnvelope } from "./envelope.ts";

const TRACE_ID = "8f3a1c2b4d5e6f70-GRU";

function stubFetchWith(body: unknown, status: number) {
  const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

describe("requestApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the body as JSON and returns the payload", async () => {
    const successBody: SuccessEnvelope<{ total: string }> = {
      ok: true,
      meta: { action: "calculations.create", traceId: TRACE_ID },
      data: { total: "4.80" },
    };
    const fetchStub = stubFetchWith(successBody, 200);

    const expectedResult = { isSuccess: true, value: { total: "4.80" } };
    const expectedInit = {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"uf":"RS"}',
    };
    const actualResult = await requestApi("/api/calculations", {
      method: "POST",
      body: { uf: "RS" },
    });
    const actualInit = fetchStub.mock.calls[0]?.[1];

    expect(actualResult).toStrictEqual(expectedResult);
    expect(actualInit).toStrictEqual(expectedInit);
  });

  it("carries the validation issues of a 400 into the failure", async () => {
    const issues = [{ field: "items[0].baseAmount", message: "Must be a decimal string." }];
    const errorBody: ErrorEnvelope = {
      ok: false,
      meta: { action: "calculations.create", traceId: TRACE_ID, timestamp: "2026-11-21T12:00:00Z" },
      error: {
        type: "/problems/invalid-input",
        title: "Invalid input",
        status: 400,
        detail: "Fix the invalid fields: items[0].baseAmount.",
        instance: "/api/calculations",
        code: "INVALID_INPUT",
        errors: issues,
      },
    };
    stubFetchWith(errorBody, 400);

    const expected = {
      isSuccess: false,
      failure: { code: "INVALID_INPUT", traceId: TRACE_ID, issues },
    };
    const actual = await requestApi("/api/calculations", { method: "POST", body: {} });

    expect(actual).toStrictEqual(expected);
  });
});
