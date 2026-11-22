# Regular regime golden fixtures

Request and response pairs captured from the upstream regular regime calculator. The Epic 3
TypeScript engine must reproduce every calculated value in them; fields marked `<volatile>` and the
error `type` URLs are excluded (see Files).

Calculator version, database version and the HTTP status of each case are in `manifest.json`.

## Files

| File | Content |
| --- | --- |
| `<case>.input.json` | The operation, as posted. |
| `<case>.output.regime-geral.json` | `{ status, body }` from `POST /api/calculadora/regime-geral`. |
| `<case>.output.observabilidade.json` | `{ status, body }` from `POST /api/calculadora/observabilidade/regime-geral`. |
| `manifest.json` | Upstream versions and the status per case and endpoint. |

Error bodies from `/regime-geral` carry a `timestamp` with the request time. The capture script
replaces it with `<volatile>`, so a recapture against the same upstream version leaves no diff.

Error bodies also carry URLs built from the host that served the request: `type` in the 422 body of
`/regime-geral` (`http://localhost/errors/ncm-nao-vinculada`) and `erros[].type` in observability
responses. Recapture through `localhost`, or every error file changes. These URLs are upstream detail,
not part of the contract the TypeScript engine must reproduce. The error code (`REG-011`) appears
only in the observability response; the `/regime-geral` 422 body has `title` and `detail` instead.

The script fails without writing anything if a response is not 200 or 422 with a JSON body, so a
wrong `--base-url` or a stopped calculator leaves the fixtures as they were.

## Cases

All data is fictitious. Municipalities: `4314902` Porto Alegre (RS), `3550308` São Paulo (SP).
`tpDoc` `55` is NF-e, `91` is NFS-e.

| Case | What it pins | Observability state |
| --- | --- | --- |
| `full-rate-goods-2026` | Goods at the full 2026 test rates: CBS 0.9%, IBS UF 0.1%, IBS Mun 0% | `CALCULADO` |
| `basic-food-basket-2026` | 100% reduction, cClassTrib `200003` | `CALCULADO` |
| `education-service-60pct-2026` | Service by NBS on an NFS-e, 60% reduction, cClassTrib `200028` | `CALCULADO` |
| `full-rate-goods-2027-nominal` | 2027 with nominal rates supplied by the operation | `CALCULO_SIMULADO` |
| `education-service-60pct-2027-nominal` | 2027 service with nominal rates and a 60% reduction | `CALCULO_SIMULADO` |
| `multi-item-2026` | Three items, mixed treatments, operation totals | `CALCULADO` ×3 |
| `rounding-half-even-2026` | Exact halves (`0.005`, `0.025`) rounded `HALF_EVEN` | `CALCULADO` ×4 |
| `upstream-rounding-t1` | Upstream rounding case T1 | `CALCULADO` |
| `upstream-rounding-t4` | Upstream rounding case T4: a 4-place nominal rate (`8.8123`) | `CALCULO_SIMULADO` |
| `error-ncm-not-linked-2026` | NCM not linked to the cClassTrib: 422 / `REG-011` | `INCONSISTENCIA_ENTRADA` |
| `error-nominal-rates-before-2027` | Nominal rates sent before 2027: 422 / `REG-036` | `INCONSISTENCIA_ENTRADA` |
| `error-nominal-rates-missing-2027` | Nominal rates missing from 2027: 422 / `REG-037` | `INCONSISTENCIA_ENTRADA` |
| `selective-tax-cigars-2027` | Imposto Seletivo on cigars and cigarillos (NCM `24021000`), ad valorem 13% plus ad rem R$ 21,30 × 10 VN, as the upstream test `Teste_000001_2`; the IS enters the CBS/IBS base | `CALCULO_SIMULADO` |
| `selective-tax-vehicle-2028` | Imposto Seletivo, ad valorem only (5.27%) on NCM `87032100` | `CALCULO_SIMULADO` |
| `selective-tax-no-calculation-2027` | IS cClassTrib `200007` ("Sem Cálculo"): `vIS` 0.00 with the typed rates echoed | `CALCULO_SIMULADO` |
| `selective-tax-single-rounding-2027` | IS rounded once: 10.005 + 8.75 = 18.755 gives 18.76 `HALF_EVEN`; a fractional quantity | `CALCULO_SIMULADO` |
| `selective-tax-multi-item-2027` | Beer and a sugary drink with IS next to an item without it; `ISTot` | `CALCULO_SIMULADO` ×3 |
| `error-selective-tax-missing-2027` | NCM with IS and no IS group: 422 / `REG-013` | `INCONSISTENCIA_ENTRADA` |
| `error-selective-tax-rate-missing-2027` | IS group with no IS rate: 422 / `REG-035` | `INCONSISTENCIA_ENTRADA` |
| `error-selective-tax-ad-rem-quantity-2027` | Ad rem rate with no IS quantity: 422 / `REG-023` | `INCONSISTENCIA_ENTRADA` |

An IS group before 2027 is not a fixture: upstream answers `404` ("Situação tributária (CST) não
encontrada … (Imposto Seletivo)"), which the capture script does not accept. The engine pins that
message in a unit test.

## Recapture

Start the calculator (`docs/upstream.md`, Running the regular regime calculator), then:

```powershell
node scripts/fixtures.capture.mjs --target regime-regular
```

`--target` defaults to `regime-regular`; the Simples Nacional fixtures use `--target simples-nacional`
(`fixtures/simples-nacional/README.md`).

`--base-url` points the script at another port; the default is `http://localhost:8080/api/calculadora`.
Keep the host `localhost` (see Files). A diff after an upstream bump is a behaviour change to review
before the TypeScript engine follows it.

## License notice

`upstream-rounding-t1.input.json` and `upstream-rounding-t4.input.json` are copies of
`src/test/resources/entradas/arredondamento/T1.json` and `T4.json` from
[calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular).
Every output file is produced by that software.

> MIT License. Copyright (c) 2026 Receita Federal do Brasil. The full license text is in
> `upstream/calculadora-rtc-regime-regular/LICENSE`.
