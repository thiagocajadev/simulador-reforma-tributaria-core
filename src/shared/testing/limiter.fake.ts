// A stand-in for a Workers rate limit binding in unit tests: it allows or refuses every call and
// records what each call charged.

import type { RequestLimiter } from "@/shared/http/rate.limit.ts";

interface LimiterCharge {
  key: string;
  delta?: number;
}

interface FakeLimiter extends RequestLimiter {
  charges: LimiterCharge[];
}

function createFakeLimiter(isAllowed: boolean) {
  const charges: LimiterCharge[] = [];
  const limiter: FakeLimiter = {
    charges,
    limit: async (options) => {
      charges.push(options);
      const outcome = { success: isAllowed };
      return outcome;
    },
  };
  return limiter;
}

export type { FakeLimiter };
export { createFakeLimiter };
