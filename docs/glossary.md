# Glossary

Every acronym this project uses, with its meaning. Code keeps official acronyms as words in camelCase
(`cbsRate`, `ibsAmount`, `ncmCode`, `cstCode`), `cClassTrib` stays literal, and XML tag names
(`vBC`, `pCBS`) appear only in the layer that builds the XML. See `docs/decisions.md`, Naming.

## Tax reform

| Acronym | Portuguese | Meaning |
| --- | --- | --- |
| LC 214/2025 | Lei Complementar nº 214, de 2025 | The law that regulates the consumption tax reform and creates CBS, IBS and IS. |
| RTC | Reforma Tributária do Consumo | The consumption tax reform itself. Appears in the upstream repository names (`calculadora-rtc-*`). |
| CBS | Contribuição Social sobre Bens e Serviços | The federal value-added contribution on goods and services. In code: `cbsRate`, `cbsAmount`. |
| IBS | Imposto sobre Bens e Serviços | The value-added tax shared by states and municipalities. It has two parts, IBS UF (state) and IBS Mun (municipal), each with its own rate. |
| IS | Imposto Seletivo | The excise tax on goods harmful to health or the environment. Calculated since Epic 12, from 2027, with the rates the visitor types (the open data holds none yet). In code: `selectiveTax`. |
| ad valorem, ad rem | Alíquota ad valorem, alíquota ad rem | The two IS rates: a percentage of the value, and a fixed amount in reais per unit of measure (`VN`, the vintena of cigarettes). In code: `adValoremRate`, `adRemRate`. |
| LC 116/2003 | Lei Complementar nº 116, de 2003 | The ISSQN law. Its annex lists the taxable services by item and subitem (`8.01`), which the NFS-e national service code extends. In code: `lc116Code`. |
| ISSQN | Imposto Sobre Serviços de Qualquer Natureza | The municipal service tax that IBS replaces during the transition. It still has its own section on the DANFSe. |

## Classification codes

| Acronym | Portuguese | Meaning |
| --- | --- | --- |
| NCM | Nomenclatura Comum do Mercosul | The 8-digit code that classifies goods. In code: `ncmCode`. |
| NBS | Nomenclatura Brasileira de Serviços, Intangíveis e Outras Operações que Produzam Variações no Patrimônio | The code that classifies services and intangibles. In code: `nbsCode`. |
| CST | Código de Situação Tributária | The 3-digit code for the tax situation of an item under IBS/CBS (for example `200`, rate with reduction). In code: `cstCode`. |
| cClassTrib | Código de Classificação Tributária | The 6-digit code that picks the tax treatment of an item: rate type, reduction and legal ground. Its first 3 digits are the CST (`200028` belongs to CST `200`). Kept literal everywhere. |
| cIndOp | Código Indicador da Operação | The 6-digit code for where an IBS/CBS operation is deemed to take place (for example `030101`). The issuer chooses it from the values allowed for the NBS and cClassTrib on that date. |
| cTribNac | Código de Tributação Nacional | The 6-digit national service code of the NFS-e, inside `cServ`: the LC 116 item and subitem plus a 2-digit breakdown (`080101`). In code: `nationalTaxCode`. The simulator always takes breakdown `01` (`docs/nfse.md`, Decisions). |
| cNBS | Código NBS | The NBS code as written in the NFS-e, inside `cServ`. |

## Places

| Acronym | Portuguese | Meaning |
| --- | --- | --- |
| UF | Unidade Federativa | A Brazilian state or the Federal District, by its 2-letter code (`RS`, `SP`). |
| IBGE | Instituto Brasileiro de Geografia e Estatística | The statistics institute whose 7-digit municipality codes identify places in tax documents (`4314902` is Porto Alegre). |
| cMun | Código do Município | The IBGE municipality code as written in the NFS-e. |
| cLocalidadeIncid | Código da Localidade de Incidência | The IBGE code of the place where IBS/CBS is levied. |

## Documents

| Acronym | Portuguese | Meaning |
| --- | --- | --- |
| NFS-e | Nota Fiscal de Serviço Eletrônica | The national electronic service invoice. Its XML wraps the DPS and the values the national environment computed. |
| DPS | Declaração de Prestação de Serviço | The issuer's declaration of a service, which the national environment turns into an NFS-e. |
| DANFSe | Documento Auxiliar da NFS-e | The printable PDF of an NFS-e. Layout in `docs/danfse-layout.md`. |
| ADN | Ambiente de Dados Nacional | The national NFS-e data environment, which stores the notes and distributes them to municipalities and taxpayers. The national issuer (Sefin Nacional) is what receives a DPS and issues the NFS-e. This project submits to neither. |
| NT | Nota Técnica | A technical note that specifies a fiscal document layout. NT 008 defines the DANFSe; NT 2025.002 adds IBS, CBS and IS to the NF-e; NT 2026.010 defines the DANFE of the reform. |
| NF-e | Nota Fiscal Eletrônica | The electronic invoice for goods, model 55. From NT 2025.002 each item carries an `IBSCBS` group. Built by `src/features/nfe/` (`docs/nfe.md`). |
| DANFE | Documento Auxiliar da NF-e | The printed or PDF representation of an NF-e, with the access key as a Code 128C barcode. Layout in NT 2026.010 and MOC 7.0 Anexo II (`docs/nfe.md`, DANFE). |
| MOC | Manual de Orientação do Contribuinte | The NF-e manual set. Its Anexo II specifies the DANFE and its barcode. |
| CFOP | Código Fiscal de Operações e Prestações | The operation code of each NF-e item. The simulated note uses `5102`, an in-state sale of goods bought from third parties. In code: `cfop`. |
| vItem | Valor total do item | The NF-e item total: the product value plus IBS, CBS and IS from 2027; in 2026 the taxes stay out (NT 2025.002, VB01-10). In code: `itemTotal`. |
| vNFTot | Valor total da NF-e com IBS/CBS/IS | The NF-e total with the new taxes, the sum of every `vItem`. In code: `totalWithTaxes`. |
| cStat | Código de Status | The status code of an NFS-e, printed on the DANFSe. |

## NFS-e IBS/CBS tags

Only the XML layer uses these names. Full paths in `docs/danfse-layout.md`, IBS / CBS block.

| Tag | Meaning |
| --- | --- |
| `IBSCBS` | The XML group that holds the IBS/CBS classification and values. |
| `vBC` | Base de cálculo: the taxable amount after exclusions and reductions. |
| `pCBS` | CBS rate, in percent. |
| `pIBSUF`, `pIBSMun` | IBS state and municipal rates, in percent. |
| `pRedAliqCBS`, `pRedAliqUF`, `pRedAliqMun` | Rate reduction, in percent, for CBS, IBS UF and IBS Mun. |
| `pAliqEfetCBS`, `pAliqEfetUF`, `pAliqEfetMun` | Effective rate after the reduction. |
| `vCBS`, `vIBSUF`, `vIBSMun`, `vIBSTot` | Calculated CBS, IBS UF, IBS Mun and total IBS amounts. |
| `vTotNF` | Net invoice amount plus IBS/CBS. |
| `IS`, `ISTot` | The NF-e groups of the Imposto Seletivo, per item and in the totals. |
| `CSTIS`, `cClassTribIS` | The IS CST and classification, apart from the IBS/CBS ones. |
| `vBCIS`, `pIS`, `adRemIS` | IS base, ad valorem rate in percent, and ad rem rate in reais per unit (`pISEspec` in older schemas). |
| `uTrib`, `qTrib` | In the `IS` group, the unit and quantity the ad rem rate multiplies. |
| `vIS` | The IS amount. |

## Calculation contract

The fields of `POST /api/calculations` (`src/features/calculations/calculation.dto.ts`) and the
upstream calculator input they stand for. Decimals travel as strings.

| Field | Upstream field | Meaning |
| --- | --- | --- |
| `taxEventDate` | `dhFatoGerador` | Date and time of the taxable event, ISO 8601 with offset. It picks the rates, rules and codes in force. |
| `documentType` | `tpDoc` | Fiscal document type code: `55` NF-e, `65` NFC-e, `91` NFS-e. Optional; when given, the cClassTrib must be allowed for it. |
| `itemNumber` | `numero` | The item's number in the operation. |
| `baseAmount` | `baseCalculo` | The taxable amount the item declares, before the treatment's formulas. |
| `nominalRates` | `aliquotasNominais` | CBS, IBS UF and IBS Mun rates the visitor supplies. Required from 2027, refused before. |
| `selectiveTax` | `impostoSeletivo` with `aliquotasNominais.impostoSeletivo` | The item's IS group: CST, classification, the typed rates, quantity and unit. Its base is the item's `baseAmount`. |
| `reductionPercent` | `pRedAliq` | Rate reduction of the treatment, in percent. |
| `effectiveRate` | `pAliqEfet` | Rate after the reduction, in percent. |
| `simulated` | `calculoSimulado`, `CALCULO_SIMULADO` | Item status when the rates came from `nominalRates` or a typed IS rate, not from the law. |
| `ruleCode` | `codigo` of an observability error | The upstream `REG-nnn` rule an item violates. |
| `notImplemented` | `NAO_IMPLEMENTADO` | Item status for treatments the port leaves out: adjustment, deferral, tax relief group, monophasic and combined rates. |

## Simples Nacional

| Acronym | Portuguese | Meaning |
| --- | --- | --- |
| SN | Simples Nacional | The simplified tax regime for small companies (LC 123/2006). From 2027 its single monthly payment carries CBS and IBS too, at effective rates instead of the regular regime rates. |
| PGDAS-D | Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório | The Receita Federal system where a Simples company declares its revenue. It publishes the company's effective rates (`pCBSSN`, `pIBSSN`) from its revenue over the last 12 months and its annex. |
| Anexo | Anexo da LC 123/2006 | One of the five rate tables of the Simples (I commerce, II industry, III to V services). The activity decides the annex. |
| Fator R | Fator R | The payroll to revenue ratio that moves activity `09` from Anexo V (below 28%) to Anexo III (28% or more). Only the non-assisted upstream endpoint takes it. In code: `isFatorRAtLeast28`. |
| Sublimite | Sublimite de receita bruta | The revenue ceiling above which a Simples company pays the IBS and the ISS outside the Simples (CRT `2` on the NF-e). On the NFS-e rate line: `isSublimitExceeded` (upstream `impedimentoSublimite`). |
| Redistribuição do ISS | Redistribuição do ISS | When the ISS share of an annex III to V rate passes its ceiling, the excess goes to the other taxes, CBS and IBS included. So those annexes have two rate pairs: with the redistribution, and without it (`withoutIssRedistribution`, upstream `semRedistribuicaoISS`), used when the ISS stays out of the Simples for the operation. |
| CRT | Código de Regime Tributário | The issuer's regime on the NF-e: `1` Simples Nacional, `2` Simples with the revenue sublimit exceeded, `3` regular regime, `4` MEI. In code: `crt`. |
| MEI | Microempreendedor Individual | The individual micro-entrepreneur. Out of scope of the Simples calculation. |
| cAtivSN | Código de Atividade do Simples Nacional | The 2-digit activity code (`01` resale of goods to `14` services, `90` non-taxable). In code: `activityCode`. |
| tpRBSN | Tipo de Receita Bruta do Simples Nacional | The revenue type the cClassTrib carries: domestic, without IBS/CBS, direct or indirect export, and so on. It decides the share of the revenue that is taxed. In code: `revenueType`. |
| tpEnteGov | Tipo de Ente Governamental | The public buyer of a government purchase: `1` Union, `2` state, `3` Federal District, `4` municipality. In code: `governmentEntity`. |
| tpRegimeIBSCBS | Tipo de Regime do IBS e da CBS | With CRT `3`, `2` means the Simples option is pending. In code: `ibsCbsRegime`. |
| opSimpNac | Situação perante o Simples Nacional | The NFS-e provider's standing in the Simples, which replaces the CRT there: `1` not opting, `2` MEI, `3` ME/EPP, `4` option pending. In code: `simplesOption`. |
| ME, EPP | Microempresa, Empresa de Pequeno Porte | The micro and small companies the Simples is for (`simplesOption` `3`). |
| regApIBSCBSSN | Regime de Apuração do IBS e da CBS do Simples Nacional | How an opting NFS-e provider assesses the IBS and the CBS: `1` both through the Simples, `2` the CBS through the Simples and the IBS under the regular regime, `3` both under the regular regime. In code: `ibsCbsAssessmentRegime`. |
| regApTribSN | Regime de Apuração dos Tributos do Simples Nacional | How an opting NFS-e provider assesses the federal taxes and the ISS: `1` both through the Simples, `2` the ISS outside it, `3` both outside it. It only picks the rate pair. In code: `simplesTaxesAssessmentRegime`. |
| tribISSQN | Tributação do ISSQN | The ISS taxation of an NFS-e service: `1` taxable, `2` immunity, `3` service export, `4` non-incidence. In code: `issTaxation`. |
| tpRetISSQN | Tipo de Retenção do ISSQN | Who pays the ISS of an NFS-e service: `1` not withheld, `2` withheld by the buyer, `3` withheld by the intermediary. In code: `issWithholding`. |
| tpBM | Tipo de Benefício Municipal | The municipal ISS benefit of an NFS-e service: `1` exemption, `2` base reduction in percent, `3` base reduction in reais, `4` differentiated rate. Only construction activities `12` and `13` take it. In code: `municipalBenefit`. |

## Simples Nacional calculation contract

The fields of `POST /api/simples-nacional-calculations`
(`src/features/simples-nacional/simples.dto.ts`) and the upstream input they stand for.

| Field | Upstream field | Meaning |
| --- | --- | --- |
| `taxEventDate` | `data` | Date of the taxable event, a plain date here (`2027-03-10`). The calculation starts on 2027-01-01. |
| `activityCode` | `cAtivSN` | The item's Simples activity. Missing, unknown or not allowed on the document: the item is `notCalculated`, not an error. |
| `cbsSimplesRate`, `ibsSimplesRate` | `pCBSSN`, `pIBSSN` | The effective CBS and IBS rates of the Simples, in percent, with up to 34 places. |
| `selectiveTaxAmount` | `valorImpostoSeletivo` | The Imposto Seletivo amount, passed through: the simulator sends the IS the regular regime calculated for the item, `0.00` when it has none. |
| `grossRevenue` | `vRBSNitem`, `vRBSNtot` | The item's gross revenue in the Simples. |
| `dueAmount`, `pendingAmount` | `vCBSSN`, `vCBSPendSusp` (and the IBS pair) | The tax due now, and the tax left pending or suspended (indirect exports, a pending Simples option). |
| `notCalculated` | `NAO_CALCULADO` | Item status when the activity rules the calculation out. Its revenue still counts in the totals. |
| `VSN-nnn` | `code` of an item error | The upstream Simples validation codes, returned as `ruleCode`. |
| `crt` | `CRT` | Documents with CRT (NF-e, NFC-e) only; refused on the NFS-e (`VSN-033`). |
| `simplesOption` | `opSimpNac` | NFS-e only: the provider's standing in the Simples (see opSimpNac). |
| `ibsCbsAssessmentRegime`, `simplesTaxesAssessmentRegime` | `regApIBSCBSSN`, `regApTribSN` | NFS-e only: required with `simplesOption` `3` or `4`, refused with `1` or `2`. |
| `effectiveRates` | `aliquotasEfetivas` | NFS-e only: the company's row of effective rates for the period, as the PGDAS publishes it. The calculator picks each item's pair from it. |
| `annexI` to `annexV` | `anexoI` to `anexoV` | The rate pair (`cbsSimplesRate`, `ibsSimplesRate`) of each annex in `effectiveRates`; annexes III to V also carry `withoutIssRedistribution`. |
| `issTaxation`, `issWithholding`, `municipalBenefit` | `tribISSQN`, `tpRetISSQN`, `tpBM` | NFS-e item only: the ISS facts of the service that pick the rate pair. |

## Platform

| Acronym | Meaning |
| --- | --- |
| D1 | Cloudflare's SQLite database service, which holds the open tax data. |
| ETL | Extract, transform, load. Here, the Node script that builds the open data from the upstream Flyway scripts (`docs/open-data.md`). |
| FTS5 | SQLite's full-text search extension. The `SEARCH_*` tables behind the search endpoints use it, accent-insensitive. |
| SPA | Single-page application: a front end served as static assets, which this core leaves to whoever builds one. |
| XSD | XML Schema Definition, the schema an NF-e or NFS-e XML is validated against. The note modules validate on the client (`docs/nfe.md`, Validation). |
| WASM | WebAssembly. The upstream DANFSe generator builds to it (`docs/danfse-layout.md`, WebAssembly build). |
| JEXL | Apache Commons JEXL (Java Expression Language), which the upstream calculator uses to evaluate the formulas stored in its database. The port replaces it with a small arithmetic parser. |
| KV, R2 | Cloudflare key-value storage and object storage. Not used yet; they join only when a task needs them. |
| ADR | Architecture Decision Record. `ADR003` and `ADR005` are decisions of the upstream DANFSe generator. |
| QR | QR code. The DANFSe prints one that links to the NFS-e query page. |
| UN | Unidade: the default unit of measure the upstream calculator assigns to an item without one. |
| `REG-nnn` | Validation error codes of the upstream regular regime calculator, returned in 422 responses (`REG-011`, `REG-036`). This project returns them as `ruleCode`. |
| HALF_EVEN | Banker's rounding: a tie rounds to the even neighbour (`0.025` → `0.02`, `0.015` → `0.02`). Every rounding of the calculation uses it. |

Generic computing and project terms (API, CI, CPU, HTTP, JDK, JSON, LF, MVP, PDF, SQL, UI, URL, XML)
are used in their usual sense and are not listed.
