import { describe, expect, it } from "vitest";
import type { SuccessEnvelope } from "@/shared/http/envelope.ts";
import { createApiApp } from "@/worker/index.ts";
import { version } from "../../../package.json";
import type { HealthReport } from "./health.dto.ts";

const OK_STATUS = 200;

describe("GET /api/health", () => {
  it("answers 200 with the success envelope and the app version", async () => {
    const app = createApiApp();
    const traceId = "8f3a1c2b4d5e6f70-GRU";

    const expectedStatus = 200;
    const expectedBody = {
      ok: true,
      meta: { action: "health.read", traceId },
      data: { status: "ok", version },
    };
    const actual = await app.request("/api/health", { headers: { "cf-ray": traceId } });
    const expectedKeys = ["ok", "meta", "data"];
    const actualStatus = actual.status;
    const actualBody = (await actual.json()) as SuccessEnvelope<HealthReport>;
    const actualKeys = Object.keys(actualBody);

    expect(actualStatus).toBe(expectedStatus);
    expect(actualBody).toStrictEqual(expectedBody);
    expect(actualKeys).toStrictEqual(expectedKeys);
  });

  it("generates a traceId when the request carries no cf-ray header", async () => {
    const app = createApiApp();

    const expectedTraceIdPattern = /^[0-9a-f-]{36}$/;
    const actual = await app.request("/api/health");
    const actualBody = (await actual.json()) as SuccessEnvelope<HealthReport>;
    const actualTraceId = actualBody.meta.traceId;

    expect(actualTraceId).toMatch(expectedTraceIdPattern);
  });

  it("answers every request of one address, since it is not rate limited", async () => {
    const app = createApiApp();
    const requestCount = 70;
    const init = { headers: { "cf-connecting-ip": "198.51.100.70" } };
    const statuses: number[] = [];

    for (let requestNumber = 0; requestNumber < requestCount; requestNumber += 1) {
      const reply = await app.request("/api/health", init);
      statuses.push(reply.status);
    }

    const expectedServedCount = requestCount;
    const actualServedCount = statuses.filter((status) => status === OK_STATUS).length;

    expect(actualServedCount).toBe(expectedServedCount);
  });
});
