# Simples Nacional calculation

How the simulator calculates CBS and IBS for a Simples Nacional company, ported from two endpoints of
the upstream calculator (`docs/upstream.md`, Running the Simples Nacional calculator): the classic one
for documents with CRT and the non-assisted one (`nao-assistido`) for the NFS-e. The port lives in
`src/features/simples-nacional/`; the activity list in `src/features/simples-activities/`. Every value
the 16 classic golden fixtures (`fixtures/simples-nacional/README.md`) and the 20 NFS-e ones
(`fixtures/simples-nacional-nfse/README.md`) pin is reproduced.

## What it covers

- NF-e (`55`) and NFC-e (`65`) operations dated 2027-01-01 or later, up to 20 items, through the
  classic path: each item carries its effective rates.
- `CRT` `1` (Simples Nacional), `2` (sublimit exceeded) and `3` with `ibsCbsRegime` `2` (Simples option
  pending). The form offers `1` and `2`; the API takes all three.
- NFS-e (`91`) operations dated 2027-01-01 or later, with exactly one item, through the non-assisted
  path: the operation carries the company's row of effective rates (`effectiveRates`), and the
  calculator picks the item's rate pair by annex, Fator R, ISS situation and regime fields (NFS-e path).
- Government purchases (`governmentEntity`), with the transition factor of the operation date.

Out of scope: the MEI (`CRT` `4`, `simplesOption` `2`) and the provider not opting for the Simples
(`simplesOption` `1`), both refused upstream too; the assisted upstream endpoint, which reads the rates
from the PGDAS table by the company's CNPJ; the `resolucaoAliquotas` block and the warnings
(`avisos`) of the non-assisted response, which explain the pair but change no value. The Imposto
Seletivo is not calculated here: the item takes it as `selectiveTaxAmount` (`0.00` when not sent), as
upstream takes `valorImpostoSeletivo`, and it adds to the item total without entering the base (no
revenue type has `TRBS_IN_IS_COMPOE_RECEITA` set; golden case `selective-tax-cigars-2027`). The
simulator sends the IS the regular regime calculated for the item, so it waits for that answer
when an item carries the IS (`fillSelectiveTaxAmounts` in `simples.draft.ts`). The NFS-e has no IS.

The document type on the date decides the path, from `TIPO_DFE_CALCULO_SIMPLES_NACIONAL`: its regime
vocabulary (`CRT` or `NFSE`), rate places, item cap and Imposto Seletivo flag.

A form built on it (rules in `simples.draft.ts` and `simples.nfse.draft.ts`) asks one
activity and one rate pair. On the NFS-e it offers `simplesOption` `3` and `4` and
`ibsCbsAssessmentRegime` `1` and `2` (with `3` nothing is compared), puts the pair in the annex of the
chosen activity (activity `09` by the Fator R), takes the pair without the ISS redistribution as
optional on annexes III to V, sets `isSublimitExceeded` from `ibsCbsAssessmentRegime` `2`, and asks the
ISS facts only for the activities that use them.

## Endpoints

### `POST /api/simples-nacional-calculations`

Body for the NF-e and NFC-e (`SimplesOperation` in `simples.dto.ts`; field meanings in
`docs/glossary.md`):

```json
{
  "taxEventDate": "2027-03-10",
  "documentType": 55,
  "crt": 1,
  "items": [
    {
      "itemNumber": 1,
      "activityCode": "01",
      "cClassTrib": "000001",
      "ncmCode": "22030000",
      "baseAmount": "1000.00",
      "cbsSimplesRate": "2.3591",
      "ibsSimplesRate": "0.0260"
    }
  ]
}
```

Body for the NFS-e (`NfseSimplesOperation`):

```json
{
  "taxEventDate": "2027-03-10",
  "documentType": 91,
  "simplesOption": 3,
  "ibsCbsAssessmentRegime": 1,
  "simplesTaxesAssessmentRegime": 1,
  "effectiveRates": {
    "isFatorRAtLeast28": false,
    "isSublimitExceeded": false,
    "annexI": { "cbsSimplesRate": "1.1612", "ibsSimplesRate": "0.0129" },
    "annexII": { "cbsSimplesRate": "1.2843", "ibsSimplesRate": "0.0141" },
    "annexIII": {
      "cbsSimplesRate": "2.3874",
      "ibsSimplesRate": "0.0263",
      "withoutIssRedistribution": { "cbsSimplesRate": "2.1012", "ibsSimplesRate": "0.0231" }
    },
    "annexIV": { "cbsSimplesRate": "1.9530", "ibsSimplesRate": "0.0215" },
    "annexV": { "cbsSimplesRate": "2.7210", "ibsSimplesRate": "0.0300" }
  },
  "items": [
    {
      "itemNumber": 1,
      "activityCode": "07",
      "cClassTrib": "000001",
      "nbsCode": "114011100",
      "baseAmount": "10000.00",
      "issTaxation": 1,
      "issWithholding": 2
    }
  ]
}
```

| NFS-e field | Values |
| --- | --- |
| `simplesOption` | Required. `1` not opting, `2` MEI (both `VSN-019`), `3` ME/EPP, `4` option pending. |
| `ibsCbsAssessmentRegime` | `1` IBS and CBS through the Simples, `2` only the CBS (no IBS in the result), `3` both under the regular regime (the item is `notCalculated`, `revenueOnlyRegime`). Required with `simplesOption` `3` or `4` (`VSN-031`). |
| `simplesTaxesAssessmentRegime` | `1` federal taxes and ISS through the Simples, `2` ISS outside it, `3` both outside it. Required with `simplesOption` `3` or `4` (`VSN-032`). Only picks the pair. |
| `effectiveRates` | Required when the regime calculates taxes (`VSN-039`). Every rate is a percentage string with up to 3 integer digits and 34 places (`VSN-005` CBS, `VSN-007` IBS, for the whole operation). An annex or pair no item uses may be left out; the pair the item uses must have the rates it needs (`VSN-004`, `VSN-006`). `isFatorRAtLeast28` is required for activity `09` (`VSN-040`). |
| `issTaxation` | `1` to `4`. Required for the activities with the ISS in the Simples (`07`, `09`, `10`, `12`, `13`, `14`) (`VSN-036`). |
| `issWithholding` | `1` to `3`. Required with `issTaxation` `1` for those activities (`VSN-037`); dropped with `issTaxation` `2` to `4`. |
| `municipalBenefit` | `1` to `4`, optional (`VSN-038`). Dropped for any activity but `12` and `13`. |

| Status | When |
| --- | --- |
| 200 | Every operation rule held. Each item has its own `status`: `calculated`, `notCalculated`, `rejected` (with `violations`) or `notImplemented`. |
| 400 `INVALID_INPUT` | The body shape (date, `documentType`, the regime codes, `governmentEntity`, `effectiveRates`, 1 to 20 items, `itemNumber`, item fields as strings, ISS codes as integers), or an operation rule upstream answers with 422: `VSN-015` (document not enabled on the date, which covers every date before 2027), `VSN-016`, `VSN-018`, `VSN-019`, `VSN-025`, `VSN-026`; on the NFS-e also `VSN-030` to `VSN-034`, `VSN-039`, `VSN-005` and `VSN-007` of the rate line. The message starts with the code. |

The fields of one family are refused on the other: `crt` and `ibsCbsRegime` on the NFS-e, the NFS-e
regime fields on the NF-e and NFC-e (`VSN-033`, as upstream); `effectiveRates` and the item ISS codes
on the NF-e and NFC-e, and the item rates on the NFS-e (no code: upstream would ignore them silently).

Item values (base, rates, cClassTrib, NCM or NBS, activity) are checked per item, as upstream does, so a
bad item does not hide the others. Unlike the regular regime, upstream collects every error of an item,
so `violations` can hold more than one, in upstream order. As upstream, items come back in `itemNumber`
order, and the activity and the cClassTrib are trimmed before they are looked up.

Each tax of a calculated item (`cbs`, `ibs`) also carries `calculationSteps`, the same shape as the
regular regime's (`docs/calculation.md`, Calculation steps). No formula is stored for the Simples, so
the steps name the ones the port applies:

| `step` | `formula` | When |
| --- | --- | --- |
| `rate` | `null` | The PGDAS effective rate the visitor sent, as a fraction (after the layout rounding on the NFS-e). |
| `rate` | `aliquotaCbs+aliquotaIbs` (CBS), `0` (IBS) | A Union purchase (`governmentEntity` 1), arts. 372 and 473 of LC 214/2025. |
| `rate` | `aliquotaCbs*(1-fatorCompraGov)` (CBS), `aliquotaIbs+fatorCompraGov*aliquotaCbs` (IBS) | A state or municipal purchase, with the transition factor of the year. |
| `calculatedTax` | `receitaBruta*fatorReceita*aliquota` | Always, rounded once to 2 places. |

On the NFS-e the rate step also carries `roundedToPlaces: 2`: the layout prints the rate at 2
places and the value is calculated with that printed rate, so the screen says the rounding happened.
A tax without a rate has no steps. The last step is the value before the regime sends it to
`dueAmount`, `pendingAmount` or nowhere, so it equals their sum unless the destination is zero
(`simples.golden.d1.test.ts` and `simples.nfse.golden.d1.test.ts`, "ends the steps of every tax").

### `GET /api/simples-nacional-activities?date=YYYY-MM-DD&documentType=55`

The activities (`cAtivSN`) the document admits on the date, in catalogue order, each with its annex
label and the flags the NFS-e form needs: `annexWithoutFatorR`, `annexWithFatorR` (set only for the
activities subject to the Fator R), `hasIssInSimples` (the ISS facts are asked) and
`allowsMunicipalBenefit`. Empty before 2027. One query over 15 rows.

## Rules

In the order `ProcessadorItemSimples.processarItem` applies them:

1. A cClassTrib whose treatment has an adjustment ends `notImplemented` (`VSN-027`), as in the regular
   regime port.
2. The base (`VSN-001`, `VSN-002`), the NCM or NBS shape and existence (`VSN-041`, `VSN-049` to
   `VSN-051`) and the Imposto Seletivo amount (`VSN-003`).
3. The cClassTrib gives the revenue type (tpRBSN): unknown (`VSN-021`), not allowed on the document
   (`VSN-022`).
4. The NCM or NBS against the classification's annex, the same rules as the regular regime
   (`VSN-042` to `VSN-048`). The Simples copy of `NomenclaturaService` lists only `200038` as a split
   annex, not `515001`.
5. The activity: missing, unknown or not allowed on the document makes the item `notCalculated`, with
   its revenue still in the totals. Activity `90` (non-taxable) with a revenue type that refuses it is
   `VSN-023`.
6. The rates are required only when the activity holds and the revenue type needs them (`VSN-004`,
   `VSN-006`); the IBS rate only when the regime has IBS. A malformed rate is always an error
   (`VSN-005`, `VSN-007`).

The calculation (`simples.calculate.ts`): gross revenue × revenue factor (1, 0.5 or 0) × rate / 100,
exact, rounded once to 2 places `HALF_EVEN`. The revenue type decides whether the value is due or
pending; the regime decides where each goes (`CRT` `3` with a pending option sends due values to
pending and pending ones to zero). Rates print with 2 to 4 places, but the calculation uses every place
sent. Totals add the rounded values, and a total no item has is `null` (no IBS at all with `CRT` `2`).

tpRBSN 5 (factor 0.5) has no fixture, since its only cClassTrib is admitted on the BP-e alone; a unit
test pins it (`simples.calculate.test.ts`).

## NFS-e path

What `CalculoSimplesUnificadoService` adds for the NFS-e, in its order:

1. The regime comes from the NFS-e rows of `ENQUADRAMENTO_REGIME_SIMPLES_NACIONAL`, by `simplesOption`
   and `ibsCbsAssessmentRegime`. `simplesOption` `1` and `2` have none (`VSN-019`).
2. The revenue type prefers the NFS-e rows of `TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL`: tpRBSN 4 and 5 tax
   nothing on the NFS-e.
3. A single-digit activity gets its leading zero (`7` is `07`), since the DPS field is numeric.
4. The Imposto Seletivo must be absent or zero (`VSN-035`) and stays out of the result
   (`selectiveTaxAmount` `null`).
5. The rate pair (`simples.pair.choose.ts`, from `EscolhaParAliquotasService`): activity `09` takes annex
   III with `isFatorRAtLeast28`, otherwise V; activity `90` takes a zero pair; annexes I and II have a
   single pair. On annexes III to V the pair without the ISS redistribution applies when the first of
   these holds: the sublimit is exceeded (`isSublimitExceeded`), `ibsCbsAssessmentRegime` `2` or
   `simplesTaxesAssessmentRegime` `2` or `3`, the activity has no ISS in the Simples (`08` and `11`
   on the NFS-e), `issTaxation` `2` to `4`, `municipalBenefit` `1`, or
   `issWithholding` `2` or `3`. Otherwise the pair with it. A pair without redistribution that was not
   sent falls back to the pair with it. The rules after the impediment come from
   `SITUACAO_ISS_PAR_ALIQUOTA_SIMPLES_NACIONAL`.
6. The rate is rounded to 2 places `HALF_EVEN` (`TDCS_CASAS_ALIQUOTA_CALCULO`) after the government
   purchase shift, and the value is the base × that rounded rate, as the NFS-e layout prints it.

## Cost on the Free plan

Two D1 batches per request: one for the operation parameters (6 small queries, among them the 14
revenue type rows and the 10 ISS situation rows the NFS-e reads, about 50 rows), one for every item (7
queries each, two of them the regular regime's NCM and NBS annex queries). The NFS-e reads the same
item queries; its one item costs about the same as an NF-e item.

| Operation | Rows read (local D1, 2026-11-21) | Before the calculation indexes |
| --- | --- | --- |
| NF-e, 1 item, cClassTrib `000001` | 531 | 3,121 |
| NF-e, 1 item, cClassTrib `550001` | 617 | 3,611 |
| NF-e, 20 items, cClassTrib `550001` | 10,478 | 71,042 |
| NFS-e, 1 item, cClassTrib `000001` (each of the 14 calculated fixtures) | 555 to 562 | not measured |

The route test pins 800 rows per item, and the NFS-e golden test pins the same bound for each of its
fixtures. A side-by-side simulation runs both calculations, so one item cost about 720 + 531 rows,
and up to 1,302 + 617 at the costliest classification, by the 2026-11-21 figures (a 2027 `000001`
item read 392 after Epic 12, `docs/calculation.md`); the 5M daily reads then allow roughly 2,500
compared items a day. The calculation indexes cut the annex scans that
dominated both (`docs/open-data.md`, Lean D1), and rate limiting caps how fast one address spends the
reads (`docs/rate-limiting.md`).
