# Porting the simulator

A guide for the developer, or the AI agent, who forks this project to make something else of it:
another country's consumption tax, another host, another fiscal document. It says what the project
is made of, which parts are rules and data that a port replaces, which parts are the safety net a
port keeps, and in what order to work.

An agent reads this file after `AGENTS.md` and `docs/decisions.md`.

## Fundamental concepts

| Concept | What it is |
| --- | --- |
| **Upstream** | The official calculators of the Receita Federal, as git submodules in `upstream/`. A reference, never a runtime: nothing in them is built or deployed. |
| **Open data** | The tables the calculator reads (codes, rates, formulas, legal grounds), rebuilt from the upstream Flyway SQL by `npm run data:build` and loaded into Cloudflare D1. |
| **Golden fixture** | A request and the response the official calculator gave, captured once on the developer's machine (`fixtures/*/`). The engine must reproduce every value. |
| **Registry** | A TypeScript file that holds facts the code states (sources, glossary, pending legal facts, the Sefaz rejections), each checked by a test. |
| **Slice** | One folder per feature in `src/features/`: UI, API route, domain and data access together. |
| **Envelope** | The shape of every API answer, `{ ok, meta, data }` or `{ ok, meta, error }` (`src/shared/http/envelope.ts`). |

## What the project is made of

Three layers, kept apart on purpose:

1. **Rules.** Validation and calculation, ported line by line from the Java calculators to
   TypeScript (`src/features/calculations/`, `src/features/simples-nacional/`). Each rule keeps its
   upstream code (`REG-004`, `VSN-019`), and a comment points at the upstream source where the port
   is not obvious, so a reader can check it.
2. **Data.** The open data in D1 (`docs/open-data.md`). The engine never hard-codes a rate or a code
   table: it runs the formulas the data holds, as they are.
3. **The safety net.** The golden fixtures, captured from the official calculators, and the tests
   that replay them on every change (`docs/upstream.md`). They prove the port gives the official
   answer, value by value.

Around them sit the documents (`src/features/nfe/`, `src/features/nfse/`: XML, XSD validation and
PDF, run on the client), the public API (`src/worker/index.ts`, described in `/api/openapi.json`) and
the local playground (`playground/`), which shows them working. There is no site here: a front end
is built on the API.

## What a port changes first

### Another country or another tax

1. **Find the official reference.** A port is only as good as its reference: an official
   calculator, a published rate table, or the law's worked examples. Without one, there is nothing
   to capture fixtures from.
2. **Replace the data.** Write the ETL that turns the new tables into a SQLite dump
   (`scripts/open-data/` is the model), and the migrations D1 loads. Keep the indexes lean
   (`docs/open-data.md`, Lean D1).
3. **Capture fixtures before writing the engine.** One case per rule and per edge (rounding, zero
   rates, rejections), from the reference, into `fixtures/<regime>/` with a manifest
   (`scripts/fixtures.capture.mjs`). The count of cases is pinned by
   `src/shared/content/validation.cases.ts`.
4. **Port the rules** until every golden test passes. Decimals travel as strings and are computed
   with `src/shared/math/`, never as JavaScript numbers.
5. **Rewrite the registries and the copy.** `official.sources.ts`, `reform.status.ts`,
   `sefaz.rejections.ts` and the messages the API returns are written for Brazil, in Portuguese.

### Another host

The calculation steps and the documents are plain TypeScript. What is Cloudflare's:

- `src/worker/index.ts` and the `*.route.ts` files run on Hono, which also runs on Node, Deno, Bun
  and others.
- The `*.repository.ts` files, `operation.calculate.ts`, `operation.simples.ts` and
  `src/shared/data/location.lookup.ts` take a `D1Database`: SQL over SQLite, so a port swaps the
  binding (`OPEN_DATA`) for any SQLite driver with the same `prepare`/`bind`/`all` shape.
- `src/shared/http/rate.limit.ts` uses the Workers Rate Limiting bindings; replace it with the
  host's limiter (`docs/rate-limiting.md`).
- `wrangler.jsonc` and `public/_headers` (`docs/deploy.md`, `docs/security.md`).

### Another document

Add a slice next to `src/features/nfe/` and `src/features/nfse/`: the document model, the XML
writer, its official XSD under `src/shared/xml/schemas/`, a test that validates every golden case
against it, and the PDF drawn with `src/shared/pdf/`. Follow the official technical note section
by section and cite each section in a doc, as `docs/nfe.md` does.

## The limits a port inherits on the Cloudflare Free plan

| Limit | What it decided here |
| --- | --- |
| No containers | The Java and Go calculators cannot run, so the rules are ported (`context.md`, Decisions). |
| A small CPU budget per request | The PDFs and the XSD validation run in the browser, not in the Worker. |
| D1 rows read per day (5 million) | Search uses FTS5 tables, queries are measured in rows read, and the API is rate limited (`docs/rate-limiting.md`). |
| D1 rows written per day (100,000) | The dump loads in one go and the indexes are few (`docs/open-data.md`). |

A paid plan or another host lifts these, and some decisions above become optional.

## How to work on it

- Run `npm run check` before every commit: typecheck, Biome, the names audit and the three test
  projects (`AGENTS.md`, Commands).
- Keep the facts the code states (sources, case counts, pending legal facts) in a registry a test
  reads, never inline (`docs/decisions.md`, Conventions).
- Write every link only after opening it, with the day it was checked.
- Decisions go to `docs/decisions.md` with the date and who took them, so the next agent does not
  undo them.
