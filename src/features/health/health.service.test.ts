import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEnvelope, SuccessEnvelope } from "@/shared/http/envelope.ts";
import type { HealthReport } from "./health.dto.ts";
import { fetchHealthView } from "./health.service.ts";

function stubFetchWith(body: unknown, status: number) {
  const response = new Response(JSON.stringify(body), { status });

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("fetchHealthView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a healthy API answer to the view with its version", async () => {
    const healthyBody: SuccessEnvelope<HealthReport> = {
      ok: true,
      meta: { action: "health.read", traceId: "8f3a1c2b4d5e6f70-GRU" },
      data: { status: "ok", version: "0.1.0" },
    };
    stubFetchWith(healthyBody, 200);

    const expected = { isSuccess: true, value: { version: "0.1.0" } };
    const actual = await fetchHealthView();

    expect(actual).toStrictEqual(expected);
  });

  it("returns the problem code and traceId when the API answers with an error", async () => {
    const traceId = "8f3a1c2b4d5e6f70-GRU";
    const errorBody: ErrorEnvelope = {
      ok: false,
      meta: { action: "request.process", traceId, timestamp: "2026-11-20T12:00:00.000Z" },
      error: {
        type: "/problems/internal",
        title: "Internal error",
        status: 500,
        detail: "The request could not be processed.",
        instance: "/api/health",
        code: "INTERNAL",
      },
    };
    stubFetchWith(errorBody, 500);

    const expected = { isSuccess: false, failure: { code: "INTERNAL", traceId } };
    const actual = await fetchHealthView();

    expect(actual).toStrictEqual(expected);
  });

  it("returns a network failure when the request never reaches the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const expected = { isSuccess: false, failure: { code: "NETWORK", traceId: null } };
    const actual = await fetchHealthView();

    expect(actual).toStrictEqual(expected);
  });

  it("returns an unexpected-response failure when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html></html>", { status: 502 })),
    );

    const expected = { isSuccess: false, failure: { code: "UNEXPECTED_RESPONSE", traceId: null } };
    const actual = await fetchHealthView();

    expect(actual).toStrictEqual(expected);
  });

  it("returns an unexpected-response failure when the JSON is not an envelope", async () => {
    stubFetchWith({ status: "ok" }, 200);

    const expected = { isSuccess: false, failure: { code: "UNEXPECTED_RESPONSE", traceId: null } };
    const actual = await fetchHealthView();

    expect(actual).toStrictEqual(expected);
  });
});
