<!-- prettier-ignore-start -->
<div align="center">
  <h1 align="center">Tax Reform Simulator: core</h1>
  <p align="center">
    The CBS, IBS and IS calculation engines, the API, the open data, and the XML and PDF of the reform's fiscal notes, in TypeScript.<br>
    <a href="README.md">Versão em português</a>
  </p>
  <a href="https://github.com/thiagocajadev/simulador-reforma-tributaria-core/actions/workflows/check.yml"><img src="https://img.shields.io/github/actions/workflow/status/thiagocajadev/simulador-reforma-tributaria-core/check.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=check" alt="Check" /></a>
  <a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/Cloudflare%20Workers-Free%20plan-F38020?style=flat-square&logo=cloudflareworkers&logoColor=white" alt="Cloudflare Workers, Free plan" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 7" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-26%20LTS-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 26 LTS" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT license" /></a>
  <a href="https://agents.md"><img src="https://img.shields.io/badge/AGENTS.md-compatible-6e56cf?style=flat-square&logo=markdown&logoColor=white" alt="AGENTS.md compatible" /></a>
</div>
<!-- prettier-ignore-end -->

<br>

This repository is the core of a simulator for Brazil's consumption tax reform (EC 132/2023 and LC 214/2025): the rules ported from the Receita Federal's open source calculators, the open data they read, and an API that calculates the **CBS**, the **IBS** and, from 2027, the **IS** of an operation. It also writes the NF-e and NFS-e XML, draws the DANFE and DANFSe, and validates the XML against the official XSD.

There is no site here. Whoever wants a UI builds one on the API; to see everything working, `npm run dev` opens a local development page, the [playground](#playground).

> An educational simulation with **no fiscal value**. The project follows the rules and open data of the Receita Federal calculators, but it is independent and not affiliated with the Receita. It does not replace the official assessment or an accountant.

<details>
<summary><strong>Fundamental concepts</strong></summary>

| Concept | What it is |
| :-- | :-- |
| **CBS** | Contribuição Social sobre Bens e Serviços, the federal tax that replaces PIS and Cofins |
| **IBS** | Imposto sobre Bens e Serviços, of states and municipalities, which replaces ICMS and ISS |
| **IS** | Imposto Seletivo, levied on goods harmful to health or the environment, from 2027 |
| **NF-e and NFS-e** | The electronic invoice for goods and the one for services; the **DANFE** and the **DANFSe** are their PDFs |
| **Open data** | The tables the Receita publishes with the official calculator: codes, rates, formulas and legal grounds |
| **Golden fixture** | A request and the response the official calculator gave, recorded once; the engine must reproduce every value |
| **Upstream** | The Receita's calculator repositories, kept in `upstream/` as reference, never run in production |

</details>

## Why

In November 2026 the Receita Federal published the reform calculators as open source: three separate services, two in Java and one in Go, each with its own setup and database. This project ports their rules to TypeScript and runs them on the Cloudflare Free plan, with no container and no cost, with the official calculators' cases as proof that the result is the same.

## What is here

- **Calculation engines:** the regular regime (CBS, state and municipal IBS, up to 20 items per operation, from NCM or NBS, CST and cClassTrib), the Imposto Seletivo from 2027, and the Simples Nacional, on the NF-e and the NFS-e. Each rule keeps its upstream code (`REG-004`, `VSN-019`).
- **API:** a [Hono](https://hono.dev) Worker with read-only routes, described by hand in OpenAPI 3.1 (`/api/openapi.json`).
- **Open data:** the ETL that builds SQLite from the official calculator's Flyway SQL and exports it to Cloudflare D1, with FTS5 search.
- **Notes:** the NF-e XML (NT 2025.002, the IBS, CBS and IS groups) and the DANFE (NT 2026.010); the NFS-e XML and the DANFSe; validation against the official XSD with `xmllint-wasm`. They run in the browser or in Node.
- **Safety net:** the golden fixtures captured from the official calculators, and the tests that replay them on every change.

## How the numbers are checked

- **Golden fixtures.** Each case in `fixtures/` was calculated once by the official calculators, under the regular regime and the Simples Nacional. The engine reproduces every value, status and rule code of them on every test run; the count per regime is in [`validation.cases.ts`](src/shared/content/validation.cases.ts).
- **Formulas as data.** The regular regime runs the formulas stored in the open data, with exact decimal arithmetic and the upstream rounding (HALF_EVEN). The API returns every step it ran ([docs/calculation.md](docs/calculation.md)).
- **Sources as data.** Every official link comes from a checked registry, with the day it was checked ([`official.sources.ts`](src/shared/content/official.sources.ts)).

## Architecture

```
Client (your front end, a script,     Cloudflare Worker (Hono)             D1 (SQLite)
an agent or the playground)     ──▶   /api/* routes, rate limiting   ──▶   open data: NCM, NBS,
                                      calculation engine (TypeScript)      CST, cClassTrib, rates,
XML, DANFE, DANFSe and XSD            /api/openapi.json                    formulas, legal grounds
(TS modules, in the browser)
```

- **Vertical slices.** Each feature has a folder in `src/features/` with its route, domain and data access.
- **Upstream as reference.** The Receita's three repositories are git submodules in `upstream/`. They supply the open data, the rules (ported to TypeScript) and the golden fixtures. The Cloudflare Free plan runs no containers, so nothing of theirs reaches production.
- **PDF and XSD outside the Worker.** The Free plan's CPU budget per request cannot draw a PDF or run libxml2, so those modules run on the client.

## Run locally

You need Node.js 26 (24 works too) and git.

```bash
git clone --recurse-submodules https://github.com/thiagocajadev/simulador-reforma-tributaria-core.git
cd simulador-reforma-tributaria-core
npm ci
npm run data:load:local   # builds the open data from upstream/ and loads it into the local D1
npm run dev               # the API and the playground at http://localhost:5173
```

```bash
curl "http://localhost:5173/api/ncm?q=cerveja&date=2027-03-10"
```

| Command | What it does |
| :-- | :-- |
| `npm run dev` | The Worker and the playground in one process, reloading on edit |
| `npm run check` | Typecheck, Biome, the names audit and the three test projects |
| `npm run build` | Typecheck and the Worker bundle in `dist/`, without publishing |
| `npm run data:build` | Rebuilds the open data dump in `.data/` |

Publishing to a Cloudflare account of your own: [docs/deploy.md](docs/deploy.md).

## Playground

`npm run dev` opens a plain, framework-free page at `http://localhost:5173`, made for development ([`playground/`](playground/)):

1. pick a demo operation and edit the request JSON;
2. **Calcular** calls `POST /api/calculations` and shows the result per item;
3. the simulated NF-e or NFS-e comes out as XML and PDF, and **Validar XML** checks the XML against the official XSD;
4. an XML of your own can be validated too, without leaving the browser.

It is never deployed and is not a front end: it is the shortest way to see the modules working.

## API

Read-only, with no login or key, rate limited per address. The full description is at `/api/openapi.json`, which any OpenAPI reader loads.

| Route | What it answers |
| :-- | :-- |
| `GET /api/health` | Whether the Worker and D1 answer |
| `GET /api/ncm`, `/api/nbs` | Goods and services search |
| `GET /api/cst`, `/api/classifications`, `/api/classifications/selective-tax` | Status and tax classification codes |
| `GET /api/municipalities`, `/api/rates` | Municipalities and rates by date |
| `GET /api/operation-indicators` | LC 116 items and the NFS-e operation indicators |
| `POST /api/calculations` | The regular regime calculation, with the IS |
| `GET /api/simples-nacional-activities`, `POST /api/simples-nacional-calculations` | The Simples Nacional |

## For AI agents

The repository offers **AX** (Agent eXperience): documents written so an agent understands the project and works on it without guessing.

1. [`AGENTS.md`](AGENTS.md): the starting point, with the commands, the conventions and what never to do.
2. [`docs/decisions.md`](docs/decisions.md): every decision of the project, with its date and reason.
3. [`docs/porting.md`](docs/porting.md): how to port the simulator to another tax, host or document.

## Documentation

| Topic | File |
| :-- | :-- |
| Decisions and conventions | [docs/decisions.md](docs/decisions.md) |
| Request, response, rules and calculation steps | [docs/calculation.md](docs/calculation.md) |
| Simples Nacional, on the NF-e and the NFS-e | [docs/simples-nacional.md](docs/simples-nacional.md) |
| NF-e XML, validation and DANFE | [docs/nfe.md](docs/nfe.md) |
| NFS-e XML and DANFSe | [docs/nfse.md](docs/nfse.md), [docs/danfse-layout.md](docs/danfse-layout.md) |
| Open data in D1, search and indexes | [docs/open-data.md](docs/open-data.md) |
| Upstream calculators and golden fixtures | [docs/upstream.md](docs/upstream.md) |
| Porting the project | [docs/porting.md](docs/porting.md) |
| Publishing to your Cloudflare account | [docs/deploy.md](docs/deploy.md) |
| Rate limiting and what it does not protect | [docs/rate-limiting.md](docs/rate-limiting.md) |
| Logs | [docs/observability.md](docs/observability.md) |
| Security | [docs/security.md](docs/security.md) |
| Acronyms and names in code | [docs/glossary.md](docs/glossary.md) |

## Out of scope

- A production UI: the playground is local only.
- The single-phase taxation of fuels, the treatments with adjustment or deferral, and government purchases under the regular regime: the item comes back as out of scope, with the reason.
- ICMS, IPI, PIS and Cofins on the NF-e, the NFC-e note, and a real signature.
- Submission to any Sefaz or to the national NFS-e environment.

## Contributing

Forks, clones and pull requests are welcome. Before opening a PR, read [CONTRIBUTING.md](CONTRIBUTING.md); to report a security flaw, [SECURITY.md](SECURITY.md).

## Credits

Created by Thiago Cajaiba ([@thiagocajadev](https://github.com/thiagocajadev)).

## License

This project uses the [MIT license](LICENSE). It builds on the Receita Federal do Brasil's open source calculators, also under the MIT license; their notices, the origin of the open data and that of the XSD schemas are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
