// Calls the API app inside the Workers test runtime, with the seeded D1 binding, and returns the
// status with the parsed envelope. GET by default; a body goes as JSON.
// Each request comes from its own client address unless the test names one: the rate limiter
// counts per address and its counters outlive a test, so tests would throttle each other.

import { env } from "cloudflare:workers";
import type { Envelope, ErrorEnvelope, SuccessEnvelope } from "@/shared/http/envelope.ts";
import { createApiApp } from "@/worker/index.ts";

interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  clientAddress?: string;
}

interface ApiReply<Payload> {
  status: number;
  body: Envelope<Payload>;
}

const CLIENT_ADDRESS_HEADER = "cf-connecting-ip";

// why: a string body goes as it is, so a test can send malformed JSON.
async function requestApi<Payload>(path: string, options: ApiRequestOptions = {}) {
  const { method, body, clientAddress = crypto.randomUUID() } = options;
  const app = createApiApp();
  const addressHeader = { [CLIENT_ADDRESS_HEADER]: clientAddress };
  const init: RequestInit =
    body === undefined
      ? { method, headers: addressHeader }
      : {
          method,
          headers: { ...addressHeader, "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
  const response = await app.request(path, init, env);
  const envelope = (await response.json()) as Envelope<Payload>;
  const reply: ApiReply<Payload> = { status: response.status, body: envelope };
  return reply;
}

function expectSuccess<Payload>(reply: ApiReply<Payload>) {
  if (!reply.body.ok) {
    throw new Error(
      `Expected a success envelope, got ${reply.status}: ${JSON.stringify(reply.body)}`,
    );
  }

  const success: SuccessEnvelope<Payload> = reply.body;
  return success;
}

function expectFailure<Payload>(reply: ApiReply<Payload>) {
  if (reply.body.ok) {
    throw new Error(
      `Expected an error envelope, got ${reply.status}: ${JSON.stringify(reply.body)}`,
    );
  }

  const failure: ErrorEnvelope = reply.body;
  return failure;
}

export { expectFailure, expectSuccess, requestApi };
