# AGENTS.md

Instructions for an AI agent working in this repository. People read `README.md` first; this file
is the same project, for you.

## What this is

The core of a simulator for Brazil's consumption tax reform (CBS, IBS and IS, LC 214/2025): the
calculation engines ported from the Receita Federal's open source calculators, a read-only API on a
Cloudflare Worker (Hono, D1), the ETL that builds the open data, the NF-e and NFS-e XML with their
PDFs and XSD validation, and the golden fixtures that prove the port. There is no site; `playground/`
is a local development page.

## Read first

1. `docs/decisions.md`: the conventions and every decision, with its reason. Do not undo one without
   saying so.
2. `docs/porting.md`: what the project is made of (rules, data, safety net) and in what order to
   change it.
3. The doc of the area you touch: `docs/calculation.md`, `docs/simples-nacional.md`, `docs/nfe.md`,
   `docs/nfse.md`, `docs/open-data.md`, `docs/upstream.md`.

## Commands

| Command | When |
| --- | --- |
| `npm ci` | After cloning with `--recurse-submodules` |
| `npm run data:load:local` | Once, and after an upstream update: builds the open data and loads the local D1 |
| `npm run dev` | The Worker and the playground at `http://localhost:5173` |
| `npm run check` | Before every commit: typecheck, Biome, the names audit and the three test projects |
| `npm run lint:fix` | Biome fixes what it can |
| `npm run build` | Typecheck and the Worker bundle, without deploying |

## Where things live

| Path | What |
| --- | --- |
| `src/worker/index.ts` | The Worker: routes, rate limiting, security headers, errors |
| `src/features/<feature>/` | One slice per feature: `*.route.ts`, `*.service.ts`, `*.repository.ts`, `*.dto.ts`, the domain, and the tests beside them |
| `src/features/calculations/` | The regular regime and the Imposto Seletivo |
| `src/features/simples-nacional/` | The Simples Nacional |
| `src/features/nfe/`, `src/features/nfse/` | The XML, the DANFE and the DANFSe |
| `src/features/openapi/` | The OpenAPI 3.1 document, by hand |
| `src/shared/` | Decimal math, formatting, HTTP envelope, XML writing and XSD validation, PDF text, registries |
| `scripts/open-data/` | The ETL from the upstream Flyway SQL to the D1 dump |
| `fixtures/` | The golden fixtures captured from the official calculators |
| `upstream/` | The Receita Federal calculators, as git submodules: reference only |
| `playground/`, `index.html` | The local development page |

## Rules

- Never hard-code a rate, a code table or a formula: the engine runs what the open data holds.
- Never compute money with JavaScript numbers: decimals are strings, through `src/shared/math/`,
  rounded HALF_EVEN as the upstream does.
- Never edit a golden fixture by hand to make a test pass. A fixture changes only by capturing it
  again from the official calculator (`docs/upstream.md`).
- Never change the submodules in `upstream/`, and never run them in production.
- Every request value reaches D1 as a bound parameter; every route validates its input at the edge.
- A new or changed route updates `openapi.document.ts`; the route coverage test fails otherwise.
- A fact the code states goes into its registry with a test (`docs/decisions.md`, Registries); a link
  enters only after it was opened.
- Names follow `docs/decisions.md`, Naming; `npm run audit:names` checks them.
- No secret, certificate or `.env` file in the repository.
- Do not claim a behaviour of this code from memory: read the file, and cite it.

## How to work

1. Say what you will change and why before changing it; for a rule, name the upstream code
   (`REG-004`, `VSN-019`) and the source.
2. Make the smallest change that does it, with its test: happy path, edge, failure.
3. Run `npm run check`; fix what fails instead of skipping it.
4. Update the docs the change touches, and `docs/decisions.md` when it is a decision.
