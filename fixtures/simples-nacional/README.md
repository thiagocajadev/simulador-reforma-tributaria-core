# Simples Nacional golden fixtures

Request and response pairs captured from the upstream Simples Nacional calculator, through its classic
endpoint. The Epic 5 TypeScript engine must reproduce every calculated value in them; fields marked
`<volatile>`, the error `type` URLs and the `memoriaCalculo` texts are excluded (see Files).

Calculator version, database version and the HTTP status of each case are in `manifest.json`.

## Files

| File | Content |
| --- | --- |
| `<case>.input.json` | The operation, as posted. |
| `<case>.output.observabilidade.json` | `{ status, body }` from `POST /api/calculadora/observabilidade/simples-nacional`. |
| `manifest.json` | Upstream versions and the status per case. |

These cases go through the classic endpoint, the one for documents with CRT; the NFS-e cases go through
the non-assisted endpoint (`fixtures/simples-nacional-nfse/README.md`). The classic endpoint works per item:
a 200 response carries one state per item (`estadoItem`), and only an operation-level error (date,
`tpDoc`, `CRT`, `tpRegimeIBSCBS`, `tpEnteGov`) rejects the whole operation with a 422. As in the regular
regime fixtures, the 422 body has its `timestamp` masked as `<volatile>`, and every error carries a
`type` URL built from the request host, so recapture through `localhost`.

Rates are printed with 2 to 4 places (`pIBSSN` `0.0260` comes back as `0.026`, `0.1` as `0.10`), but
every value is computed with the rate as posted, all its places included.

## Cases

All data is fictitious. Every case is an NF-e (`tpDoc` `55`) on 2027-03-10 with `CRT` `1`, activity
(`cAtivSN`) `01` and cClassTrib `000001`, unless the table says otherwise.

| Case | What it pins | Item states |
| --- | --- | --- |
| `goods-resale-2027` | Domestic revenue (tpRBSN 1): CBS and IBS on the whole base | `CALCULADO` |
| `basic-food-basket-nfce-2027` | NFC-e (`65`), cClassTrib `200003`: the regular regime reduction does not apply to the Simples | `CALCULADO` |
| `sublimit-excess-crt2-2027` | `CRT` `2`: CBS only, no IBS field in the response | `CALCULADO` |
| `pending-option-crt3-2027` | `CRT` `3` with `tpRegimeIBSCBS` `2`: everything pending; an indirect export becomes zero | `CALCULADO` ×2 |
| `indirect-export-2027` | cClassTrib `550001` (tpRBSN 4): the tax is pending or suspended, not due | `CALCULADO` |
| `revenue-without-tax-2027` | tpRBSN 0, 2 and 3 (`410001`, `410008`, `410004`): revenue factor zero | `CALCULADO` ×3 |
| `government-purchase-union-2027` | `tpEnteGov` `1`: the IBS rate moves into the CBS | `CALCULADO` |
| `government-purchase-state-2029` | `tpEnteGov` `2` in 2029: 10% of the CBS rate moves into the IBS | `CALCULADO` |
| `activity-not-calculated-2027` | `cAtivSN` missing, unknown (`77`, `1`) or not allowed on the NF-e (`07`) | `CALCULADO`, `NAO_CALCULADO` ×4 |
| `multi-item-2027` | Three items, due and pending totals | `CALCULADO` ×3 |
| `rounding-half-even-2027` | Exact halves (`0.005`, `0.015`, `0.025`) rounded `HALF_EVEN` | `CALCULADO` ×4 |
| `selective-tax-cigars-2027` | NCM `24021000` (cigars) with `valorImpostoSeletivo` `253.40`: the IS adds to `totalItem` and `totalIs`, outside the base | `CALCULADO` |
| `pgdas-full-precision-2027` | Rates with 28 decimal places, as the PGDAS publishes them | `CALCULADO` |
| `error-items-2027` | `VSN-004`, `VSN-007`, `VSN-023`, `VSN-047` and `VSN-027` next to a calculated item | one of each |
| `error-before-2027` | Date in 2026: the Simples calculation starts in 2027, 422 / `VSN-015` | none |
| `error-mei-crt4-2027` | `CRT` `4` (MEI) is out of scope: 422 / `VSN-019` | none |

tpRBSN 5 (domestic market and export, revenue factor 0.5) has no fixture: its only cClassTrib,
`222001`, is admitted on the BP-e and not on the NF-e or the NFC-e.

## Recapture

Start the calculator (`docs/upstream.md`, Running the Simples Nacional calculator), then:

```powershell
node scripts/fixtures.capture.mjs --target simples-nacional
```

The default base URL is `http://localhost:8082/api/calculadora`; `--base-url` points at another port.
A diff after an upstream bump is a behaviour change to review before the TypeScript engine follows it.

## License notice

Every output file is produced by
[calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional).

> MIT License. Copyright (c) 2026 Receita Federal do Brasil. The full license text is in
> `upstream/calculadora-rtc-simples-nacional/LICENSE`.
