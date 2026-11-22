# NFS-e and DANFSe

When an operation is an NFS-e (document type `91`) with one calculated service, the simulator
offers two files, both built in the browser:

- the NFS-e XML, with the DPS as an issuer would declare it and the `infNFSe/IBSCBS` group the
  national environment would return, filled from our calculation;
- the DANFSe, the printable PDF of that note.

Neither is a real document. The parties, the numbers and the access key are placeholders, the
environment is always homologation (`tpAmb` and `ambGer` `2`), and nothing is sent to the national
environment. The layout reference is `docs/danfse-layout.md`.

## References

The ones the code links to are in `src/shared/content/official.sources.ts` under the registry id
shown.

| Reference | Registry id | What it settles |
| --- | --- | --- |
| [NT SE/CGNFS-e nº 008 v1.02](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf), Portal da NFS-e | `nfseDanfseNote` | The DANFSe layout. The upstream generator ships the same file (`upstream/calculadora-rtc-gerador-danfse/docs/`), with the same SHA-256 as the portal's, checked on 2026-11-22. |
| [Documentação técnica RTC](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc), Portal da NFS-e | `nfseTechnicalDocs` | The national NFS-e technical notes for the reform, the layout annexes (Anexo VI) and the operation indicators (Anexo VII). |
| [Gerador do DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse), Receita Federal | `danfseGenerator` | The DANFSe sections and the sample note and PDF in `fixtures/danfse/` (`docs/danfse-layout.md`). |
| `CLASSIF_NBS_INDOP_LC` and the indicator tables of the open data | `regularRegimeCalculator` | The LC 116 items and operation indicators allowed for an NBS and a cClassTrib (`GET /api/operation-indicators`). |

**Limitation:** the XML follows layout `1.01` and passes the XSD the regular-regime calculator ships
(Validation, below). It was not compared, field by field, with the latest notes on the portal (NT 009
v1.01 of 2026-10-01 and its Anexo VI v1.04.01). On 2026-11-22 the portal's production schema package
was `NFSe-ESQUEMAS_XSD-v1.01-20260209`, the restricted-production one `PRODREST-v1.01-20261020` (with
NT 009), and a portal news item put NT 009 in production on 01/12/2026; the XML is to be checked
again when that schema reaches the upstream.

## Flow

| Step | Where | What |
| --- | --- | --- |
| 1 | `src/features/calculations/` | The visitor calculates an NFS-e operation. The outcome keeps the operation it answers, so later edits to the form do not leak into the note. |
| 2 | `src/features/nfse/nfse.eligibility.ts` | An NFS-e needs document type `91`, one item with an NBS, status `calculated` or `simulated`, and IBS/CBS values (a CST without the IBS/CBS group has none). Otherwise the section explains why, or stays hidden for goods. |
| 3 | `GET /api/operation-indicators` | Lists the LC 116 items and operation indicators (`cIndOp`) allowed for the NBS and cClassTrib on the date. The visitor picks one of each, and writes the service description. |
| 4 | `nfse.document.ts` | Builds the `NfseDocument`: every value of the note, already formatted. |
| 5 | `nfse.xml.ts` | Writes the XML. |
| 6 | `danfse.present.ts`, `danfse.render.ts` | Formats the DANFSe text and draws the PDF, loaded on demand through `import()`. |

## `GET /api/operation-indicators`

```
GET /api/operation-indicators?nbsCode=122011200&cClassTrib=200028&date=2026-03-10
```

```json
{
  "nbsCode": "122011200",
  "cClassTrib": "200028",
  "serviceItems": [
    {
      "lc116Code": "8.01",
      "nationalTaxCode": "080101",
      "description": "Ensino regular pré-escolar, fundamental, médio e superior.",
      "indicators": [
        {
          "indicatorCode": "030101",
          "incidencePlace": "Estabelecimento do Prestador/Fornecedor",
          "operationType": "Serviço prestado fisicamente sobre a pessoa ou fruído presencialmente por pessoa física"
        }
      ]
    }
  ]
}
```

- The data comes from `CLASSIF_NBS_INDOP_LC` (3,280 rows, 731 of the 1,237 NBS codes), joined to
  `INDICADOR_OPERACAO_IBS_CBS`, `LISTA_SERVICOS_LC_116` and `CLASSIFICACAO_TRIBUTARIA`. The mapping,
  indicator and LC 116 rows are filtered by validity on the date; the classification joins by the
  `CLTR_ID` the mapping row names, so it needs no date filter of its own. The indicator table changes on 2026-12-01: NBS `122011200` with `200028`
  has four indicators until 2026-11-30 and two from then on, and `030102` changes meaning.
- One NBS can map to more than one LC 116 subitem (`101011100` maps to `7.02` and `7.05`).
- A pair without a mapping answers `200` with an empty `serviceItems`, not `404`; a client then
  says the XML and the DANFSe cannot be generated (the playground does).
- `400 INVALID_INPUT` lists every malformed parameter: `nbsCode` (9 digits), `cClassTrib`
  (6 digits), `date`.
- **Cost:** 16 to 102 rows read per call, through the index on the NBS code of
  `CLASSIF_NBS_INDOP_LC` (`docs/open-data.md`, Lean D1), measured on 2026-11-21. Without the index a
  call scanned the table, 3,296 rows. The route test fails above 150. A client calls it once per
  calculated NFS-e.

## Decisions

| Decision | Why |
| --- | --- |
| The XML is built in the browser from the calculation result. | It costs no D1 reads and no Worker CPU. Building it in the Worker would recalculate the operation, 700 to 1,300 more rows read per note. |
| One NFS-e per operation, with one service. | The national DPS carries one `cServ`. NF-e operations get their own note (`docs/nfe.md`); NFC-e operations offer none. |
| `cTribNac` is the LC 116 subitem plus the breakdown `01` (`8.01` becomes `080101`). | The national table of breakdowns (desdobramentos) is not in the open data. The DANFSe sample uses `080101` too. |
| `xTribNac` is the LC 116 description. | Same reason. The sample's text differs, so the golden test leaves this one element out. |
| Parties are fixed placeholders, all in the operation's municipality. | No real data enters the simulator. The CNPJ is the upstream generator's test placeholder, the CPF has wrong check digits on purpose, the CEP is `00000000`, and e-mails use the reserved `.invalid` domain. |
| The access key follows the national layout, with numeric code `123456789` and check digit `0`. | A fictitious key must not look computed. The QR code still points to the official public lookup, as the upstream generator does, and can never match a real note there. |
| The place of incidence is always the operation's municipality. | Every party sits there, so every `cIndOp` resolves to the same place. |
| `vTotNF` is the service value plus IBS plus CBS. | As in the sample. ISSQN is not calculated: `tribISSQN` is `1` (taxable) and `tpRetISSQN` `1` (not withheld), with no ISS values. |
| Without the reduction group, `pRedAliq*` is left out and `pAliqEfet*` is the rate itself. | The NFS-e still asks for an effective rate, and with no reduction it equals the rate. |
| The XML is checked against the XSD, in the browser and in CI; the golden test still pins the values. | Developer, Epic 11 SPEC. The golden test pins both IBS/CBS groups, the keys, the service codes and the amounts against `fixtures/danfse/sample-nfse.xml`. |
| Where the DANFSe sample and the XSD disagree, the XSD wins. | Epic 11 CODE. The sample lacks `verAplic`, `tpEmis` and `nDFSe` on the note, which the XSD requires, and carries a `uf` under the note's `IBSCBS`, which neither the XSD nor the Receita's own valid sample (`src/test/resources/xml/nfse/valido/nota/nfse_valido_com_IBSCBS.xml` in the calculator) has. |
| A test signature on the note. | Developer, Epic 11 SPEC. The XSD requires `Signature` after `infNFSe`; in production the national environment (ADN) signs the NFS-e it generates. The test one passes the XSD and fails any real check (`docs/security.md`, Test signature). |

## Access key

`NFS` + IBGE municipality code (7) + environment `2` (1) + inscription type `2`, CNPJ (1) + CNPJ (14)
\+ note number (13) + year and month of competence, `YYMM` (4) + numeric code `123456789` (9) +
check digit `0` (1): 53 characters. The DPS `Id` is `DPS` + IBGE code (7) + inscription type (1) +
CNPJ (14) + series (5) + DPS number (15).

## XML

`writeNfseXml` writes layout `1.01` in the namespace `http://www.sped.fazenda.gov.br/nfse`, in the
element order of the XSD the regular-regime calculator ships (Decisions: where the DANFSe sample
differs, the XSD wins). Text is escaped (`&`, `<`, `>`, `"`, `'`). The
mapping from the calculation to `infNFSe/IBSCBS` is the one in `docs/danfse-layout.md`, Mapping from
the calculator response.

Fixed DPS values, since the simulator has no input for them: `tpEmit` `1` (issued by the
provider), `opSimpNac` `1` (not in Simples Nacional), `regEspTrib` `0`, `finNFSe` `0` (regular
note), `indFinal` `1` (final consumer), `indDest` `0` (the taker is the recipient). On the note
itself: `verAplic` the simulator's version string, `tpEmis` `1` (the national model), and `nDFSe`
the note number again.

`Signature` closes `NFSe`, over `#` + the access key (`docs/security.md`, Test signature).

## Validation

"Validar XML" checks the XML against the XSD the regular-regime calculator ships: its own root,
`src/main/resources/xml/nfse/nota.xsd` (15 lines that declare `NFSe` and include the originals),
and `originais/tiposComplexos_v1.01.xsd`, `tiposSimples_v1.01.xsd` and `xmldsig-core-schema.xsd`.
The root points into `./originais/`; the validator's file system is flat, so `xml.schema.ts` drops
the folder from those two paths and changes nothing else. It runs in the browser as the NF-e's does
(`docs/nfe.md`, Validation), and `nfse.xml.test.ts` runs it in CI. No official public NFS-e
validator was found on 2026-11-22, so the section offers no Sefaz step.

## PDF

- **Library:** `jspdf@4.2.1` draws the page and `qrcode@1.5.4` gives the QR matrix, which the
  renderer draws as vector squares, so no canvas is needed and the tests run in Node.
- **Why not the upstream WebAssembly build:** it needs the Go toolchain to build the upstream
  repository in CI, which the project never does (`docs/decisions.md`, Upstream as reference, not
  runtime), and its 27.8 MB file is likely above the Cloudflare per-file static asset limit (not
  verified).
- **Bundle:** the renderer, jsPDF and qrcode load through `import()` when the visitor asks for the
  PDF. Since Epic 9, jsPDF sits in one chunk the DANFSe and the DANFE renderers share (399 kB, 130 kB gzip, named after `pdf.watermark`, its first importer), and `danfse.render`, with qrcode inside, is 28 kB; the initial bundle has neither library.
  jsPDF also splits out its optional `html2canvas` and DOMPurify chunks, which this renderer never
  loads.
- **Font:** the standard Helvetica, not embedded. Its WinAnsi encoding covers Portuguese.
- **Layout:** the sections of NT 008 in the order of `fixtures/danfse/sample-danfse.pdf`, on one A4
  page, with the receipt stub. The official NFS-e logo is replaced by the text "Simulador da Reforma
  Tributária · documento fictício", so the PDF cannot pass for one the national portal issued.
- **One page:** the service description is cut at 1,300 characters and the additional information
  at 2,000, keeping the Lei 12.741/2012 line whole, as NT 008 says. With both at their maximum the
  content still ends above the stub at 275 mm. Drawing past the stub throws, so a layout change
  that overflows fails `danfse.render.test.ts`.
- Zero and absent values print as `-`, as the upstream generator does.
