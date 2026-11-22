# Observability

What the deployed Worker records, and how to find a failure from the `traceId` a visitor reports.
The API writes to Workers Logs, Cloudflare's log store for Workers, enabled in `wrangler.jsonc`
(`observability`). No other tool or dependency is involved.

## Terms

| Term | Meaning |
| --- | --- |
| **Invocation log** | The event Cloudflare writes for every request on its own: method, URL, status, duration and other metadata it has. |
| **Event** | One structured object the API writes with `console.error` or `console.warn`. Workers Logs indexes each field, so a query can filter on it. |
| **`traceId`** | The request id the API returns in every response `meta`: the `cf-ray` header, or a random UUID when that header is missing or malformed (`src/shared/http/envelope.ts`). |

## Events the API writes

Every event carries `level`, `event`, `traceId`, `method`, `path` and `status`, then its own fields.
`src/shared/http/request.log.ts` writes them.

| `event` | `level` | When | Own fields |
| --- | --- | --- | --- |
| `api.unhandled_error` | `error` | A request answers `500 INTERNAL` (`src/worker/index.ts`, `respondUnhandledError`). That includes D1 failing once the day's reads run out. | `errorName`, `message`, `stack` |
| `api.rate_limited` | `warn` | A request answers `429 RATE_LIMITED` (`src/shared/http/rate.limit.ts`). | `limiter` (`search` or `calculation`), `cost` (units charged) |

Nothing else is logged by the API. A `400` or a `404` is the client's mistake, and the invocation log
already records it.

Never in an event: the client address, the request body, or any header. The API takes no personal
data, so the `message` and `stack` of an error hold only code paths and the error text. The invocation
logs are Cloudflare's own; whether they carry request headers, the client address among them, is not
stated on Cloudflare's Workers Logs page (read on 2026-11-21).

## Finding a failure

1. Take the `traceId` from the error the visitor saw (`meta.traceId` in the response body).
2. Open Workers & Pages, `simulador-reforma-tributaria`, Observability, in the Cloudflare dashboard.
3. Filter by `traceId` equal to that value. The `api.unhandled_error` event has the stack, and the
   invocation log next to it has the duration and status.

To watch refusals, filter by `event` equal to `api.rate_limited` and group by `limiter` or `path`.

Locally, `npm run dev` prints the same objects in the terminal.

## Free plan budget

From Cloudflare's Workers Logs page, read on 2026-11-21:

- 200,000 log events written per day, kept for 3 days.
- Each request writes one invocation log, plus one event per `console` call. A served request costs
  1 event, a refused or failed one 2.
- `head_sampling_rate` is `1`, so every request is logged. Lowering it samples whole requests, with
  all of their events.
- Past 200,000 events, the dashboard's Observability banner says new events are not stored until
  00:00 UTC (read on 2026-11-21); the Worker keeps answering. The Workers Logs page also says it
  moves to Cloudflare Observability pricing on 2026-12-01; recheck these figures then.

Verified on the deployed Worker on 2026-11-21: a burst of searches wrote 105 `api.rate_limited`
events, one per `429`, each with `cost`, `status`, `limiter`, `path`, `method`, `traceId`, `event`
and `level` indexed and no client address, next to the invocation logs.

The rate limits (`docs/rate-limiting.md`) cap the requests a client gets served, not the ones it
sends: a client that keeps sending past its limit costs 2 events per refused request. What bounds the
log budget is the Workers Free plan cap of 100,000 requests a day (Cloudflare's Workers limits page,
not reread in this cycle): at 2 events each, that is the whole 200,000. Past the log budget the
requests still answer; only the logging stops or is sampled.

## Tests

- `src/worker/worker.test.ts`: a `500` writes one `api.unhandled_error` with the `traceId` of the
  response, and a `400` or a `404` writes nothing.
- `src/shared/http/rate.limit.test.ts`: a refusal writes one `api.rate_limited` without the client
  address, and an allowed request writes nothing.
