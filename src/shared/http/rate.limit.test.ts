import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeLimiter } from "@/shared/testing/limiter.fake.ts";
import type { ErrorEnvelope } from "./envelope.ts";
import {
  deriveClientKey,
  limitRequests,
  type RequestLimiter,
  throttleRequest,
} from "./rate.limit.ts";

interface FakeBindings {
  LIMITER: RequestLimiter;
}

const CLIENT_ADDRESS = "203.0.113.7";
const SERVED_TEXT = "served";
const WEIGHTED_COST = 20;

function createLimitedApp() {
  const app = new Hono<{ Bindings: FakeBindings }>();

  app.use(
    "/flat",
    limitRequests<FakeBindings>("search", (bindings) => bindings.LIMITER),
  );
  app.get("/flat", (context) => context.text(SERVED_TEXT));
  app.get("/weighted", async (context) => {
    const refusal = await throttleRequest(context, {
      limiter: context.env.LIMITER,
      limiterName: "calculation",
      cost: WEIGHTED_COST,
    });
    const response = refusal ?? context.text(SERVED_TEXT);
    return response;
  });

  return app;
}

function requestFrom(address: string) {
  const init = { headers: { "cf-connecting-ip": address } };
  return init;
}

describe("limitRequests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves a request the limiter allows and charges 1 to the client address", async () => {
    const limiter = createFakeLimiter(true);
    const app = createLimitedApp();

    const expectedText = SERVED_TEXT;
    const expectedCharges = [{ key: CLIENT_ADDRESS, delta: 1 }];
    const actual = await app.request("/flat", requestFrom(CLIENT_ADDRESS), { LIMITER: limiter });
    const actualText = await actual.text();
    const actualCharges = limiter.charges;

    expect(actualText).toBe(expectedText);
    expect(actualCharges).toStrictEqual(expectedCharges);
  });

  it("answers 429 with the problem envelope and Retry-After when the limiter refuses", async () => {
    const limiter = createFakeLimiter(false);
    const app = createLimitedApp();

    const expectedStatus = 429;
    const expectedRetryAfter = "60";
    const expectedKeys = ["ok", "meta", "error"];
    const expectedAction = "request.throttle";
    const expectedError = {
      type: "/problems/rate-limited",
      title: "Too many requests",
      status: expectedStatus,
      detail: "Too many requests from this address. Retry in 60 seconds.",
      instance: "/flat",
      code: "RATE_LIMITED",
    };
    const actual = await app.request("/flat", requestFrom(CLIENT_ADDRESS), { LIMITER: limiter });
    const actualStatus = actual.status;
    const actualRetryAfter = actual.headers.get("Retry-After");
    const actualBody = (await actual.json()) as ErrorEnvelope;
    const actualKeys = Object.keys(actualBody);
    const actualAction = actualBody.meta.action;
    const actualError = actualBody.error;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualRetryAfter).toBe(expectedRetryAfter);
    expect(actualKeys).toStrictEqual(expectedKeys);
    expect(actualAction).toBe(expectedAction);
    expect(actualError).toStrictEqual(expectedError);
  });

  it("fails closed: a limiter that throws, or a missing binding, serves nothing", async () => {
    const throwingLimiter: RequestLimiter = {
      limit: async () => {
        throw new Error("limiter unavailable");
      },
    };
    const app = createLimitedApp();

    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const expectedStatuses = [500, 500];
    const expectedIsServed = false;
    const thrown = await app.request("/flat", requestFrom(CLIENT_ADDRESS), {
      LIMITER: throwingLimiter,
    });
    const unbound = await app.request("/flat", requestFrom(CLIENT_ADDRESS), {});
    const actualStatuses = [thrown.status, unbound.status];
    const actualTexts = [await thrown.text(), await unbound.text()];
    const actualIsServed = actualTexts.includes(SERVED_TEXT);

    expect(actualStatuses).toStrictEqual(expectedStatuses);
    expect(actualIsServed).toBe(expectedIsServed);
  });
});

describe("throttleRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a refusal as one api.rate_limited warning, without the client address", async () => {
    const limiter = createFakeLimiter(false);
    const app = createLimitedApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const expectedEvent = {
      level: "warn",
      event: "api.rate_limited",
      traceId: "ray-429",
      method: "GET",
      path: "/weighted",
      status: 429,
      limiter: "calculation",
      cost: WEIGHTED_COST,
    };
    const expectedLeaksAddress = false;
    await app.request(
      "/weighted",
      { headers: { "cf-connecting-ip": CLIENT_ADDRESS, "cf-ray": "ray-429" } },
      { LIMITER: limiter },
    );
    const actualEvents = warn.mock.calls.map(([logEntry]) => logEntry);
    const actualLeaksAddress = JSON.stringify(actualEvents).includes(CLIENT_ADDRESS);

    expect(actualEvents).toStrictEqual([expectedEvent]);
    expect(actualLeaksAddress).toBe(expectedLeaksAddress);
  });

  it("logs nothing for a request the limiter allows", async () => {
    const limiter = createFakeLimiter(true);
    const app = createLimitedApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const expectedCallCount = 0;
    await app.request("/flat", requestFrom(CLIENT_ADDRESS), { LIMITER: limiter });
    const actualCallCount = warn.mock.calls.length;

    expect(actualCallCount).toBe(expectedCallCount);
  });

  it("charges the cost it is given", async () => {
    const limiter = createFakeLimiter(true);
    const app = createLimitedApp();

    const expectedCharges = [{ key: CLIENT_ADDRESS, delta: WEIGHTED_COST }];
    await app.request("/weighted", requestFrom(CLIENT_ADDRESS), { LIMITER: limiter });
    const actualCharges = limiter.charges;

    expect(actualCharges).toStrictEqual(expectedCharges);
  });
});

describe("deriveClientKey", () => {
  it("keys a request by its cf-connecting-ip", () => {
    const request = new Request("https://simulator.test/api/ncm", requestFrom(CLIENT_ADDRESS));

    const expected = CLIENT_ADDRESS;
    const actual = deriveClientKey(request);

    expect(actual).toBe(expected);
  });

  it("keys IPv6 clients by their /64 network, whatever the notation", () => {
    const addresses = [
      "2001:db8:85a3:1:aaaa:bbbb:cccc:1",
      "2001:0DB8:85A3:0001:0000:0000:0000:0002",
      "2001:db8:85a3:1::3",
      "2001:db8::1",
      "::1",
    ];
    const requests = addresses.map(
      (address) => new Request("https://simulator.test/api/ncm", requestFrom(address)),
    );

    const expected = [
      "2001:db8:85a3:1::/64",
      "2001:db8:85a3:1::/64",
      "2001:db8:85a3:1::/64",
      "2001:db8:0:0::/64",
      "0:0:0:0::/64",
    ];
    const actual = requests.map(deriveClientKey);

    expect(actual).toStrictEqual(expected);
  });

  it("keys an IPv4-mapped IPv6 address by its IPv4 address", () => {
    const request = new Request(
      "https://simulator.test/api/ncm",
      requestFrom("::ffff:203.0.113.7"),
    );

    const expected = CLIENT_ADDRESS;
    const actual = deriveClientKey(request);

    expect(actual).toBe(expected);
  });

  it("keys a request without the header, or with a blank one, as local", () => {
    const requests = [
      new Request("https://simulator.test/api/ncm"),
      new Request("https://simulator.test/api/ncm", requestFrom("  ")),
    ];

    const expected = ["local", "local"];
    const actual = requests.map(deriveClientKey);

    expect(actual).toStrictEqual(expected);
  });
});
