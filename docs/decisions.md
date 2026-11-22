# Decisions

Every decision that shapes this code, with its date and its reason, so the next person, or the next
agent, does not undo one by accident. The conventions come first; the dated decisions follow, then the
findings that cost the most to learn. A new decision goes here, with the date and who took it.

## Conventions

### Naming

- Identifiers in English (`baseAmount`, `taxRate`). Official tax and code-table acronyms stay as words
  in camelCase (`cbsRate`, `ibsAmount`, `ncmCode`, `cstCode`). `cClassTrib` stays literal everywhere.
- XML tag names (`vBC`, `pCBS`) appear only in the layer that builds the XML.
- File names read `domain.operation.ts` (`tax.calculate.ts`, `item.validate.ts`); never `helpers`,
  `utils`, `common` or `misc`.
- No generic verbs, nouns or abbreviations in declared names: `handle`, `do`, `run`, `execute`,
  `perform`, `get` for a computation; `data`, `info`, `obj`, `item`, `thing`; `req`, `res`, `ctx`,
  `idx`, `prev`, `arr`, `val`, `tmp`, `cb`, `fn`. `npm run audit:names` checks what a regex can
  (`scripts/checks/names.rules.ts`).
- Booleans start with `is`, `has`, `can`, `should`, `did`, `needs`, `supports` or `allows`.
- `docs/glossary.md` maps every acronym to its meaning.

### Code shape

- One concern per file, under 500 lines. The caller sits above the helpers it alone uses.
- A named `const` before every meaningful `return`; no ternary, arithmetic or object literal inside a
  `return`.
- Every `if`, `else`, `for` and `while` body in braces; early return instead of `else` after `return`.
- Errors are values (`Result`, discriminated unions), not control flow; `try` sits at the boundary.
- A comment says why, never what, and starts with `// why:` when it records a hidden constraint.
- Biome formats and lints (`biome.json`): two spaces, double quotes, line width 100.

### Numbers and data

- Decimals travel as strings and are computed with `src/shared/math/`, never as JavaScript numbers.
  Rounding follows the upstream: HALF_EVEN.
- The engine never hard-codes a rate or a code table: it runs the formulas the open data holds.
- Every request value reaches D1 as a bound parameter.

### Registries

- A fact the code states (an official link and the day it was checked, a golden case count, a pending
  legal fact, the expected Sefaz rejections) lives in one registry a test reads, never inline:
  `official.sources.ts`, `validation.cases.ts`, `reform.status.ts`, `sefaz.rejections.ts`.
- A link enters only after it was opened and its content matched its label.
- A sentence that says something is missing or pending says why, since when, and links the source.

### Tests

- `npm run check` runs typecheck, Biome, the names audit and three Vitest projects: `node` (unit and
  scripts), `workers` (the routes and the golden cases, in the Workers runtime against a D1 seeded
  with the real dump) and `dom` (the playground, under happy-dom).
- A test names its values `actual` and `expected` and follows arrange, act, assert.
- A new rule comes with a golden case captured from the official calculator when the calculator
  covers it (`docs/upstream.md`).

### Line endings

LF everywhere, declared in `.gitattributes` and `.editorconfig`.

## Decisions

### Upstream as reference, not runtime

2026-11-20. The Cloudflare Free plan has no containers, so the Java and Go calculators cannot run
there. They stay as git submodules in `upstream/` and feed three things: the open data (Flyway SQL),
the calculation rules (ported to TypeScript) and the golden fixtures (captured once on a developer
machine). They are never built or deployed.

### Cloudflare Free plan only

2026-11-20. Workers, D1, Workers Rate Limiting and Workers Logs cover the API at zero cost. Every
limit of the plan that shaped a decision is in `docs/porting.md`, The limits a port inherits.

### PDF and XSD validation on the client

2026-11-20 (PDF), 2026-11-22 (XSD). The Free plan's CPU budget per request cannot draw a PDF or run
libxml2. `jspdf` and `xmllint-wasm` load through `import()` only when asked for.

### Language

2026-11-20. Code, docs and commit messages in English. The README and the playground in Portuguese,
for the Brazilian reader, with `README.en.md` beside the README. Official terms keep their Portuguese
names (`cClassTrib`, NF-e, DANFE).

### NF-e and DANFE from the official sources only

2026-11-22. The XML follows NT 2025.002 and the layout schema; the DANFE follows NT 2026.010 and MOC
7.0 Anexo II, each rule cited by section in `docs/nfe.md`. ICMS, IPI, PIS and COFINS stay out of the
items; the DANFE takes additional sheets instead of a one-page cap.

### XML validated against the official XSD

2026-11-22. The NF-e against the portal's schema package (PL 010h v1.03, in
`src/shared/xml/schemas/`), which wins over the copy the upstream ships; the newest published package
wins. The NFS-e against the upstream XSD. Where a sample and the XSD disagree, the XSD wins. The
notes carry a test signature with fictitious values (`docs/security.md`, Test signature).

### The Sefaz schema over the upstream XSD

2026-11-22. Where the XSD the upstream ships lags the Sefaz (the IS ad rem rate is `adRemIS`), the
code follows the Sefaz.

### Legal facts carry their date

2026-11-22. Text about rates or acts still pending (the IS law, the CBS reference rate) says what
stood on the day it was checked and links the source (`reform.status.ts`, `REFORM_STATUS_CHECKED_ON`).

### Imposto Seletivo with a typed rate

2026-11-22. The open data marks which NCM pay the IS but holds no rate, so the client sends it, as the
official calculator takes it; the open data fills a rate once it holds one.

### The OpenAPI document by hand

2026-11-22. `src/features/openapi/openapi.document.ts`, served at `/api/openapi.json`;
`openapi.route.test.ts` fails when a Worker route is missing from it, and `openapi.examples.d1.test.ts`
runs every example it prints. Only that document answers every origin (CORS); the data routes keep
none.

### Rate limiting per client

2026-11-21. Two Workers Rate Limiting bindings, 60 a minute per client address (an IPv6 address by its
/64), on every route that reads D1 (`docs/rate-limiting.md`, with the gap they leave).

### License MIT

2026-11-21. The same as the three upstream calculators (`LICENSE`, `THIRD-PARTY-NOTICES.md`).

### The public core

2026-11-22. This repository is the core of the simulator, published on its own: the engines, the
API, the ETL, the golden fixtures, the tests and these docs. It has no site; the playground is a local
development page. A front end is built on the API.

## Findings worth knowing

- **Rates from 2027 are input.** The open data holds reference rates for 2026 only (CBS 0.9%, IBS UF
  0.1%, IBS Mun 0%), and the calculator requires nominal rates for any tax event from 2027 and rejects
  them before (REG-036, REG-037).
- **Simples effective rates are input, never computed.** The upstream takes `pCBSSN` and `pIBSSN` as
  the PGDAS publishes them, and the data has no annex or RBT12 table to derive them. Every Simples
  parameter row starts on 2027-01-01.
- **From 2027 the NF-e item total includes IBS and CBS** (NT 2025.002, VB01-10), and `vNFTot` is the
  sum of `vItem` while `vNF` stays the legacy total.
- **The XSD and the Sefaz rules are two different bars.** The layout makes the ICMS group optional,
  but the Sefaz rejects a note without ICMS/ISSQN, PIS and COFINS. A simulated note passes the schema
  and never the parties, key, signature or date rules, by design.
- **Validate against the schema, not against a sample.** The DANFSe generator's sample is not
  XSD-valid; the Receita's `valido/` samples and the XSD settle the shape.
- **FTS5 reads stay small in rowid order, not by rank.** `ORDER BY rank` scores every match before the
  `LIMIT`; ordered by `rowid`, the query stops after `limit + 1` rows.
- **One D1 batch per request, not per item**: a `db.batch()` counts as one query against the Free
  plan's 50 per invocation.
- **jsPDF never adds a page on its own**: text past the bottom is clipped silently, so the renderers
  throw when content reaches the edge, and the tests draw the longest texts.
- **The open data stores blank formulas as `""`**, which the upstream treats as absent.
- **Upstream error bodies are host- and time-dependent**: fixtures are recaptured through `localhost`
  (`fixtures/regime-regular/README.md`).
