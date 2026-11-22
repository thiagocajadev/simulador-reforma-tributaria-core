# NF-e and DANFE

When an operation is an NF-e (document type `55`) and every item came back calculated, the
simulator offers two files, both built in the browser:

- the NF-e XML, layout 4.00, with the `IBSCBS` group of NT 2025.002 in each item and the `IBSCBSTot`
  totals, filled from our calculation;
- the DANFE, the printable PDF of that note, on the reform layout of NT 2026.010.

Neither is a real document. The parties, the numbers and the access key are placeholders, the
environment is always homologation (`tpAmb` `2`), and nothing is sent to any Sefaz. NFC-e (model
`65`) operations get no note: their DANFE is a different, receipt-sized layout.

## References

Every reference below was read for this cycle (2026-11-22). The ones the code links to are in
`src/shared/content/official.sources.ts` under the registry id shown.

| Reference | Registry id | What it settles |
| --- | --- | --- |
| [NT 2025.002 v1.53](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=BMcHSMEoepU=), Portal Nacional da NF-e, published 2026-10-30 | `nfeTaxReformNote` | The IBS/CBS groups of the NF-e, `vItem` (VB01-10, with its 2025-2026 exception) and `vNFTot` (W60). Its section 9 leaves the DANFE to a later note. |
| [NT 2026.010 v1.00](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=ugn4MYF5PLg=), Portal Nacional da NF-e, published 2026-10-01, in production on 2026-12-01 | `nfeDanfeNote` | The DANFE of the reform (section 4): the "Total do IBS/CBS/IS" block, the CRT in the emitter, the per-item IBS/CBS lines, the effective rate when `gRed` is present, optional blocks, and that no field prints what the XML does not hold. The QR Code of model 55 waits for a later note (4.5). |
| [MOC 7.0, Anexo II, v7.00](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=f%20NhsSn3/5M=), Portal Nacional da NF-e, October 2020 | `nfeDanfeManual` | The DANFE base: Code 128C (2, with the check symbol example of 2.1), the A4 portrait geometry (3.8.1), Times or Courier at minimum sizes (3.7), required product columns (3.1.7), additional sheets (3.5), fields outside the layout go to the additional information (3.10.5), FOLHA n/m on every sheet (3.10.2), and "SEM VALOR FISCAL" in homologation (3). |
| [Tabela de CFOP vigente](https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/copy_of_cfop_cvsn_70_nova), Confaz, Convênio SINIEF s/nº of 1970 | `cfopTable` | `5.102`: "Venda de mercadoria adquirida ou recebida de terceiros", in group 5.000, outgoing operations inside the state. The NF-e portal's Informe Técnico 2023.002 v2.10 says this Convênio is the only official source of the codes. |
| [Rejection 598 in homologation](https://www.sefaz.pb.gov.br/ser/images/e-docs/Ambiente_Homologacao_Destinatario.pdf), Sefaz-PB | (docs only) | In homologation the recipient's name must be "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL", or the note is rejected (598). The upstream valid sample uses the same name. The rule itself (E04-20) is in MOC 7.0 Anexo I, which was not read. |
| `upstream/calculadora-rtc-regime-regular`: `src/main/resources/xml/nfe/originais/leiauteNFe_v4.00.xsd` and `src/test/resources/xml/nfe/valido/nota/nfe_valido.xml` | `regularRegimeCalculator` | The element order of the XML, and the `IBSCBS` group the official calculator's XML generator writes from a calculation. |
| `fixtures/regime-regular/*.output.regime-geral.json` | (fixtures) | The values: twelve NF-e cases calculated by the official calculator, five of them with the Imposto Seletivo, which the golden test compares element by element. |

The national portal answers command-line clients with a redirect loop, so the two notes were first
read from a mirror (reformatributaria.com). Opened in a browser, the portal serves both with the same
SHA-256 as the copies read, and the Anexo II is the file it serves.

## Decisions

| Decision | Who and when | Why |
| --- | --- | --- |
| The full path: the XML with the IBS/CBS group and a DANFE, not a DANFE-only print. | Developer, 2026-11-21 | The XML is where the calculation lands; the DANFE is how people read it. |
| ICMS, IPI, PIS and COFINS stay out of the items, and `ICMSTot` holds the products total and zeros. | Developer, Epic 9 SPEC, Q1; confirmed in Epic 11 CODE | The simulator calculates none of them, and filling an `ICMS90` with zeros would claim a tax choice nobody made. Epic 11 had planned that `ICMS90` because the XSD was thought to require an ICMS group; it does not: in the layout the upstream ships, `det/imposto` holds the ICMS, IPI and II groups inside `<xs:choice minOccurs="0">`, and the XML passes the XSD without them. |
| The DANFE follows the official sources: NT 2026.010 and MOC 7.0 Anexo II. | Developer, Epic 9 SPEC, Q2 | Nothing on the DANFE is drawn from memory; every block, size and rule cites a section above. |
| Additional sheets instead of a one-page cap. | Developer, Epic 9 PLAN | NT 2026.010 stacks three to four lines per item, so 20 items do not fit one A4 sheet; Anexo II 3.5 provides for additional sheets. |
| The note follows the regular-regime calculation (`CRT` `3`), also for a company in the Simples Nacional. | Epic 9 SPEC | The NFS-e does the same; a Simples NF-e (`CRT` `1`) carries other groups and is not simulated. |
| Every item must be calculated before the note is offered. | Epic 9 SPEC | A real NF-e cannot leave an item out. |
| One fixed sale: `CFOP` `5102`, quantity 1 `UN`, final consumer, in-state, cash payment, no transport. | Epic 9 SPEC | The simulator asks for none of these, and this is the simplest consistent sale. |
| The key's check digit is `0`, not the modulo 11 digit. | Epic 9 SPEC | As on the NFS-e: a fictitious key must not look computed. |
| A test signature and no authorization protocol. | Developer, Epic 11 SPEC (Epic 9 had none) | The XSD requires `Signature` after `infNFe`. The test one (`xml.signature.ts`) has the shape the schema fixes and fictitious values that decode to text saying they are simulated, so the XML passes the XSD and fails any real check (`docs/security.md`, Test signature). A protocol would claim an authorization no Sefaz gave. |
| The XML is checked against the official XSD in the browser, and in CI. | Developer, Epic 11 SPEC | Credibility: anyone can see the note follows the layout. The XML never leaves the browser (Validation, below). |

## MVP limitations

What the simulated NF-e and DANFE do not do.

- No ICMS, IPI, PIS, COFINS, FCP, DIFAL or ICMS-ST: the items carry no such groups and the DANFE's
  ICMS cells print their labels only.
- No monophasic taxation: the calculation leaves those items out of scope, so no such item reaches
  a note, and `gMono` is not written. The Imposto Seletivo is written (The IS group, below), with
  the rates the visitor typed, or the official ones once the open data holds them.
- No NFC-e note (model 65), no NF-e under Simples Nacional (`CRT` `1`), no return, credit or debit
  notes (`finNFe` other than `1`), no interstate operations, one CFOP, one unit and quantity 1.
- No real signature, protocol, Sefaz submission, contingency or events (cancellation, correction).
  The XML passes the XSD (Validation, below); the Sefaz business rules are not run by this code.
- No QR Code on the DANFE, which NT 2026.010 4.5 leaves to a later note.
- Not applied: NT 2026.005 v1.00 (Simples Nacional in the NF-e and NFC-e), NT 2026.006 v1.01 (a
  note linked to a split-payment transaction), NT 2026.007 v1.11 (validation of registrations
  against the LCC-RFB and the CCC) and NT 2026.008 v1.01 (new fields for the net product value, a
  layout change), all of 30/10/2026. Subjects as the portal lists them on 2026-11-22; the notes
  themselves were not read. NT 2025.002 v1.53 (30/10/2026) was still the latest on that day.

## Flow

| Step | Where | What |
| --- | --- | --- |
| 1 | `src/features/calculations/` | The visitor calculates an NF-e operation, up to 20 items. |
| 2 | `src/features/nfe/nfe.eligibility.ts` | An NF-e needs document type `55` and every item `calculated` or `simulated`, since a real note cannot leave one out. An item whose CST has no IBS/CBS group stays in the note with `CST` and `cClassTrib` alone. |
| 3 | `nfe.document.ts` | Builds the `NfeDocument`: every value of the note, already formatted. |
| 4 | `nfe.xml.ts` | Writes the XML. |
| 5 | `danfe.present.ts`, `danfe.render.ts`, `danfe.draw.ts`, `code128.ts` | Formats the DANFE text and draws the PDF, loaded on demand through `import()`. |

No API route and no D1 read: the note is built from the calculation result the client already holds.

## Access key

cUF (2, the first two digits of the IBGE municipality code) + `AAMM` of the issue date (4) + CNPJ
(14) + model `55` (2) + series `001` (3) + number `000000001` (9) + emission type `1` (1) + numeric
code `12345678` (8) + check digit `0` (1): 44 digits. The `infNFe` `Id` is `NFe` + the key. The check
digit is fixed at `0`, not the modulo 11 digit, so the fictitious key never looks computed.

## XML

`writeNfeXml` writes `NFe/infNFe` version 4.00 in the namespace `http://www.portalfiscal.inf.br/nfe`,
in the element order of the layout schema. Text is escaped.

| Group | Values | Why |
| --- | --- | --- |
| `ide` | `natOp` "Venda de mercadoria", `tpNF` `1`, `idDest` `1`, `tpImp` `1` (portrait), `tpEmis` `1`, `tpAmb` `2`, `finNFe` `1`, `indFinal` `1`, `indPres` `1`, `procEmi` `0` | The simulator has no input for them; a final-consumer in-state sale is the simplest consistent case. |
| `emit` | Upstream's test CNPJ, `IE` `000000000`, `CRT` `3` | The NF-e follows the regular-regime calculation, as the NFS-e does. |
| `dest` | A CPF with wrong check digits, `indIEDest` `9`, and `xNome` "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" | The name homologation requires. |
| `det/prod` | `cProd` the item number, `xProd` the item description (120 characters), `NCM`, `CFOP` `5102`, `qCom` `1.0000` `UN`, `vUnCom` = `vProd` = the base amount | `5102` is an in-state sale of goods bought from third parties. |
| `det/imposto` | `IS` when the item's IS was calculated, then `IBSCBS` | ICMS, IPI, PIS and COFINS are not calculated (developer, Epic 9 SPEC, Q1). The layout makes the ICMS group optional, so the XML still passes the XSD. |
| `det/vItem` | `vProd` + `vIBS` + `vCBS` + `vIS` from 2027; `vProd` alone in 2025 and 2026 | NT 2025.002, VB01-10, exception 1. |
| `total/ICMSTot` | `vProd` and `vNF` = the products total, every other value `0.00` | The group is required; nothing in it was calculated. |
| `total/IBSCBSTot` | `vBCIBSCBS`, `gIBS`, `gCBS` with `vDif`, `vDevTrib`, `vCredPres` and `vCredPresCondSus` at `0.00` | As the upstream calculator publishes them. Its `gMono` (monophasic totals, all zero) is left out: monophasic taxation is not calculated, and NT 2026.010 prints those fields only when the group is there. |
| `total/ISTot` | `vIS`, the sum of the items' `vIS`, only when an item has the `IS` group | NT 2025.002, W31 to W34. |
| `total/vNFTot` | The sum of every `vItem` | NT 2025.002, W60. |
| `transp` | `modFrete` `9` | No transport. |
| `pag` | `tPag` `01`, `vPag` = `vNFTot` | One cash payment of the whole note. |
| `infAdic/infCpl` | The simulation notice, "SEM VALOR FISCAL", and that ICMS, IPI, PIS and COFINS were not calculated | |

`Signature` closes `NFe`: an enveloped XMLDSig over `#NFe` + the access key, with C14N, RSA-SHA1
and SHA-1 as the schema fixes, and fictitious values (`docs/security.md`, Test signature). No
`protNFe`: a protocol would claim an authorization no Sefaz gave.

## Validation

**In the browser.** "Validar XML" checks the XML the visitor would download against the Portal
Nacional da NF-e's own schema package, **PL 010h v1.03** (published 2026-11-13: NT 2026.005 v1.00,
NT 2026.006 v1.00 and NT 2026.008 v1.01 over the RTC layout with the `IBSCBS` and `IS` groups):
`nfe_v4.00.xsd` and the four files it includes, in `src/shared/xml/schemas/nfe-pl010h-v1.03/`.

**PL 010h adopted** (Epic 13, asked by the developer at the content audit). Until then the code
validated against the older XSD the upstream ships in `src/main/resources/xml/nfe/originais/`.
The package was downloaded on 2026-11-22 from the portal's "Esquemas XML" list
(`exibirArquivo.aspx?conteudo=YhWikFoTxUo=`), `PL_010h_v1.03.zip`, 52,038 bytes, SHA-256
`bcbf6b277f79a6983d69016dfe0430f09b8a191997a4706a24938acddc18dc81`. It holds five NF-e schemas and
four event schemas; the five NF-e ones were copied unchanged (line endings aside, by
`.gitattributes`), the events left out, since the simulator writes none. Against the upstream copy:
`adRemIS` in place of `pISEspec`, the alphanumeric CNPJ patterns (NT 2026.004) and new types;
`xmldsig-core-schema_v1.01.xsd` is identical. All twelve NF-e golden cases pass it. To update:
download the next package from the same list, replace the folder, rename it, and run the tests.
 `xmllint-wasm` (MIT, libxml2 compiled
to WebAssembly) runs it in a Web Worker; the module, the schemas and the `.wasm` load through
`import()` on the first click only. The XML never leaves the browser. The verdict is shown for the
XML it checked, and goes away if the note changes. The CSP gains `'wasm-unsafe-eval'` for it
(`docs/security.md`).

**A file the visitor sends (Epic 14).** `src/features/xml-upload/xml.upload.read.ts` reads an XML file (a front end caps its size; 1 MB holds any note),
reads it with `DOMParser` (which fetches no external entity) and checks it against the same schemas:
an `NFe` root, or the `NFe` inside an `nfeProc`, against PL 010h; an `NFSe` root against the NFS-e
XSD. Anything else is refused by name. The note then shows as nested accordions, one per group, with
the tag code and a Portuguese name for the groups and fields the reform touches
(`src/features/xml-upload/xml.labels.ts`). Nothing leaves the browser; the signature and the
business rules stay for the Sefaz.

**In CI.** `nfe.xml.test.ts` validates the XML of every NF-e golden case (twelve, five with the IS), the 2027 case
with typed rates included, and `xml.schema.test.ts` proves a broken XML fails with its line.

**At the Sefaz.** The section points to the Sefaz-RS "Validador de Mensagens do Projeto NF-e"
(`sefazRsValidator`): paste the XML in its text box and press Validar. On 2026-11-22 two golden cases went through it, and through the same validator on the SVRS portal (`dfe-portal.svrs.rs.gov.br/NFE/ValidadorNfe`), with the same answers (the developer allowed pasting a simulated XML there). Both got **Parser XML and Schema XML, no error**, so the Sefaz accepts the `IBSCBS` group as the simulator writes it.

- `full-rate-goods-2026` (CBS 0,9%, IBS UF 0,1%, the official 2026 rates): 12 rejections, every one by design or from a tax not calculated: 297, 213, 253, 897, 209, 237, 245, 745, 748 and 1002 below, plus 228 and 505 (issue and exit dates too old: March 2026, validated in November). **No rule on the IBS/CBS group fired.**
- `full-rate-goods-2027-nominal` (CBS 8,8%, typed): 14 rejections, the table below.
- The cigars demo with the Imposto Seletivo (Epic 12, the developer at Sefaz-RS on 2026-11-22, after the `adRemIS` fix): **Schema XML, no error**, so the Sefaz accepts the `IS` group and `ISTot` as written. 13 rejections, all in the table below: 297, 213, 703, 504, 253, 897, 209, 237, 745, 748, 245, 1002 and 1037. **No IS rule fired**, and 866 did not either, although `vPag` (2752.46) exceeds `vNF` (2000.00); see 866 in the table below.

| Code | Rejection | Why |
| --- | --- | --- |
| 297, 213 | Signature differs from the computed one; issuer CNPJ differs from the certificate's | The test signature, by design. |
| 253, 897 | Key check digit invalid; numeric code in an invalid format | The fictitious key: check digit `0` on purpose, `cNF` `12345678`. |
| 209, 237, 245 | Issuer IE invalid; recipient CPF invalid; issuer CNPJ not registered | Fictitious parties, on purpose. |
| 703, 504 | Issue and exit date after the time received | The demo date is in 2027; a past date gets 228 and 505 instead. Only a note dated today escapes both. |
| 1037 | CBS rate invalid | No official 2027 CBS rate exists yet; the rate is typed. The 2026 note, with the official rates, does not get it. |
| 745, 748, 1002 | No PIS group; no COFINS group; no ICMS or ISSQN | Not calculated (Decisions, Q1). The XSD makes them optional, the rules do not. An `ICMS90` alone would clear 1002 and leave 745 and 748. |
| 866 | No change (`vTroco`) when the payments exceed the note total | Rule YA03-20 (MOC, Anexo I, group YA; read on 2026-11-22 in two third-party consolidations of the rule table, not on the portal): the sum of `vPag` above `ICMSTot/vNF`, with no `vTroco`. `vPag` is `vNFTot`, the total with the IS, IBS and CBS charged on top, while `vNF` leaves them out; in 2026 both are equal and the rule does not fire. NT 2025.002 v1.53 defines `vNFTot` (W60, its rules "Implementação futura") and does not move rule YA03-20 to it. Settled in Epic 14: expected on a 2027 note, and kept, since a `vTroco` would state change the buyer never got. The consolidations disagree on whether the rule is mandatory or optional for each UF, which may be why it did not fire on the IS note; not proven. |

So the schema passes and the rules refuse the note (Epic 13). The expected rejections live in
`src/shared/content/sefaz.rejections.ts`, the codes above grouped by cause, with 866 as
"pode aparecer"; `sefaz.rejections.test.ts` fails if it and this table stop listing the same codes. SVRS also runs a "Validador da Reforma Tributária do Consumo - NF-e / NFC-e", which on
2026-11-22 still stated NT 2025.002 v1.31, so it was not linked.

**The IS group.** Since Epic 12 an item whose Imposto Seletivo was calculated carries the `IS`
group (UB01), before `IBSCBS`: `CSTIS`, `cClassTribIS`, `vBCIS`, `pIS`, `adRemIS` with an ad rem
rate, `uTrib` and `qTrib` with it, and `vIS`. The note adds `ISTot` before `IBSCBSTot`, and the IS
is charged on top ("por fora"): `vIS` enters `vItem` and `vNFTot` from 2027. Every IS rule of NT
2025.002 v1.53 is "Implementação Futura".

- **`adRemIS`, not `pISEspec`.** The note's field table names UB07 `adRemIS`, and so does the
  schema the Sefaz runs: on 2026-11-22 the Sefaz-RS validator refused a note with `pISEspec`
  (rejection 225, "invalid child element 'pISEspec'", expecting `adRemIS`, `uTrib` or `vIS`).
  The layout schema the upstream ships still names it `pISEspec`, and calculator 1.7.2 calls that
  name deprecated. The XML writes `adRemIS`. Epic 12 renamed the element in the upstream XSD the
  code loaded; since Epic 13 the code validates against PL 010h, which names it `adRemIS` itself,
  and a test still proves `pISEspec` is refused. A first version wrote `pISEspec`, following the
  upstream XSD; the developer's run at the Sefaz caught it.
- **`pIS` with an ad rem rate alone.** The schema requires `pIS` beside `vBCIS`, so an ad rem rate
  alone goes with `pIS` `0.00`.
- **Three integer digits.** `adRemIS` is `TDec_0302_04RTC`, so the form takes an ad rem rate up to
  999,9999 reais per unit, while the API accepts upstream's range.
- **Golden.** `nfe.golden.test.ts` compares each `IS` group and `ISTot` with the upstream response
  on the five IS cases, leaving out upstream's deprecated `pISEspec`, which repeats `adRemIS`; all
  five pass the XSD (`nfe.xml.test.ts`).

**Golden test.** `nfe.golden.test.ts` runs every NF-e case of `fixtures/regime-regular` with every
item calculated (twelve cases) and compares each item's `IBSCBS` group and the `IBSCBSTot` totals,
element by element, with the upstream response turned into XML in its own field order, the order the
upstream XML generator follows.

## DANFE

- **Layout:** the portrait reference model of NT 2026.010 on the folhas soltas geometry of Anexo II
  3.8.1: receipt stub, emitter, the DANFE box (entry or exit, number, series, FOLHA n/m), barcode and
  access key, operation nature and protocol, state registrations and CNPJ, tax regime, recipient,
  products and note totals, ICMS/IPI totals, IBS/CBS/IS totals, transport, products, additional data.
- **Left out, as the manuals allow:** the Fatura/Duplicatas block (no `cobr`), the ISSQN block, the
  FCP, DIFAL and monophasic fields (no data), the QR Code (NT 2026.010 4.5 leaves it to a later note).
- **Only what the XML holds:** the ICMS cells of each item, which Anexo II 3.1.7 does not let a
  DANFE drop, print the label alone; the Imposto Seletivo total prints `ISTot`, blank in a note
  without it; the protocol box says
  "SIMULAÇÃO · SEM AUTORIZAÇÃO DE USO". The total with IBS/CBS (`vNFTot`), which the layout has no
  field for, goes to the additional information, as Anexo II 3.10.5 allows.
- **Rates:** with the reduction group the item prints the effective rate (`pAliqEfet`), otherwise
  the rate, as NT 2026.010 4.3 says.
- **Barcode:** `code128.ts` encodes the 44-digit key as Code 128 set C, pinned by the Anexo II
  example (`09758364`, check symbol `48`). The renderer draws vector bars 10 mm tall with a quiet
  zone of 10 modules on each side, about 80 mm wide (the minimum is 60 mm by 8 mm).
- **Font:** the standard Times (Times-Roman and Times-Bold), not embedded; its WinAnsi encoding
  covers Portuguese. Labels at 6 pt; field values at 10 pt (Anexo II 3.7.9), every fixed value
  fitting at that size and only a long municipality name shrinking, never below 7 pt; products at
  6.5 pt, in columns sized so the largest amount the form accepts (13 integer digits) fits at full
  size, and a product cell never shrinks below the 6 pt of 3.7.7. `danfe.render.test.ts` pins both.
- **Additional sheets:** the products fill the first sheet above the additional data; the rest go
  to more sheets that repeat the header (emitter, DANFE box, barcode, key, operation nature,
  registrations), as Anexo II 3.5 requires. A one-item note is one sheet; twenty items with
  120-character descriptions take two.
- **Watermark:** "SIMULAÇÃO · SEM VALOR FISCAL", diagonal and light, under every sheet
  (`src/shared/pdf/pdf.watermark.ts`, shared with the DANFSe).
- **Bundle:** the presenter, the renderer and jsPDF load through `import()` when the visitor asks for
  the PDF; the initial bundle has none of them.
