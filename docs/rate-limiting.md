# Rate limiting

The API has no login, and every search or calculation spends D1 reads from the Free plan's 5 million
a day. Two Workers Rate Limiting bindings cap how fast one client address spends them. This page
covers what is limited, what a refused client receives, how the code is wired, and what the limiter
does not protect.

## Fundamental concepts

| Concept | What it is |
| --- | --- |
| **Binding** | A Cloudflare resource the Worker reaches through `env`. Each rate limit binding holds one limit and one window, declared in `wrangler.jsonc`. |
| **Window** | The period a counter covers. Both bindings use 60 seconds, one of the two values Cloudflare allows (10 or 60). |
| **Client key** | What a counter is kept for. Here, the address in the `cf-connecting-ip` header: an IPv4 address as it comes, an IPv6 address by its /64 network (`2001:db8:85a3:1::/64`). |
| **Charge** | How much one request adds to its counter (the `delta` of the binding's `limit()` call). |

## Limits

| Group | Routes | Limit per address | Charge |
| --- | --- | --- | --- |
| Searches | `GET /api/ncm`, `/api/nbs`, `/api/classifications`, `/api/cst`, `/api/municipalities`, `/api/rates`, `/api/simples-nacional-activities`, `/api/classifications/selective-tax` | 60 a minute | 1 per request |
| Calculations | `POST /api/calculations`, `POST /api/simples-nacional-calculations`, `GET /api/operation-indicators` | 60 a minute | One per item of a calculation; 1 per indicators lookup |

- `/api/health` and unknown routes are not limited.
- A side-by-side simulation posts to both calculation routes, so its items count twice: 20 items
  charge 40, and a second 20-item comparison within the minute is refused at the Simples column.
- A request is allowed while its counter is below the limit, even when the charge takes the counter
  past it. Three 20-item calculations pass and the fourth request is refused. A refused request adds
  nothing to the counter.
- A calculation is charged after its body passes validation. A `400` for a malformed body charges
  nothing. A `400` that a D1 lookup finds (an unknown document type, a municipality outside the
  state) was already charged, since it read D1.
- A search is charged before its parameters are validated: the limiter answers first.

## What a refused client receives

`429 Too Many Requests` with `Retry-After: 60` and the error envelope:

```json
{
  "ok": false,
  "meta": { "action": "request.throttle", "traceId": "...", "timestamp": "2026-11-21T16:50:00.000Z" },
  "error": {
    "type": "/problems/rate-limited",
    "title": "Too many requests",
    "status": 429,
    "detail": "Too many requests from this address. Retry in 60 seconds.",
    "instance": "/api/calculations",
    "code": "RATE_LIMITED"
  }
}
```

A client reads the `429` envelope and waits the `Retry-After` seconds; a front end says so and offers
the retry (the playground shows the API's answer as it is).

## How it is wired

- `wrangler.jsonc` declares `SEARCH_RATE_LIMITER` (namespace `1001`) and `CALCULATION_RATE_LIMITER`
  (namespace `1002`), both 60 per 60 seconds. Run `npm run cf-typegen` after editing them.
- `src/shared/http/rate.limit.ts` holds the logic. `limitRequests` is the middleware for the
  flat-charge routes, mounted in `src/worker/index.ts` on each limited path. `throttleRequest` is
  what the two calculation routes call once the body is valid, with the item count as the charge.
- The limiter sits on the limited paths only, never on `/api/*` as a whole, so `/api/health`
  answers without the bindings.
- A request without `cf-connecting-ip` uses the key `local`. In practice that is a test that sends
  none: the local dev server (Miniflare) fills the header with the client's address.
- An IPv6 address is keyed by its first four groups, whatever its notation (`deriveClientKey`); an
  IPv4-mapped address (`::ffff:203.0.113.7`) is keyed by its IPv4 address.
- Each refusal writes one `api.rate_limited` warning, with the limiter name and the charge and never
  the address (`docs/observability.md`).
- It fails closed: a missing binding or a failing `limit()` call throws, and the request answers
  `500 INTERNAL`.

To change a limit, edit `simple.limit` in `wrangler.jsonc`. If the window changes, change
`WINDOW_SECONDS` in `rate.limit.ts` too, since the binding does not expose its window and the
`Retry-After` header repeats it.

## What it does not protect

1. **The daily total.** 5 million rows a day is about 3,470 a minute. One address at the limits
   reads far more:

   | Path | Rows per unit charged | Rows a minute at the limit | Spends the day in |
   | --- | --- | --- | --- |
   | Calculations | up to 1,302 per item (`docs/calculation.md`) | 78,120 | about 64 minutes |
   | Searches | up to 500 per search, 41 usually | 30,000, or 2,460 usually | about 2 hours 47 minutes |
   | `GET /api/operation-indicators` | up to 102 per lookup (`docs/nfse.md`) | 6,120 | about 13 and a half hours |

   - These figures need the calculation indexes (`docs/open-data.md`, Lean D1). A D1 loaded before
     them reads about 3,900 rows per item and 3,296 per indicators lookup: 234,000 and 197,760 rows a
     minute, which spend the day in about 21 and 25 minutes.
   - The calculation figures assume 60 items. A request passes while the counter is below the
     limit, so 59 single items and one 20-item calculation make 79 in a minute.
   - The search limiter counts apart from the calculation limiter, so the two add up.
   - Once the reads run out, D1 fails every query until the daily reset. The developer accepted
     this on 2026-11-21, with about 21 minutes as the worst case on the table: it costs no money,
     and a daily guard needs a counter the Worker can write.
2. **A worldwide count.** Cloudflare keeps the counters per location, and describes them as
   approximate and eventually consistent (Cloudflare's rate limit page, read on 2026-11-21). A client
   whose requests reach two locations gets two counters.
3. **People behind one address.** Cloudflare advises against keys by IP address, because an office or
   a school shares one. Those visitors share one counter here. The API has no other identity to key
   on.
4. **A client that changes address.** An IPv4 client that changes address gets a new counter. IPv6
   clients are keyed by their /64 network (developer, 2026-11-21), since a subscriber usually holds a
   whole /64; a client with a larger block can still present several networks, and the households of
   a provider that hands out smaller blocks share one counter.
5. **A client that opens a new connection per request.** Measured on the deployed Worker on 2026-11-21,
   from one address in one location (GIG): 213 searches, each on its own connection and 10 at a
   time, over about two minutes, were all served. 150 searches on one kept-alive connection were
   served 45 times and refused 105 times within 8 seconds. Each check reads a count cached where
   the request lands and the counts sync in the background, so spreading requests across
   connections spreads them across counters. A strict limit needs a Durable Object (Cloudflare's
   rate limit page) or a WAF rule.

   **Accepted (developer, 2026-11-21, Epic 7).** A WAF rate limiting rule applies to a zone, and the
   API lived on `workers.dev`, which is no zone of this account. A Durable Object counter would add
   a call and its latency to every limited request, and its own daily request budget on the Free
   plan. What the gap risks is the daily D1 read cap, which the developer already accepted as the
   last line (item 1): D1 fails until the daily reset, and the deploy costs nothing.

   **Closed where the host owns a zone.** A deploy on a domain of your own can add a WAF rate
   limiting rule, which counts at the edge, whatever the connection (below).

Verified on the first deploy (2026-11-21):

- The Free plan accepts the binding: the deploy succeeded, the dashboard lists both rate limiters
  under the Worker's bindings, and the deployed Worker answered `429` with this envelope.
- The namespace ids `1001` and `1002` were free: no other Worker of the account has a rate limiting
  binding (checked in the dashboard).

## WAF rule

A backstop above the Worker's limiters, for a deploy on a Cloudflare zone of your own (Security, WAF,
Rate limiting rules). The Free plan offers one rate limiting rule, counted by IP over 10 seconds; the
dashboard shows what the plan allows when the rule is created. A rule like this one stops the client
that spreads requests across connections (item 5):

| Field | Value |
| --- | --- |
| If incoming requests match | `(http.host eq "<your host>" and starts_with(http.request.uri.path, "/api/"))` |
| With the same characteristics | IP |
| When rate exceeds | 30 requests per 10 seconds |
| Then take action | Block, for 10 seconds |

30 in 10 seconds sits above the Worker's 60 a minute, so a person typing a search never meets it. A
zone may already hold a broader rule on every path that covers `/api/*` too; one rule is enough.

A zone's rules do not reach `workers.dev`, so set `workers_dev: false` in `wrangler.jsonc` once the
custom domain answers, or anyone can reach the Worker around them.

## Tests

- `src/shared/http/rate.limit.test.ts` covers the client key, the charge, the `429` envelope and the
  failing limiter, with a fake limiter.
- `src/worker/worker.test.ts` checks, path by path, that each of the eight searches charges the
  search limiter, that the indicators lookup charges the calculation limiter, and that
  `/api/health` charges neither.
- The route tests run against the limiter the Workers test runtime simulates: the 61st search
  (`ncm.route.test.ts`), 60 items and the body validation order (`calculations.route.test.ts`), the
  shared limit across both regimes (`simples-nacional.route.test.ts`), the indicators lookup
  (`operation-indicators.route.test.ts`) and the exempt health route (`health.route.test.ts`).
- The route test helper sends each request from its own address, because the simulated counters
  outlive a test. The simulator starts a new window at every full minute of the wall clock, so a
  limit scenario runs through `completeWithinOneWindow` (`src/shared/testing/rate.window.ts`), which
  repeats it when it crossed a minute.
