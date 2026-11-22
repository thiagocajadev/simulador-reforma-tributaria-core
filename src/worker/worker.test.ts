import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEnvelope } from "@/shared/http/envelope.ts";
import { createFakeLimiter, type FakeLimiter } from "@/shared/testing/limiter.fake.ts";
import { createApiApp } from "./index.ts";

interface FakeLimiterBindings {
  SEARCH_RATE_LIMITER: FakeLimiter;
  CALCULATION_RATE_LIMITER: FakeLimiter;
}

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SEARCH_PATHS = [
  "/api/ncm",
  "/api/nbs",
  "/api/classifications",
  "/api/cst",
  "/api/municipalities",
  "/api/rates",
  "/api/simples-nacional-activities",
  "/api/classifications/selective-tax",
];

// why: a refused request never reaches D1, so the app answers without a database binding.
function createRefusingBindings() {
  const bindings: FakeLimiterBindings = {
    SEARCH_RATE_LIMITER: createFakeLimiter(false),
    CALCULATION_RATE_LIMITER: createFakeLimiter(false),
  };
  return bindings;
}

function readCharges(bindings: FakeLimiterBindings) {
  const charges = {
    search: bindings.SEARCH_RATE_LIMITER.charges,
    calculation: bindings.CALCULATION_RATE_LIMITER.charges,
  };
  return charges;
}

describe("API app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers an unknown API route with a 404 problem envelope", async () => {
    const app = createApiApp();
    const traceId = "8f3a1c2b4d5e6f70-GRU";

    const expectedStatus = 404;
    const expectedKeys = ["ok", "meta", "error"];
    const expectedAction = "route.resolve";
    const expectedError = {
      type: "/problems/not-found",
      title: "Resource not found",
      status: expectedStatus,
      detail: "No API route matches GET /api/missing",
      instance: "/api/missing",
      code: "NOT_FOUND",
    };
    const actual = await app.request("/api/missing", { headers: { "cf-ray": traceId } });
    const actualStatus = actual.status;
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualKeys = Object.keys(actualBody);
    const actualOk = actualBody.ok;
    const actualAction = actualBody.meta.action;
    const actualTraceId = actualBody.meta.traceId;
    const actualTimestamp = actualBody.meta.timestamp;
    const actualError = actualBody.error;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualKeys).toStrictEqual(expectedKeys);
    expect(actualOk).toBe(false);
    expect(actualAction).toBe(expectedAction);
    expect(actualTraceId).toBe(traceId);
    expect(actualTimestamp).toMatch(UTC_TIMESTAMP_PATTERN);
    expect(actualError).toStrictEqual(expectedError);
  });

  it("sends the security headers on every API answer, a 404 included", async () => {
    const app = createApiApp();

    const expectedHeaders = {
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    };
    const actual = await app.request("/api/missing");
    const actualHeaders = Object.fromEntries(
      Object.keys(expectedHeaders).map((name) => [name, actual.headers.get(name)]),
    );

    expect(actualHeaders).toStrictEqual(expectedHeaders);
  });

  it("answers an unhandled error with a 500 problem envelope and no internals", async () => {
    const app = createApiApp();
    const internalMessage = "database password leaked in stack";

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    app.get("/api/failing", () => {
      throw new Error(internalMessage);
    });

    const expectedStatus = 500;
    const expectedCode = "INTERNAL";
    const actual = await app.request("/api/failing");
    const actualStatus = actual.status;
    const actualText = await actual.text();
    const actualBody = JSON.parse(actualText) as ErrorEnvelope;
    const actualCode = actualBody.error.code;
    const actualErrorStatus = actualBody.error.status;
    const actualLeaksMessage = actualText.includes(internalMessage);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualErrorStatus).toBe(expectedStatus);
    expect(actualCode).toBe(expectedCode);
    expect(actualLeaksMessage).toBe(false);
  });

  it("logs an unhandled error once, with the traceId the client receives", async () => {
    const app = createApiApp();
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    app.get("/api/failing", () => {
      throw new TypeError("row is undefined");
    });

    const expectedEvent = {
      level: "error",
      event: "api.unhandled_error",
      traceId: "ray-500",
      method: "GET",
      path: "/api/failing",
      status: 500,
      errorName: "TypeError",
      message: "row is undefined",
    };
    const actual = await app.request("/api/failing", { headers: { "cf-ray": "ray-500" } });
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualEvents = logError.mock.calls.map(([logEntry]) => logEntry);
    const [actualEvent] = actualEvents;
    const { stack: actualStack, ...actualFields } = actualEvent as Record<string, unknown>;
    const actualResponseTraceId = actualBody.meta.traceId;
    const actualHasStack = String(actualStack).includes("TypeError");

    expect(actualEvents).toHaveLength(1);
    expect(actualFields).toStrictEqual(expectedEvent);
    expect(actualResponseTraceId).toBe(expectedEvent.traceId);
    expect(actualHasStack).toBe(true);
  });

  it("logs the same drawn traceId the client receives when cf-ray is missing", async () => {
    const app = createApiApp();
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    app.get("/api/failing", () => {
      throw new Error("no edge header");
    });

    const actual = await app.request("/api/failing");
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualEvent = logError.mock.calls.at(0)?.at(0);
    const expectedTraceId = actualBody.meta.traceId;
    const actualTraceId = (actualEvent as { traceId: string }).traceId;

    expect(actualTraceId).toBe(expectedTraceId);
  });

  it("logs nothing for a 400 or a 404", async () => {
    const app = createApiApp();
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logWarning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    app.get("/api/rejecting", () => {
      throw new HTTPException(400, { message: "Malformed JSON in request body" });
    });

    const expectedCallCount = 0;
    await app.request("/api/rejecting");
    await app.request("/api/unknown");
    const actualCallCount = logError.mock.calls.length + logWarning.mock.calls.length;

    expect(actualCallCount).toBe(expectedCallCount);
  });

  it("keeps the 400 of an HTTPException instead of turning it into a 500", async () => {
    const app = createApiApp();
    const clientMessage = "Malformed JSON in request body";

    app.get("/api/rejecting", () => {
      throw new HTTPException(400, { message: clientMessage });
    });

    const expectedStatus = 400;
    const expectedError = {
      type: "/problems/invalid-input",
      title: "Invalid input",
      status: expectedStatus,
      detail: clientMessage,
      instance: "/api/rejecting",
      code: "INVALID_INPUT",
    };
    const actual = await app.request("/api/rejecting");
    const actualStatus = actual.status;
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualError = actualBody.error;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualError).toStrictEqual(expectedError);
  });

  it("keeps the 405 and the 413 an HTTPException raises, each with its own code", async () => {
    const app = createApiApp();

    app.get("/api/method-rejecting", () => {
      throw new HTTPException(405);
    });
    app.get("/api/size-rejecting", () => {
      throw new HTTPException(413);
    });

    const expected = [
      { status: 405, code: "METHOD_NOT_ALLOWED", detail: "Method not allowed" },
      { status: 413, code: "PAYLOAD_TOO_LARGE", detail: "Payload too large" },
    ];
    const actual = await Promise.all(
      ["/api/method-rejecting", "/api/size-rejecting"].map(async (path) => {
        const response = await app.request(path);
        const body = (await response.json()) as ErrorEnvelope;
        const outcome = {
          status: response.status,
          code: body.error.code,
          detail: body.error.detail,
        };
        return outcome;
      }),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("still answers 500 for an HTTPException status the catalog does not know", async () => {
    const app = createApiApp();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    app.get("/api/teapot", () => {
      throw new HTTPException(418, { message: "short and stout" });
    });

    const expectedStatus = 500;
    const actual = await app.request("/api/teapot");
    const actualStatus = actual.status;

    expect(actualStatus).toBe(expectedStatus);
  });

  it("replaces a cf-ray header that is not a plain identifier", async () => {
    const app = createApiApp();
    const forgedTraceId = "<script>alert(1)</script>";

    const actual = await app.request("/api/missing", { headers: { "cf-ray": forgedTraceId } });
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualTraceId = actualBody.meta.traceId;

    expect(actualTraceId).not.toBe(forgedTraceId);
  });
});

describe("API app rate limits", () => {
  it.each(SEARCH_PATHS)("charges %s to the search limiter and refuses it", async (searchPath) => {
    const app = createApiApp();
    const bindings = createRefusingBindings();

    const expectedStatus = 429;
    const expectedCharges = { search: [{ key: "local", delta: 1 }], calculation: [] };
    const actual = await app.request(searchPath, {}, bindings);
    const actualStatus = actual.status;
    const actualCharges = readCharges(bindings);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCharges).toStrictEqual(expectedCharges);
  });

  it("charges an indicators lookup 1 to the calculation limiter and refuses it", async () => {
    const app = createApiApp();
    const bindings = createRefusingBindings();

    const expectedStatus = 429;
    const expectedCharges = { search: [], calculation: [{ key: "local", delta: 1 }] };
    const actual = await app.request("/api/operation-indicators", {}, bindings);
    const actualStatus = actual.status;
    const actualCharges = readCharges(bindings);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCharges).toStrictEqual(expectedCharges);
  });

  it("serves /api/health without charging either limiter", async () => {
    const app = createApiApp();
    const bindings = createRefusingBindings();

    const expectedStatus = 200;
    const expectedCharges = { search: [], calculation: [] };
    const actual = await app.request("/api/health", {}, bindings);
    const actualStatus = actual.status;
    const actualCharges = readCharges(bindings);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualCharges).toStrictEqual(expectedCharges);
  });
});
