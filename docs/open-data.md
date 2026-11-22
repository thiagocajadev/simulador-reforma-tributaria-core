# Open data

The simulator reads its tax tables (NCM, NBS, CST, cClassTrib, rates, municipalities) from a D1
database built from the upstream regular regime calculator.

"Dados abertos" is the Receita's own name for these tables: the calculator's API serves them under
`/api/calculadora/dados-abertos` (`DadosAbertosController` upstream), and the public official
calculator lets anyone browse them under "Mais informações"
(https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/calculadora, registry id
`officialCalculatorData`). It shows the same database version as this project, `V0073`, checked on
2026-11-22. The tables come from the upstream Flyway scripts
(https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/main/flyway/sql, registry id
`openDataScripts`). Nothing upstream runs: a Node script
applies the upstream Flyway SQL scripts to SQLite and writes a file D1 can load.

## Build

```powershell
npm run data:build
```

Needs the `upstream/calculadora-rtc-regime-regular` submodule (`git submodule update --init`). It runs
in about 2 seconds and writes three files to `.data/`, which git ignores:

| File | What |
| --- | --- |
| `open-data.sqlite` | The database, to inspect locally. |
| `open-data.sql` | The D1 dump, about 6.5 MB and 31,000 statements. |
| `open-data.manifest.json` | Database version (`V0073`), upstream commit, row count and row hash per table, how many indexes the dump leaves out. |

How it works (`scripts/open-data/`):

1. `flyway.apply.ts` runs the scripts in the order Flyway does: `beforeMigrate`, the `B0001`
   baseline, `V0002` to `V0073` by version number, then `afterMigrate`. Each script runs in a
   transaction, except those that switch `PRAGMA foreign_keys`, which SQLite ignores inside one.
2. `open-data.create.ts` checks that no foreign key is left dangling, then `search.index.ts` builds
   the search tables.
3. `d1.dump.ts` writes the dump: `PRAGMA defer_foreign_keys = TRUE`, a `DROP TABLE IF EXISTS` per
   table (so loading it again replaces the data), the DDL copied verbatim, one `INSERT` per row, the
   nine calculation indexes, and the statements that rebuild the search tables. No `BEGIN`/`COMMIT`
   and no other `PRAGMA`, which D1 rejects. No other secondary index: see Lean D1 below.

## Parity with Flyway

`fixtures/open-data/flyway-parity.json` holds the fingerprint of the database Flyway itself built:
per table, the row count, a hash of every row (each value with its SQLite storage type, so REAL 2.0
and INTEGER 2 differ) and a hash of the DDL, plus the index names. The tests check that the ETL
database matches it in full, and that the dump, loaded back, matches every table and row; its only
indexes are the primary keys and the nine calculation indexes (see Lean D1).

`VERSAO_BASE_DADO.VRBD_DATA` is left out of the row hash: some migrations insert without a date, and
the column defaults to the time of the build.

Recapture it when the submodule moves to a newer upstream commit. Build the Flyway database first
(`docs/upstream.md`, step 1), then:

```powershell
node scripts/open-data/parity.capture.ts
```

## Search tables

Derived by the ETL, not part of the upstream schema. FTS5 with `remove_diacritics 2`, so `feijao`
matches `Feijão` and `sao paulo` matches `São Paulo`. Each table's `rowid` is the source key as an
integer, so a code lookup reaches its search row without a scan.

| Table | Rows | Holds |
| --- | --- | --- |
| `SEARCH_NCM` | 10,521 | Full 8-digit NCM codes only. `CONTEXT` holds the ancestor descriptions, since most full codes read only "Outros" or "Para semeadura". `SELECTIVE_TAX` (unindexed, Epic 12) holds, as JSON, the Imposto Seletivo rate rows that cover the code, with their value (null at V0073, Epic 13), validity and exceptions; 99 codes have them. |
| `SEARCH_NBS` | 920 | Full 9-digit NBS codes only, with `CONTEXT` as above. |
| `SEARCH_CLASSIFICATION` | 173 | CBS/IBS classifications. The 29 Imposto Seletivo ones are left out. |
| `SEARCH_MUNICIPALITY` | 5,573 | Every municipality, with its UF as a second column, so a search stays within one state. |

The NCM search reads `SELECTIVE_TAX` with each match and says whether the IS applies on the search
date (`src/features/ncm/selective.tax.incidence.ts`). Looking the rate rows up per match instead read
7 to 8 rows for each of up to 21 matches, a search of "24" 519 rows, over the 500 the route tests
allow; the column costs no read.

Searches return matches in code order (the `rowid`), not by relevance. Ranking by relevance makes
FTS5 score every match before the `LIMIT`, and a common word such as "outros" or "de" matches
thousands of NCM codes. In code order the query stops after `limit + 1` rows. For NCM and NBS the
code order groups results by chapter, and IBGE codes roughly follow the alphabet within a state.

Text is stored without the inline `<i>`, `<sub>` and `<sup>` tags and the leading hierarchy dashes
of the NCM descriptions.

## Lean D1 (MVP decision)

**Decided on 2026-11-20 for the MVP, amended on 2026-11-21 and 2026-11-22:** D1 holds every upstream
table and row, the primary keys and the search tables, but **only five of the 116 upstream secondary
indexes**, next
to four indexes of this project's own (Calculation indexes, below). The local
`.data/open-data.sqlite` keeps the upstream set, so it stays identical to the Flyway database.

Why: D1 Free allows 100,000 rows written per day, and counts one write per row plus one per index
entry. Estimated from the row and index counts, not from a measured load, except the calculation
indexes:

| What | Rows written |
| --- | --- |
| Rows of the 56 tables | 30,717 |
| Primary key entries | 16,654 |
| FTS5 internal tables | 35,195 |
| Calculation indexes (measured) | 6,453 |
| **Lean load (what the dump does)** | **about 89,000** |
| 111 upstream secondary indexes, left out | about 107,000 (60,648 of them on NCM alone) |
| Full upstream load, for comparison | about 194,500 |

The first remote load, before the calculation indexes, wrote 64,681 rows, so the estimate is an
upper bound.

The upstream indexes serve the Java calculator's queries. This project's search routes reach rows by
primary key or by an FTS5 `MATCH`, and the route tests check that each search reads at most 500 rows.
The calculations look tables up by classification, and the indicators lookup by NBS code, which is
what the calculation indexes serve.

### Calculation indexes

Added on 2026-11-21, and two more for the Imposto Seletivo on 2026-11-22 (`scripts/open-data/calculation.index.ts`), each measured in the Workers test
runtime before it joined the dump. Together they write 6,453 rows per load.

Five serve the calculations. The numbers are D1 rows read per item, adding one index at a time in
this order: the regular regime over the three items of the `multi-item-2026` fixture, the Simples
Nacional over 20 items of cClassTrib `550001`.

| Index | Rows written | Regular | Simples |
| --- | --- | --- | --- |
| None | | 3,652 | 3,552 |
| `idx_ncm_aplicavel_cltr_id` on `NCM_APLICAVEL(NCMA_CLTR_ID)`, the upstream index | 1,373 | 2,311 | 2,180 |
| `idx_percentual_reducao_cltr_id` on `PERCENTUAL_REDUCAO(PERE_CLTR_ID)` | 520 | 1,796 | 2,180 |
| `idx_tipo_dfe_classificacao_cltr_id` on `TIPO_DFE_CLASSIFICACAO(TDCL_CLTR_ID)` | 420 | 1,387 | 1,761 |
| `idx_classificacao_tributaria_cd` on `CLASSIFICACAO_TRIBUTARIA(CLTR_CD)` | 203 | 882 | 1,037 |
| `idx_tratamento_classificacao_cltr_id` on `TRATAMENTO_CLASSIFICACAO(TRCL_CLTR_ID)` | 203 | 878 | 640 |

The sixth serves the indicators lookup that follows an NFS-e calculation
(`GET /api/operation-indicators`): `idx_classif_nbs_indop_lc_nbs_cd` on
`CLASSIF_NBS_INDOP_LC(CNIL_NBS_CD)`, the upstream index. It writes 3,281 rows and takes a lookup from
3,296 rows read to 23, or 102 for the NBS code with the most mappings.

The seventh, added in Epic 6, serves the NBS annex query every item runs:
`idx_nbs_aplicavel_cltr_id` on `NBS_APLICAVEL(NBSA_CLTR_ID)`, the upstream index. It writes 119 rows
and takes about 118 rows off every item of the regular regime: the three items of `multi-item-2026`
went from 878 to 760 rows each, and the NBS item of `education-service-60pct-2026` from 542 to 433.

The eighth and ninth, added in Epic 12, serve the Imposto Seletivo lookup every item of an NF-e
runs: `idx_aliquota_ad_valorem_produto_ncm_cd` on `ALIQUOTA_AD_VALOREM_PRODUTO(AAVP_NCM_CD)` and
`idx_aliquota_ad_rem_produto_ncm_cd` on `ALIQUOTA_AD_REM_PRODUTO(AARP_NCM_CD)`, both upstream
indexes. They write 334 rows. Upstream's prefix test, `SUBSTRING(:ncm, 1, LENGTH(code))`, is
written as an `IN` list of the NCM's prefixes, so the lookup probes the index instead of scanning the
table: the check that read 335 rows per item reads a few, and a 2027 item of `000001` reads 392
rows (516 with the IS group, which adds its CST, classification and treatment).

Nothing per item still scans a large table.

What it costs, and when to revisit:

- A query on a large table by a column that is not its key scans the whole table. Before such a
  query ships, measure the index it needs (rows read with and without it, rows written) and add it
  to `scripts/open-data/calculation.index.ts`.
- Reloading also writes, since `DROP TABLE` deletes rows. To refresh the data after an upstream
  update, prefer a new database per version (for example `simulador-open-data-v0074`): load it,
  point the binding at it, then delete the old one.
- On the Workers Paid plan (50 million rows written per month) the upstream indexes could come back.

## Load into D1

```powershell
npm run data:load:local
```

Rebuilds the dump, then loads it into the local D1 that `npm run dev` uses (about 30 seconds). The
route tests do not need it: they build the dump in memory and load it into their own D1.

```powershell
npm run data:load:remote
```

Rebuilds the dump, then loads the Cloudflare D1 database. Needs `wrangler login` and the
`database_id` in `wrangler.jsonc`. Load the remote database at most once a day (see Lean D1).

## API

| Route | Parameters | Returns |
| --- | --- | --- |
| `GET /api/ncm` | `q`, `date`, `limit` | Full NCM codes: `ncmCode`, `description`, `context`, validity. |
| `GET /api/nbs` | `q`, `date`, `limit` | Full NBS codes: `nbsCode`, `description`, `context`, validity. |
| `GET /api/classifications` | `q` or `cstCode` (or both), `date`, `limit` | CBS/IBS cClassTrib with `cstCode`, `rateType`, `nomenclature`, validity. |
| `GET /api/cst` | `date` | The 18 CBS/IBS CSTs. |
| `GET /api/municipalities` | `uf`, `q`, `date`, `limit` | `municipalityCode`, `name`, `uf`. |
| `GET /api/rates` | `uf`, `municipalityCode`, `date` | CBS, IBS UF and IBS Mun rates and `requiresNominalRates`. |
| `GET /api/classifications/selective-tax` | `date` | The Imposto Seletivo classifications for the form's picker. See `docs/calculation.md`. |
| `POST /api/calculations` | JSON body: the operation | CBS and IBS per item and totals. See `docs/calculation.md`. |

- `q` is 2 to 60 characters. Digits with dots or dashes are a code prefix (`0713.33`); anything
  else is a full-text search, every word a prefix.
- `date` is `YYYY-MM-DD`, today in Brasília when absent. Only rows valid on that date come back.
- `limit` is 1 to 20, default 20. Searches return `hasMore` instead of a total.
- Invalid parameters answer `400 INVALID_INPUT`, with every invalid field listed in `error.errors`.
- Every route in the table is rate limited per client address and answers `429 RATE_LIMITED` past
  the limit (`docs/rate-limiting.md`).

Rates follow the upstream `AliquotaPadraoRepository`: the reference rate, replaced, increased or
decreased by a UF or municipality standard rate when one exists (`ALIQUOTA_PADRAO` is empty today).
The database has 2026 reference rates only. From 2027 the response is `rates: []` with
`requiresNominalRates: true`, since the upstream calculator then requires the rates in the operation.
