# Calculation

`POST /api/calculations` calculates CBS, IBS UF and IBS Mun for one operation under the regular
regime, and from 2027 the Imposto Seletivo of an NF-e or NFC-e item (Imposto Seletivo, below). It is a TypeScript port of the upstream calculator's path (`docs/upstream.md`, Calculation
path), run in the Worker against the open data in D1. Nothing upstream runs.

The port is checked against the golden fixtures of `fixtures/regime-regular/` (12 from Epic 0, 8
of the Imposto Seletivo from Epic 12): every
item value, status, rule code and field, and every total
(`src/features/calculations/calculation.golden.d1.test.ts`).

## Request

```json
{
  "taxEventDate": "2026-03-10T10:00:00-03:00",
  "uf": "RS",
  "municipalityCode": 4314902,
  "documentType": 55,
  "items": [
    { "itemNumber": 1, "ncmCode": "10063021", "cstCode": "200", "cClassTrib": "200003", "baseAmount": "100.00" }
  ]
}
```

| Field | Shape | Notes |
| --- | --- | --- |
| `taxEventDate` | ISO 8601 date-time with offset | Its local date picks the rules, codes and rates in force. |
| `uf` | 2 capital letters | |
| `municipalityCode` | 7-digit IBGE code | Must belong to `uf`. |
| `documentType` | 2 digits, optional | `55` NF-e, `65` NFC-e, `91` NFS-e and the other `TIPO_DFE` codes the calculator supports. When given, the cClassTrib must be allowed for it, and it decides which of NCM and NBS the item takes. |
| `items` | 1 to 20 | |
| `items[].itemNumber` | integer, 1 to 999 | |
| `items[].ncmCode`, `items[].nbsCode` | digits, at most one of them | `"00"` or `"00000000"` means no NCM on NF-e and NFC-e. |
| `items[].cstCode`, `items[].cClassTrib` | 3 and 6 digits | |
| `items[].baseAmount` | decimal string, up to 13 integer digits and 2 places | |
| `items[].nominalRates` | `{ cbsRate, ibsUfRate, ibsMunRate }`, percentage strings up to 4 places | Required from 2027 when the CST has the IBS/CBS group; refused before 2027. |
| `items[].selectiveTax` | `{ cstCode, cClassTrib, adValoremRate?, adRemRate?, quantity?, unit? }`, optional | The Imposto Seletivo group. `adValoremRate` is a percentage (3 integer digits, 4 places); `adRemRate` reais per unit (13 integer digits, 4 places); `quantity` up to 11 integer digits and 4 places; `unit` 1 to 6 letters or digits. Its base is the item's `baseAmount`. |

Decimals travel as strings, never as JSON numbers. The body is capped at 32 KB.

## Response

A `200` carries one result per item and the operation totals:

```json
{
  "items": [
    {
      "itemNumber": 1,
      "status": "calculated",
      "cstCode": "200",
      "cClassTrib": "200003",
      "treatmentDescription": "...",
      "legalGround": { "shortReference": "...", "description": "..." },
      "taxes": {
        "baseAmount": "100.00",
        "cbs": { "rate": "0.90", "reductionPercent": "100.00", "effectiveRate": "0.00", "amount": "0.00" },
        "ibsUf": { "rate": "0.10", "reductionPercent": "100.00", "effectiveRate": "0.00", "amount": "0.00" },
        "ibsMun": { "rate": "0.00", "reductionPercent": "100.00", "effectiveRate": "0.00", "amount": "0.00" },
        "ibsAmount": "0.00"
      }
    }
  ],
  "totals": { "baseAmount": "100.00", "cbsAmount": "0.00", "ibsUfAmount": "0.00", "ibsMunAmount": "0.00", "ibsAmount": "0.00", "selectiveTaxAmount": "0.00" },
  "dataVersion": "V0073"
}
```

Each item ends in one status, as the upstream observability endpoint does, so one bad item does not
hide the others:

| Status | Upstream state | Carries |
| --- | --- | --- |
| `calculated` | `CALCULADO` | `taxes`, or `null` for a CST without the IBS/CBS group (`400`, `410`, `620`, `8xx`), which upstream also leaves without values. |
| `simulated` | `CALCULO_SIMULADO` | As `calculated`; the rates came from `nominalRates` or a typed IS rate. |
| `rejected` | `INCONSISTENCIA_ENTRADA` | `violations`: the first rule the item breaks, with `ruleCode`, `field` (`items[0].ncmCode`, or `items[0]` when upstream names no field) and `message`. |
| `notImplemented` | `NAO_IMPLEMENTADO` | `reason`, see Out of scope. |

`reductionPercent` and `effectiveRate` are set only when the classification's own CST has the
reduction group (`011`, `200`, `515`), whatever CST the item sends. Totals add the published item
values. A calculated item also carries `selectiveTax`, `null` unless the IS was calculated.

### Calculation steps

Each tax (`cbs`, `ibsUf`, `ibsMun`) also carries what the engine ran, so the screen can show the
formula behind every value:

```json
"rateSource": "standard",
"calculationSteps": [
  { "step": "rate", "formula": "aliquota", "values": { "aliquota": "0.009" }, "result": "0.009" },
  { "step": "effectiveRate", "formula": "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
    "values": { "aliquota": "0.009", "percentualReducao": "1", "pRedutorCompraGov": "0" }, "result": "0" },
  { "step": "base", "formula": "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado",
    "values": { "baseCalculoInformada": "100", "impostoSeletivoInformado": "0", "impostoSeletivoCalculado": "0" }, "result": "100" },
  { "step": "calculatedTax", "formula": "baseCalculo*aliquotaEfetiva",
    "values": { "baseCalculo": "100", "aliquotaEfetiva": "0" }, "result": "0" },
  { "step": "taxDue", "formula": "tributoCalculado", "values": { "tributoCalculado": "0" }, "result": "0" }
]
```

- **`rateSource`:** `nominal` (from `nominalRates`), `standard` (`Padrão`: the reference rate adjusted by
  the UF or municipality), `reference` (`Uniforme nacional (referência)`), `classification` (`Uniforme
  setorial`, `Fixa`) or `none` (`Sem alíquota`).
- **`formula`:** the expression exactly as `TRATAMENTO_TRIBUTARIO` stores it, the single source of the
  calculation. A rate no formula produced (a nominal rate that prevails, or no rate formula) has
  `formula: null` and no values. A step whose formula is absent (no effective rate, no tax due) is
  left out.
- **`values`:** every variable the formula names, as it consumed them: rates and percentages as
  fractions, money in reais, a variable without a value as `0` (as upstream).
- **`result`:** the value after it settles: rates published at 4 places, money rounded to 2 places,
  the base never below zero. Trailing zeros are dropped.
- **`roundedToPlaces`:** optional, set only when a document layout rounds the result. The regular
  regime never sets it; the Simples Nacional sets it on the NFS-e rate (`docs/simples-nacional.md`).

The last step equals the published `amount` for every tax of every fixture
(`calculation.golden.d1.test.ts`, "ends the steps of every tax").

A `400 INVALID_INPUT` lists every invalid field in `error.errors`. It also covers the operation
rules: an unknown state, a municipality outside the state, and a document type that is unknown
(`REG-028`) or unsupported (`REG-038`), which upstream reports for the whole operation.

## Rules

In the order `ProcessamentoItemService.processarItem` applies them; the first one an item breaks
decides it (`src/features/calculations/item.validate.ts`).

| Code | Field | Rule |
| --- | --- | --- |
| `REG-001` | item | NCM and NBS sent together. |
| `REG-002`, `REG-003` | `ncmCode`, `nbsCode` | Code not in force on the date. |
| `REG-004` | `cstCode` | CST does not exist for CBS/IBS on the date. |
| `REG-036`, `REG-037` | `nominalRates` | Nominal rates sent before 2027, or missing from 2027. |
| `REG-005` | `cClassTrib` | Classification does not exist for CBS/IBS on the date. |
| `REG-006` | `cClassTrib` | Classification belongs to another CST (checked when an NCM or NBS is sent). |
| `REG-029` | `cClassTrib` | Classification not allowed on the document type. |
| `REG-008` | `cClassTrib` | No treatment for the classification on the date. |
| `REG-030`, `REG-033` | item | NCM or NBS not accepted on the document type, or missing where its annex requires one. |
| `REG-015`, `REG-016` | `ncmCode`, `nbsCode` | Annex requires a full 8-digit NCM or 9-digit NBS. |
| `REG-011`, `REG-012` | `ncmCode`, `nbsCode` | Code not in the classification's annex, or excepted from it. |
| `REG-023` | item | No sectoral or fixed rate for the classification on the date. |

Then the Imposto Seletivo rules, in the order `obterTratamentoClassificacao` applies them after the
CBS/IBS ones (`src/features/calculations/selective.tax.validate.ts`). `REG-036` above also refuses
an IS rate typed before 2027.

| Code | Field | Rule |
| --- | --- | --- |
| `REG-004` | `selectiveTax.cstCode` | CST does not exist for the IS on the date. The IS CSTs start on 2027-01-01, so an IS group before 2027 without a typed rate ends here (with one, `REG-036` comes first); upstream answers `404` for the whole operation. |
| `REG-005`, `REG-006`, `REG-008` | `selectiveTax.cClassTrib` | IS classification does not exist, belongs to another CST, or has no treatment on the date. |
| `REG-023` | `selectiveTax.unit` | An ad rem rate typed without its unit. |
| `REG-032` | `selectiveTax` | An IS rate on a document other than NF-e and NFC-e. |
| `REG-013` | `selectiveTax` | No IS group where an IS rate resolves (an official one, any year), or, from 2027, a full NCM with an IS rate row. |
| `REG-035` | `selectiveTax` | From 2027, the group with no rate: the row has no value and none was typed. |
| `REG-023` | item | An ad rem rate without a quantity above zero, or without a unit. |

The nomenclature rules with a document type follow `ValidacaoNomenclaturaService` in the
`PERMISSIVO` mode upstream sets today.

## Calculation

`src/features/calculations/tax.calculate.ts` ports `CalculoCbsIbsService.calcularCbsIbs`:

1. The rate comes from `nominalRates` when sent, otherwise by the classification's rate type:
   `Padrão` takes the reference rate adjusted by any UF or municipality standard rate (the same
   lookup as `GET /api/rates`), `Uniforme nacional (referência)` the reference rate, `Uniforme
   setorial` and `Fixa` the classification's rate in `ALIQUOTA_AD_VALOREM`, and `Sem alíquota`
   zero. Classification `510001` is forced to `Padrão`.
2. The treatment's formulas run in order (rate, effective rate, base, calculated tax, tax due)
   through `formula.evaluate.ts`, an arithmetic parser that replaces JEXL.
3. Arithmetic is exact (`src/shared/math/decimal.ts`). The rate and effective rate are published
   at 4 places and the published value multiplies the base; the base is rounded to 2 places first
   and never goes below zero; amounts are rounded once to 2 places. Every rounding is HALF_EVEN.
   See `docs/upstream.md`, Numeric policy.

## Out of scope

These items end as `notImplemented`, with the reason:

| Reason | What | Why |
| --- | --- | --- |
| `taxRelief` | Treatments that require the regular taxation group (`tributacaoRegular`) | The simulator has no such group. Upstream rejects them with `REG-009` when it is missing. |
| `adjustment` | The 16 treatments flagged `TRTR_IN_POSSUI_AJUSTE` | Not implemented upstream either. |
| `monophasic` | Monophasic fuel treatments | Upstream uses constants for them and calls them not yet released. |
| `deferral` | The 2 treatments with deferral formulas | No fixture pins them. |
| `combinedRates` | Ad valorem plus ad rem rate type | Imposto Seletivo only; empty upstream. |

Also left out: government purchases (`gCompraGov`), base components (`gComponentesBC`), the
quantity and unit of an item outside the IS group (they only feed monophasic formulas), and the
calculation memo text (`memoriaCalculo`); the item carries the treatment and legal ground instead.

## Imposto Seletivo

Epic 12, asked at the Epic 11 PLAN. `src/features/calculations/selective.tax.calculate.ts` ports
`CalculoImpostoSeletivoService.calcularImpostoSeletivo` of calculator 1.7.2:

1. **Where it applies.** An NCM pays the IS on a date when a row of `ALIQUOTA_AD_VALOREM_PRODUTO`
   or `ALIQUOTA_AD_REM_PRODUTO` (tribute 1) covers it by prefix, valid on the date, with no valid
   exception: 99 full NCM codes at `V0073`, from 2027 to 2033. The query is shared with the NCM
   search (`src/shared/data/selective.tax.match.ts`).
2. **The rates.** Every IS rate row holds `NULL` at `V0073` (`afterMigrate.sql` empties them), so
   the visitor types them, as upstream takes them in `aliquotasNominais.impostoSeletivo`. Each
   typed rate wins; the open data fills only a rate left out, once its row holds a value
   (`selective.tax.rates.ts`), and the result says which (`rateSources`: `nominal` or `official`).
   The form follows (Epic 13): the NCM search carries each window's official value
   (`officialRates`), so a rate field the open data fills may stay blank, shows the official rate,
   and the IS block says so; an official ad rem rate still asks the quantity and the unit.
3. **The formula.** The IS classification's treatment: TRTR 1 (`000` and `300`) runs
   `baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem`; TRTR 2 (exports, shipments, zero rate)
   yields `0`. The base is the item value rounded to 2 places; the ad valorem rate (a percentage,
   then a fraction) and the ad rem rate (reais per unit) are rounded to 4 places; the tax is rounded
   once, to 2 places, `HALF_EVEN` (fixture `selective-tax-single-rounding-2027`: 10.005 + 8.75 =
   18.755 gives 18.76). A missing rate counts as zero.
4. **Into the CBS/IBS base.** The published `vIS` is `impostoSeletivoCalculado` in the CBS/IBS base
   formula `baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado` (CF art. 153
   §6º IV), so the cigars case taxes 2,000.00 + 473.00 = 2,473.00.

The result (`items[].selectiveTax`) has the published figures of the NF-e `IS` group:

```json
"selectiveTax": {
  "cstCode": "000", "cClassTrib": "000001", "baseAmount": "2000.00",
  "adValoremRate": "13.00", "adRemRate": "21.30", "unit": "VN", "quantity": "10", "amount": "473.00",
  "treatmentDescription": "Tributação pelo Imposto Seletivo - Com Cálculo",
  "rateSources": { "adValorem": "nominal", "adRem": "nominal" },
  "calculationSteps": [ ... ]
}
```

A rate the item lacks is `null`, and `unit` and `quantity` appear only with an ad rem rate.
`quantity` is printed as upstream's `TDec1104`: a whole number, or 4 places (`"2.5000"`).

`GET /api/classifications/selective-tax?date=` lists the IS classifications of the date (29 in
2027), with their CST and whether their treatment calculates, for the form's picker. The NCM search
says, per match, whether the IS applies on the date and with which rates
(`selectiveTax: { hasAdValorem, adRemUnit }`), and carries the windows behind it
(`selectiveTaxWindows`), which the form checks again when the date changes; the ETL stores them
in `SEARCH_NCM` (`docs/open-data.md`, Search tables).

## Differences from upstream

- **A CST without the IBS/CBS group is not calculated.** Upstream runs the formulas and drops the
  result; the port skips them, so a missing rate on such an item cannot fail it.
- **Rates by NBS are not looked up.** `ALIQUOTA_AD_VALOREM_SERVICO` is empty at `V0073`, so the
  sectoral rate comes from the classification only, as upstream falls back to.
- **Blank formulas count as absent**, as upstream (`StringUtils.isNotBlank`): 7 are stored as `""`.
- **Imposto Seletivo incidence is checked by NCM only.** Upstream also checks a 9-digit NBS against
  `ALIQUOTA_AD_VALOREM_SERVICO`, which is empty at `V0073`.
- **The IS group takes its rates, and no base of its own.** Upstream's IS group has `baseCalculo`
  and `impostoInformado`, and its rates sit in `aliquotasNominais.impostoSeletivo`; here the rates
  sit in the group and the IS base is the item's `baseAmount`, the case where upstream derives the
  item base as the IS base (`validarBaseCalculoLegado`). Rates typed for an NCM without the IS are
  calculated, as upstream does; a group with no rate there is ignored, as upstream's disabled
  `REG-014` leaves it.
- **An IS group before 2027 rejects the item** (`REG-004` on `selectiveTax.cstCode`), where upstream
  answers `404` for the whole operation.
- **A missing reduction percentage fails the request** (`500`), where upstream fails the item
  (`PercentualReducaoService.buscar` throws). Every calculable classification has its three rows
  at `V0073`.

## Cost on the Free plan

Measured on 2026-11-20:

- **D1 calls:** at most 6 per request, whatever the number of items: the UF, the municipality, the document
  type, the rates, the data version, and one batch with 14 statements per item (12 until Epic 12,
  which replaced the Imposto Seletivo check with its CST, its classification and treatment, and
  the NCM rate rows). A batch counts as
  one query against the Free plan's 50 queries per invocation (D1 limits page); the Workers page
  does not say how it counts against the 50 subrequests, so the items share one call.

- **D1 rows read:** 720 per item for cClassTrib `000001` and 1,302 for `200005`, the classification
  with the largest NCM annex, measured on 2026-11-21 with the calculation indexes (`docs/open-data.md`,
  Lean D1). Without them an item read about 3,900. The D1 tests fail above 1,500. With 5 million
  reads a day, that was about 3,800 calculated items a day at the costliest classification; the 720 and 1,302 are the 2026-11-21 figures, and only `000001` was measured again after Epic 12. Epic 12
  (2026-11-22) took the Imposto Seletivo check, 335 rows, to a few, through the two upstream
  indexes on the IS product tables: a 2027 item of `000001` reads 392 rows, and one with the IS
  group 516. What remains is the annex queries.
- **CPU:** a 20-item calculation took 0.44 ms warm and about 4 ms on its first run, in Node 24 on
  the developer machine, against the 10 ms Free limit, where waiting on D1 does not count. Not
  measured on the edge.
