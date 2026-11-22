// Error responses the routes send themselves, as opposed to the ones the app-level handlers send.

import type { Context } from "hono";
import { createErrorEnvelope, deriveTraceId, type ValidationIssue } from "./envelope.ts";

interface InvalidInputResponse {
  action: string;
  issues: ValidationIssue[];
}

interface RateLimitedResponse {
  retryAfterSeconds: number;
}

const INVALID_INPUT_STATUS = 400;
const RATE_LIMITED_STATUS = 429;
const RATE_LIMITED_ACTION = "request.throttle";
const RETRY_AFTER_HEADER = "Retry-After";

function respondInvalidInput(context: Context, input: InvalidInputResponse) {
  const { action, issues } = input;
  const fieldNames = issues.map((issue) => issue.field).join(", ");
  const envelope = createErrorEnvelope({
    action,
    traceId: deriveTraceId(context.req.raw),
    code: "INVALID_INPUT",
    detail: `Fix the invalid fields: ${fieldNames}.`,
    instance: context.req.path,
    errors: issues,
  });
  const response = context.json(envelope, INVALID_INPUT_STATUS);
  return response;
}

function respondRateLimited(context: Context, input: RateLimitedResponse) {
  const { retryAfterSeconds } = input;
  const envelope = createErrorEnvelope({
    action: RATE_LIMITED_ACTION,
    traceId: deriveTraceId(context.req.raw),
    code: "RATE_LIMITED",
    detail: `Too many requests from this address. Retry in ${retryAfterSeconds} seconds.`,
    instance: context.req.path,
  });
  const headers = { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) };
  const response = context.json(envelope, RATE_LIMITED_STATUS, headers);
  return response;
}

export { respondInvalidInput, respondRateLimited };
