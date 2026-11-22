# DANFSe layout

The DANFSe (Documento Auxiliar da NFS-e) is the printable PDF of a national NFS-e. This map comes from
the upstream generator `upstream/calculadora-rtc-gerador-danfse` (Go, version 1.0.0), which follows
technical note NT 008 (`docs/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf` in that repository).

Reference files in this repository:

| File | What |
| --- | --- |
| `fixtures/danfse/sample-nfse.xml` | Fictitious NFS-e whose IBS/CBS group matches `fixtures/regime-regular/education-service-60pct-2026`. |
| `fixtures/danfse/sample-danfse.pdf` | The PDF the generator renders from it, one A4 page. |

Paths below are relative to `upstream/calculadora-rtc-gerador-danfse/internal/`.

## Pipeline

| Step | Where | What it does |
| --- | --- | --- |
| 1 | `controller/danfse.go:32` | `POST /api/danfse`, body is the raw XML (`application/xml`). Query `stc` (0 valid, 1 replaced, 2 cancelled) and `canhoto` (receipt stub, default `true`). |
| 2 | `service/danfse_preparation.go:45` | Parses the XML into `domain/models/models.go`, checks the root is `NFSe` and `infNFSe/@Id` is set, builds the QR code URL, fills municipality names from the built-in IBGE catalog, truncates long texts. |
| 3 | `service/danfse_presenter.go:20` | Maps the note into `presentation.DocumentoDanfse` (`domain/presentation/danfse_document.go`): formatted strings only, no XML types. |
| 4 | `renderer/` | Draws the PDF directly with Folio (upstream ADR003). |

The XML namespace is not checked: Go matches elements by local name, so the official
`http://www.sped.fazenda.gov.br/nfse` namespace and no namespace both work.

## Two sources inside one XML

An NFS-e wraps the DPS (the issuer's declaration) inside the note the national environment returns.
The DANFSe reads from both:

- `infNFSe/DPS/infDPS`: what the issuer declared. Parties, service, ISSQN, federal taxes, totals, and
  for IBS/CBS only the classification: `CST`, `cClassTrib`, `cIndOp`, `finNFSe`.
- `infNFSe/IBSCBS`: what the national environment computed. Every IBS/CBS rate and amount on the
  DANFSe comes from here, not from the DPS.

So the simulator writes both (Epic 4): the DPS as an issuer would, and the `infNFSe/IBSCBS`
group that the national environment would return, filled from our own calculation.

## Sections

Top to bottom, as rendered in `sample-danfse.pdf`.

| Section | Presentation struct | Main XML source |
| --- | --- | --- |
| Header: logo, title, municipality, environment, watermark | `DadosCabecalho` | `emit/enderNac/cMun`, `ambGer`, `DPS/infDPS/tpAmb`, query `stc` |
| Access key, QR code, NFS-e and DPS numbers, dates, issuer type, status, purpose | `DadosAcesso` | `infNFSe/@Id`, `nNFSe`, `dhProc`, `cStat`, `infDPS/nDPS`, `serie`, `dhEmi`, `dCompet`, `tpEmit`, `IBSCBS/finNFSe` |
| Provider | `SecaoParte` | `infNFSe/emit`, `infDPS/prest/regTrib` |
| Taker | `SecaoParte` | `infDPS/toma` |
| Recipient, when one is given | `SecaoParte` | `infDPS/IBSCBS/dest` |
| Intermediary, when one is given | `SecaoParte` | `infDPS/interm` |
| Service | `DadosServico` | `infDPS/serv/cServ` (`cTribNac`, `cNBS`, `xDescServ`), `serv/locPrest`, `infNFSe/xTribNac` |
| Municipal taxation (ISSQN) | `DadosTributacaoMunicipal` | `infDPS/valores/trib/tribMun`, `infNFSe/valores` |
| Federal taxation, CBS excluded | `DadosTributacaoFederal` | `infDPS/valores/trib/tribFed` |
| IBS / CBS taxation | `DadosTributacaoIBSCBS` | see the next table |
| Totals | `DadosTotais` | `infDPS/valores/vServPrest/vServ`, discounts, withholdings, `infNFSe/valores/vLiq`, IBS/CBS totals |
| Additional information | `DadosInformacoesComplementares` | `infDPS/serv/infoCompl/xInfComp`, plus the approximate-taxes line (Lei 12.741/2012) |
| Receipt stub | `DadosCanhoto` | query `canhoto` |

## IBS / CBS block

The block this project fills. Built in `service/danfse_presenter.go:413`.

| DANFSe label | XML path | Sample value |
| --- | --- | --- |
| CST / cClassTrib | `infDPS/IBSCBS/valores/trib/gIBSCBS/CST`, `cClassTrib` | `200 / 200028` |
| Indicador de Operação / Código IBGE / Município / UF | `infDPS/IBSCBS/cIndOp`, `infNFSe/IBSCBS/cLocalidadeIncid`, `xLocalidadeIncid`, `uf` | `030101 / 4314902 / Porto Alegre / RS` |
| Exclusões e Reduções da Base de Cálculo | computed by the generator from the DPS values | `-` |
| Base de Cálculo Após Exclusões e Reduções | `infNFSe/IBSCBS/valores/vBC` | `R$ 1.200,00` |
| Red. Alíquota IBS / Red. Alíquota CBS | `valores/uf/pRedAliqUF`, `valores/mun/pRedAliqMun`, `valores/fed/pRedAliqCBS` | `60,00% / 60,00% / 60,00%` |
| Alíquota IBS UF / IBS Mun | `valores/uf/pIBSUF`, `valores/mun/pIBSMun` | `0,10% / -` |
| Alíq. Efetiva Municipal - IBS | `valores/mun/pAliqEfetMun` | `-` |
| Valor Apurado Municipal - IBS | `totCIBS/gIBS/gIBSMunTot/vIBSMun` | `-` |
| Alíq. Efetiva Estadual - IBS | `valores/uf/pAliqEfetUF` | `0,04%` |
| Valor Apurado Estadual - IBS | `totCIBS/gIBS/gIBSUFTot/vIBSUF` | `R$ 0,48` |
| Valor Total Apurado - IBS | `totCIBS/gIBS/vIBSTot` | `R$ 0,48` |
| Alíquota - CBS | `valores/fed/pCBS` | `0,90%` |
| Alíquota Efetiva - CBS | `valores/fed/pAliqEfetCBS` | `0,36%` |
| Valor Total Apurado - CBS | `totCIBS/gCBS/vCBS` | `R$ 4,32` |

The Totals section adds `Total do IBS/CBS` (`R$ 4,80`) and `Valor líquido da NFS-e + IBS/CBS`
(`R$ 1.204,80`).

### Mapping from the calculator response

The calculator and the NFS-e name the same numbers differently. From
`fixtures/regime-regular/<case>.output.regime-geral.json`, path
`body.objetos[n].tribCalc.IBSCBS`:

| Calculator | NFS-e `infNFSe/IBSCBS` |
| --- | --- |
| `gIBSCBS/vBC` | `valores/vBC` |
| `gIBSUF/pIBSUF` | `valores/uf/pIBSUF` |
| `gIBSUF/gRed/pRedAliq` | `valores/uf/pRedAliqUF` |
| `gIBSUF/gRed/pAliqEfet` | `valores/uf/pAliqEfetUF` |
| `gIBSUF/vIBSUF` | `totCIBS/gIBS/gIBSUFTot/vIBSUF` |
| `gIBSMun/pIBSMun`, `gRed/pRedAliq`, `gRed/pAliqEfet`, `vIBSMun` | `valores/mun/pIBSMun`, `pRedAliqMun`, `pAliqEfetMun`, `totCIBS/gIBS/gIBSMunTot/vIBSMun` |
| `gIBSCBS/vIBS` | `totCIBS/gIBS/vIBSTot` |
| `gCBS/pCBS`, `gRed/pRedAliq`, `gRed/pAliqEfet`, `vCBS` | `valores/fed/pCBS`, `pRedAliqCBS`, `pAliqEfetCBS`, `totCIBS/gCBS/vCBS` |
| `CST`, `cClassTrib` | `infDPS/IBSCBS/valores/trib/gIBSCBS/CST`, `cClassTrib` |

The calculator does not compute two more values the NFS-e needs:

- `totCIBS/vTotNF`, which the DANFSe prints as "Valor líquido da NFS-e + IBS/CBS"
  (`service/danfse_presenter.go:495`). In the sample it is the service value plus IBS plus CBS. The
  generator computes "Total do IBS/CBS" itself, as `vIBSTot + vCBS` (`:482`).
- `cIndOp` in the DPS. The database lists the allowed indicators per NBS and cClassTrib
  (`CLASSIF_NBS_INDOP_LC`, `INDICADOR_OPERACAO_IBS_CBS`), and the list depends on the date. For NBS
  `122011200` with `200028`: four options (`030101` to `030104`) until 2026-11-30, and from
  2026-12-01 two, where `030102` changes meaning from "Endereço do Tomador" to "Local da Prestação".
  It is a choice the issuer makes, not a derivation. The sample uses `030101`, "Estabelecimento do
  Prestador/Fornecedor".

## Rendering rules worth knowing

- Zero and absent values print as `-`, not `R$ 0,00` or `0,00%` (`domain/presentation/danfse_format.go`,
  the `...OuTraco` formatters).
- `tpAmb` `2` prints `NFS-e SEM VALIDADE JURÍDICA` in the header and "Homologação" as the environment.
  The sample uses it so the PDF cannot pass for a real note.
- `stc` `1` or `2` draws a `SUBSTITUÍDA` or `CANCELADA` watermark (`domain/enums/situacao.go:24`).
- The QR code always points to the official public lookup with the access key from `infNFSe/@Id`
  (`service/danfse_preparation.go:98`). A fictitious key can never match a real note there; the page
  it opens was not checked.
- The service description is cut to 1,300 characters, ellipsis included, and the additional
  information to 2,000. When the additional information is cut, the Lei 12.741/2012 totals line is
  kept whole after it (NT 008 rule, `service/danfse_preparation.go:214`).
- The `Red. Alíquota IBS / Red. Alíquota CBS` label has two parts but prints three values (UF, Mun,
  CBS). Upstream behaviour, kept as is.

## WebAssembly build

The generator also compiles to WebAssembly (`cmd/danfse-wasm/main.go`, upstream ADR005). It shares the
whole core with the HTTP server and exposes a `danfseWasm` global to JavaScript, taking
`{ xml, stc, canhoto }` and returning `{ pdf, size }` with the PDF in base64. It was weighed for
Epic 4, "render the DANFSe PDF in the browser": the same layout as the official generator, without a
JavaScript PDF library.

Measured once, on 2026-11-20, on the developer's machine, for that decision, with `GOOS=js GOARCH=wasm go build -ldflags="-s -w"`, Go 1.27.4:

| Artifact | Size |
| --- | --- |
| `danfse.wasm` | 27.8 MB |
| `danfse.wasm`, gzip | 7.4 MB |

27.8 MB may be above the Cloudflare static asset limit per file (25 MiB the last time it was checked;
not verified). Epic 4 did not take this path: shipping it means building the upstream repository
in CI, which this project never does, so the DANFSe is drawn with jsPDF instead (`docs/nfse.md`, PDF).
