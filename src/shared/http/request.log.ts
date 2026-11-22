// Structured log events of the API: one plain object per event, so Workers Logs indexes each field
// (docs/observability.md). No event carries the client address.

import type { Context } from "hono";
import { deriveTraceId, PROBLEM_CATALOG } from "./envelope.ts";

type LogLevel = "error" | "warn";

type LimiterName = "search" | "calculation";

type LogDetails = Record<string, string | number>;

interface RequestLogInput {
  level: LogLevel;
  event: string;
  status: number;
  details: LogDetails;
}

interface RateLimitedLog {
  limiterName: LimiterName;
  cost: number;
}

const UNHANDLED_ERROR_EVENT = "api.unhandled_error";
const RATE_LIMITED_EVENT = "api.rate_limited";

function logUnhandledError(context: Context, error: Error) {
  const details = {
    errorName: error.name,
    message: error.message,
    stack: error.stack ?? "",
  };

  writeRequestLog(context, {
    level: "error",
    event: UNHANDLED_ERROR_EVENT,
    status: PROBLEM_CATALOG.INTERNAL.status,
    details,
  });
}

function logRateLimited(context: Context, refusal: RateLimitedLog) {
  const { limiterName, cost } = refusal;

  writeRequestLog(context, {
    level: "warn",
    event: RATE_LIMITED_EVENT,
    status: PROBLEM_CATALOG.RATE_LIMITED.status,
    details: { limiter: limiterName, cost },
  });
}

// why: console is read at call time, never captured, so a test spy on console.error sees the event.
function writeRequestLog(context: Context, input: RequestLogInput) {
  const { level, event, status, details } = input;
  const logEntry = {
    level,
    event,
    traceId: deriveTraceId(context.req.raw),
    method: context.req.method,
    path: context.req.path,
    status,
    ...details,
  };

  if (level === "error") {
    console.error(logEntry);
    return;
  }

  console.warn(logEntry);
}

export type { LimiterName };
export { logRateLimited, logUnhandledError };
