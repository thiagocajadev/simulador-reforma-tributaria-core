// Throttles the public API per client with the Workers Rate Limiting bindings declared in
// wrangler.jsonc. A refused request answers 429 before it reads D1 (docs/rate-limiting.md).

import type { Context, MiddlewareHandler } from "hono";
import { respondRateLimited } from "./problem.respond.ts";
import { type LimiterName, logRateLimited } from "./request.log.ts";

// why: the Workers RateLimit shape, restated so the node project compiles this with a fake.
interface RequestLimiter {
  limit(options: { key: string; delta?: number }): Promise<{ success: boolean }>;
}

interface RequestCharge {
  limiter: RequestLimiter;
  limiterName: LimiterName;
  cost: number;
}

type LimiterSelector<Bindings> = (bindings: Bindings) => RequestLimiter;

const CLIENT_ADDRESS_HEADER = "cf-connecting-ip";
const LOCAL_CLIENT_KEY = "local";
const FLAT_COST = 1;
// why: a binding does not expose its window; this mirrors simple.period in wrangler.jsonc.
const WINDOW_SECONDS = 60;
const IPV6_GROUP_SEPARATOR = ":";
const IPV6_COMPRESSION = "::";
const IPV6_GROUP_COUNT = 8;
const IPV6_NETWORK_GROUP_COUNT = 4;
const HEXADECIMAL_RADIX = 16;
const IPV4_MAPPED_PATTERN = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function limitRequests<Bindings extends object>(
  limiterName: LimiterName,
  selectLimiter: LimiterSelector<Bindings>,
) {
  const middleware: MiddlewareHandler<{ Bindings: Bindings }> = async (context, next) => {
    const limiter = selectLimiter(context.env);
    const refusal = await throttleRequest(context, { limiter, limiterName, cost: FLAT_COST });

    if (refusal) {
      return refusal;
    }

    await next();
  };
  return middleware;
}

async function throttleRequest(context: Context, charge: RequestCharge) {
  const { limiter, limiterName, cost } = charge;
  const clientKey = deriveClientKey(context.req.raw);
  const { success: isAllowed } = await limiter.limit({ key: clientKey, delta: cost });

  if (isAllowed) {
    return null;
  }

  logRateLimited(context, { limiterName, cost });

  const refusal = respondRateLimited(context, { retryAfterSeconds: WINDOW_SECONDS });
  return refusal;
}

// why: Cloudflare's edge sets cf-connecting-ip; a request without it (a test) shares one key.
function deriveClientKey(request: Request) {
  const address = request.headers.get(CLIENT_ADDRESS_HEADER)?.trim();

  if (!address) {
    return LOCAL_CLIENT_KEY;
  }

  const isIpv6 = address.includes(IPV6_GROUP_SEPARATOR);
  const clientKey = isIpv6 ? deriveIpv6NetworkKey(address) : address;
  return clientKey;
}

// why: one IPv6 subscriber usually holds a whole /64, so a per-address key lets one client rotate past the limit.
function deriveIpv6NetworkKey(address: string) {
  const mappedIpv4 = IPV4_MAPPED_PATTERN.exec(address)?.at(1);

  if (mappedIpv4) {
    return mappedIpv4;
  }

  const groups = expandIpv6Groups(address.toLowerCase());
  const networkGroups = groups
    .slice(0, IPV6_NETWORK_GROUP_COUNT)
    .map((group) => Number.parseInt(group || "0", HEXADECIMAL_RADIX).toString(HEXADECIMAL_RADIX));
  const networkKey = `${networkGroups.join(IPV6_GROUP_SEPARATOR)}::/64`;
  return networkKey;
}

function expandIpv6Groups(address: string) {
  const [head = "", tail] = address.split(IPV6_COMPRESSION);
  const headGroups = head ? head.split(IPV6_GROUP_SEPARATOR) : [];

  if (tail === undefined) {
    return headGroups;
  }

  const tailGroups = tail ? tail.split(IPV6_GROUP_SEPARATOR) : [];
  const missingCount = Math.max(IPV6_GROUP_COUNT - headGroups.length - tailGroups.length, 0);
  const zeroGroups = Array.from({ length: missingCount }, () => "0");
  const groups = [...headGroups, ...zeroGroups, ...tailGroups];
  return groups;
}

export type { RequestLimiter };
export { deriveClientKey, limitRequests, throttleRequest };
