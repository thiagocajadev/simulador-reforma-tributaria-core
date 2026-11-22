# Simples Nacional NFS-e golden fixtures

Request and response pairs captured from the upstream Simples Nacional calculator, through its
non-assisted endpoint (`POST /api/calculadora/observabilidade/simples-nacional/nao-assistido`), for the
NFS-e (`tpDoc` `91`). The TypeScript engine must reproduce every calculated value in them
(`simples.nfse.golden.d1.test.ts`); the `resolucaoAliquotas` block, the `memoriaCalculo` texts, the
warnings, the error `type` URLs and the fields marked `<volatile>` are excluded (see Files).

Calculator version, database version and the HTTP status of each case are in `manifest.json`.

## Files

| File | Content |
| --- | --- |
| `<case>.input.json` | The operation, as posted. |
| `<case>.output.nao-assistido.json` | `{ status, body }` from the non-assisted endpoint. |
| `manifest.json` | Upstream versions and the status per case. |

Unlike the classic endpoint, the operation carries the company's row of effective rates
(`aliquotasEfetivas`, one pair per annex and a second pair without the ISS redistribution on annexes
III to V), and the calculator picks each item's pair. A 200 response also carries
`resolucaoAliquotas`, which names the annex, the pair type and the rule that picked it; the cases below
use rates that differ at 2 places between pairs, so the calculated rate already shows which pair was
used. Operation errors (regime fields, item count, the rate line) answer 422 with the `timestamp`
masked as `<volatile>`; every error carries a `type` URL built from the request host, so recapture
through `localhost`.

On the NFS-e the rate is rounded to 2 places `HALF_EVEN` before the value is calculated (`pCBSSN`
`2.3874` is used as `2.39`), and there is no Imposto Seletivo group in the result.

## Cases

All data is fictitious. Every case is an NFS-e on 2027-03-10 with `opSimpNac` `3` (ME/EPP),
`regApIBSCBSSN` `1`, `regApTribSN` `1`, cClassTrib `000001`, activity (`cAtivSN`) `07`, NBS `114011100`
(management consulting), `tribISSQN` `1`, `tpRetISSQN` `1` and this rate line, unless the table says
otherwise:

| Annex | With redistribution (`pCBSSN` / `pIBSSN`) | Without redistribution |
| --- | --- | --- |
| I | `1.1612` / `0.0129` | (single pair) |
| II | `1.2843` / `0.0141` | (single pair) |
| III | `2.3874` / `0.0263` | `2.1012` / `0.0231` |
| IV | `1.9530` / `0.0215` | `1.7764` / `0.0196` |
| V | `2.7210` / `0.0300` | `2.4448` / `0.0269` |

| Case | What it pins | Item state |
| --- | --- | --- |
| `consulting-annex-iii-2027` | Default rule (`PADRAO`): annex III with redistribution; `cAtivSN` `7` padded to `07`; rates rounded to `2.39` / `0.03` | `CALCULADO` |
| `iss-withheld-by-buyer-2027` | `tpRetISSQN` `2` (`ISS_RETIDO`): the pair without redistribution | `CALCULADO` |
| `iss-immunity-without-pair-2027` | `tribISSQN` `2` (`ISS_NAO_INCIDE`), `tpRetISSQN` sent and dropped, no pair without redistribution in annex III: the pair with it applies | `CALCULADO` |
| `fator-r-annex-iii-2027` | Activity `09` (engineering consulting, NBS `114031000`) with `fatorR` `true`: annex III | `CALCULADO` |
| `fator-r-annex-v-2027` | Activity `09` with `fatorR` `false`: annex V | `CALCULADO` |
| `accounting-fixed-iss-2027` | Activity `08` (accounting, NBS `113022100`), no ISS in the Simples (`ATIVIDADE_SEM_ISS`), no ISS fields sent | `CALCULADO` |
| `construction-municipal-exemption-2027` | Activity `13` (construction, NBS `101011100`), annex IV, `tpBM` `1` (`ISENCAO_MUNICIPAL`) | `CALCULADO` |
| `sublimit-impediment-2027` | `impedimentoSublimite` `true` with `regApIBSCBSSN` `2` and `regApTribSN` `2` (SaaS, NBS `115062100`): CBS only, pair without redistribution, no IBS in the line | `CALCULADO` |
| `iss-outside-simples-2027` | `regApTribSN` `3` (`ISS_FORA_DO_SIMPLES` from the situation table), activity `14` (cleaning, NBS `118031000`), annex IV | `CALCULADO` |
| `revenue-only-regime-2027` | `regApIBSCBSSN` `3` (`SOMENTE_RECEITA`): no rate line needed, only the revenue | `NAO_CALCULADO` |
| `pending-option-2027` | `opSimpNac` `4` (option pending, `PENDENTE`): every value pending | `CALCULADO` |
| `government-purchase-union-rounding-2027` | `tpEnteGov` `1`: `2.3750` + `0.0100` = `2.385` rounded after the shift, `HALF_EVEN`, to `2.38` | `CALCULADO` |
| `error-missing-fator-r-2027` | Activity `09` without `fatorR`: `VSN-040`, pointing at the rate line | `INCONSISTENCIA_ENTRADA` |
| `error-iss-fields-2027` | Activity `13` with `tribISSQN` `5` and `tpBM` `9`: `VSN-036`, `VSN-038` | `INCONSISTENCIA_ENTRADA` |
| `error-not-opting-2027` | `opSimpNac` `1` (not opting): 422 / `VSN-019` | none |
| `error-mei-2027` | `opSimpNac` `2` (MEI): 422 / `VSN-019` | none |
| `error-missing-effective-rates-2027` | No `aliquotasEfetivas`: 422 / `VSN-039` | none |
| `error-invalid-rate-text-2027` | `2,3874` and `-0.0231` in annex III: 422 / `VSN-005`, `VSN-007` | none |
| `error-crt-on-nfse-2027` | `CRT` sent on an NFS-e: 422 / `VSN-033` | none |
| `error-two-items-2027` | Two items: the NFS-e takes one, 422 / `VSN-034` | none |

## Recapture

Start the calculator (`docs/upstream.md`, Running the Simples Nacional calculator), then:

```powershell
node scripts/fixtures.capture.mjs --target simples-nacional-nfse
```

The default base URL is `http://localhost:8082/api/calculadora`; `--base-url` points at another port.
A diff after an upstream bump is a behaviour change to review before the TypeScript engine follows it.

## License notice

Every output file is produced by
[calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional).

> MIT License. Copyright (c) 2026 Receita Federal do Brasil. The full license text is in
> `upstream/calculadora-rtc-simples-nacional/LICENSE`.
