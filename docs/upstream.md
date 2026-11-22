# Upstream calculators

What this project takes from the Receita Federal calculators in `upstream/`, and how to run them on a
developer machine. They are reference only: never built in CI, never deployed (see
`docs/decisions.md`).

Verified on 2026-11-20, Windows 11, against these submodule commits:

| Submodule | Commit | Version |
| --- | --- | --- |
| `upstream/calculadora-rtc-regime-regular` | `f1eebd7` | app 1.7.2, database `V0073` (2026-11-09) |
| `upstream/calculadora-rtc-gerador-danfse` | `8d79e6b` | 1.0.0 |
| `upstream/calculadora-rtc-simples-nacional` | `a926d5a` | app 1.0.2, same database `V0073` (verified 2026-11-21) |

## Running the regular regime calculator

### Toolchain

| Tool | Version used | Install (Windows) |
| --- | --- | --- |
| JDK | Temurin 25.0.5.1 | `winget install EclipseAdoptium.Temurin.25.JDK` |
| Maven | 3.9.5, through the wrapper | none: `mvnw.cmd` downloads it on first run |

The JDK installer sets `JAVA_HOME` and `PATH` machine-wide. A terminal opened before the install does
not see them: open a new one.

### 1. Build the database

The `offline` profile opens `./calculadora/db/calculadora-pro.db` read-only, relative to the
submodule root. It does not start without it. Flyway builds it from `flyway/sql/` (one baseline
`B0001` plus the `V00xx` maintenance scripts), all in SQLite dialect.

```powershell
cd upstream/calculadora-rtc-regime-regular
New-Item -ItemType Directory -Force calculadora/db
.\mvnw.cmd flyway:migrate "-Dflyway.configFiles=flyway\flyway-pro.conf" --batch-mode --errors
```

Result: `calculadora-pro.db`, about 5.4 MB, in about 30 s on a warm Maven cache. The run ends with a
table of every table and its size, then `Verificações pós-migração concluídas com sucesso!`.

### 2. Start the API

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=offline"
```

The first run compiles the project and downloads its dependencies. Ready when the log shows
`Tomcat started on port 8080 (http) with context path '/api'`.

| Port | What |
| --- | --- |
| `8080` | API, base path `/api/calculadora` |
| `9101` | Spring Boot Actuator (management) |

Swagger UI: `http://localhost:8080/api/swagger-ui.html`.

### 3. Smoke test

```powershell
$operation = '{"id":"smoke-001","versao":"1.0.0","dhFatoGerador":"2026-03-10T10:00:00-03:00","municipio":4314902,"uf":"RS","itens":[{"numero":1,"ncm":"10063021","cst":"200","cClassTrib":"200003","baseCalculo":100.00}]}'
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/calculadora/regime-geral -ContentType 'application/json' -Body $operation
```

Expected: HTTP 200, `vBC` `100.00`, `pCBS` `0.90`, `pIBSUF` `0.10`, and a 100% reduction
(`pRedAliq` `100.00`), since `200003` is the basic food basket.

Every 200 response carries the versions it was computed with, in the headers `X-CALC-APP-VERSION` and
`X-CALC-DB-VERSION`. The 422 error responses do not. Fixtures record both in `manifest.json`.

### Gotchas

- **Port 8080 collides with the DANFSe generator.** Run the generator with `SERVER_PORT=8081`.
- **"Offline" still calls the network once.** At startup, `VersaoOfflineService` fetches the version
  of the hosted pilot (`versao.url` in `application-offline.yml`, overridable with
  `VERSAO_OFFLINE_URL`) to compare it with the local one. A failure is logged as a warning and does not
  stop the app.
- **Startup warnings are noise.** `java.lang.System::load` and `sun.misc.Unsafe` warnings come from
  Maven 3.9.5, sqlite-jdbc and ModelMapper on JDK 25. So does
  `Nenhuma plataforma de download configurada`.
- **Generated files stay in the submodule.** `calculadora/db/` and `target/` are untracked there.
  `.gitmodules` sets `ignore = untracked`, so the root `git status` stays clean. Never commit them.

## Calculation path

How `POST /api/calculadora/regime-geral` turns an operation into CBS and IBS. Paths below are relative
to `upstream/calculadora-rtc-regime-regular/src/main/java/br/gov/serpro/rtc/`.

### Call chain

| Step | Where | What it does |
| --- | --- | --- |
| 1 | `api/controller/CalculadoraTributoController.java:45` | Receives `OperacaoInput`, returns `ROCDomain` plus the version headers. |
| 2 | `domain/service/CalculadoraService.java:37` | Validates UF and municipality, resolves `tpDoc`, processes items in parallel (`:76`), sums totals. |
| 3 | `domain/service/ProcessamentoItemService.java:89` | Per item: defaults quantity to 1 and unit to `UN`, validates the base, NCM/NBS, CST and nominal rates (`:454`), resolves the treatment of the cClassTrib (`:142`). |
| 4 | `domain/service/calculotributo/CalculoTributoService.java:76` | Runs IS first when the item has it, then CBS, IBS UF and IBS Mun as three parallel calls. Assembles the `IBSCBS` group and the calculation memo. |
| 5 | `domain/service/calculotributo/CalculoCbsIbsService.java:110` | One tribute: looks up the rate, then evaluates the five formulas of the treatment. |
| 6 | `domain/service/calculotributo/AvaliadorExpressaoAritmetica.java` | Evaluates one formula with JEXL over `BigDecimal`. |

The observability endpoint (`api/controller/ObservabilidadeController.java:42`) runs the same
`processarItem` per item, but catches each item's error instead of failing the whole operation
(`domain/service/ObservabilidadeService.java:139`). Each item ends in one state of
`EstadoItemEnum`: `CALCULADO`, `CALCULO_SIMULADO` (nominal rates were given), `INCONSISTENCIA_ENTRADA`,
`NAO_IMPLEMENTADO` or `FALHA_TECNICA`.

### From cClassTrib to formula

1. `CLASSIFICACAO_TRIBUTARIA` holds the cClassTrib and its rate type (`CLTR_TIPO_ALIQUOTA`). The same
   code can exist once per tribute: `000001` and `200003` are CBS/IBS rows from 2026 and Imposto
   Seletivo rows from 2027. Lookups must filter by tribute and validity date.
2. `TRATAMENTO_CLASSIFICACAO` links the classification to a row of `TRATAMENTO_TRIBUTARIO`, valid on
   the operation date.
3. `TRATAMENTO_TRIBUTARIO` holds the formulas (`TRTR_EXPRESSAO_*`) and flags. A treatment flagged
   `TRTR_IN_POSSUI_AJUSTE` (16 of 43) fails with `ErroFaltaImplementacaoException`
   (`CalculoCbsIbsService.java:150`).
4. `PERCENTUAL_REDUCAO` gives the reduction per classification and tribute. It is looked up only when
   the treatment sets `TRTR_IN_POSSUI_PERCENTUAL_REDUCAO` (`CalculoCbsIbsService.java:203`).

### Rate lookup

The rate comes from the operation's `aliquotasNominais` when given, otherwise from the database by rate
type (`CalculoCbsIbsService.java:221`). Classification `510001` is forced to `Padrão` (`:211`).

CBS and IBS classifications, by rate type:

| Rate type | Classifications | Source when no nominal rate is given |
| --- | --- | --- |
| `Sem alíquota` | 88 | zero |
| `Padrão` | 65 | `ALIQUOTA_PADRAO` for UF or municipality, falling back to `ALIQUOTA_REFERENCIA` |
| `Uniforme setorial` | 8 | `ALIQUOTA_AD_VALOREM_SERVICO` by NBS, then by classification; monophasic fuels use constants |
| `Fixa` | 7, of which 3 expired | `ALIQUOTA_AD_VALOREM_SERVICO` by classification |
| `Uniforme nacional (referência)` | 5 | `ALIQUOTA_REFERENCIA` |

The 29 classifications of type `Alíquotas Combinadas (Ad Valorem e Ad Rem)` all belong to the Imposto
Seletivo, which the simulator calculates in its own path since Epic 12 (`docs/calculation.md`, Imposto Seletivo). Their branch in the CBS/IBS switch is empty upstream ("para fazer").

**The database has reference rates for 2026 only**, and `ALIQUOTA_PADRAO` is empty:

| Tribute | `TBTO_ID` | 2026 rate |
| --- | --- | --- |
| CBS | 2 | 0.9% |
| IBS UF | 3 | 0.1% |
| IBS Mun | 4 | 0% |

From 2027 the database holds no rates, so the operation must carry `aliquotasNominais` for
every CST that requires the IBS/CBS group, and before 2027 it must not
(`ProcessamentoItemService.java:454`, threshold year `2027` at `:60`). The simulator asks the visitor
for rates on any date from 2027, and prefills the 2027 and 2028 IBS the law fixes (LC 214/2025,
art. 344: 0.05% state and 0.05% municipal); only the CBS rate awaits the Senate.

### The formulas

Each tribute evaluates up to five formulas, in this order, each one feeding the next
(`CalculoCbsIbsService.java:295` to `:480`):

| Formula | Most common value | Rows |
| --- | --- | --- |
| rate | `aliquota` | 28 of 43 |
| effective rate | `aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)` | 33 |
| base | `baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado` | 31 |
| calculated tribute | `baseCalculo*aliquotaEfetiva` | 34 |
| tribute due | `tributoCalculado` | 36 |

Two more, deferral percentage and deferral amount, are set on 2 rows only.

The whole grammar across all 43 rows is `+ - * /`, parentheses, decimal literals and 17 variable
names: `aliquota`, `aliquotaAdRem`, `aliquotaAdRemPrincipal`, `aliquotaAdRemSecundaria`,
`aliquotaAdValorem`, `aliquotaEfetiva`, `baseCalculo`, `baseCalculoInformada`,
`impostoSeletivoCalculado`, `impostoSeletivoInformado`, `pBio`, `pRedutorCompraGov`,
`percentualDiferimento`, `percentualReducao`, `quantidade`, `tributoCalculado`,
`variacaoPontoPercentual`. A missing variable counts as zero (`CalculoCbsIbsService.java:710`). No
function calls, no conditionals. The Epic 3 port needs a small arithmetic parser, not a JEXL engine.

### Numeric policy

`shared/util/ArredondamentoUtils.java`. The port must reproduce it exactly, which rules out plain
JavaScript `number`:

- Arithmetic is exact decimal. Only division rounds, to 34 significant digits, `HALF_EVEN` (`:83`).
- Every rounding is `HALF_EVEN` (banker's rounding, `:68`), never half-up.
- Rates move between percentage points and fractions by shifting the decimal point (`:140`).
- The rate and the effective rate are rounded once, to 4 places in percentage points, and the rounded
  value is what multiplies the base (`CalculoCbsIbsService.java:705`).
- The base is rounded to 2 places before the multiplication, except in monophasic treatments, where
  the base is a quantity. A negative base becomes zero (`:370`).
- The calculated tribute is computed exactly from the published base and effective rate, then rounded
  once to 2 places (`:404`).
- The JSON response prints rates with 2 to 4 places (`ESCALA_ALIQUOTA_MIN` and `_MAX`, `:74`):
  `pCBS` `0.90`, but `8.8123` with effective rate `3.5249` in fixture `upstream-rounding-t4`.

Fixture `rounding-half-even-2026` pins the rounding mode: a base of `25.00` gives an exact IBS UF of
`0.025`, published as `0.02`. Half-up would give `0.03`.

## Running the Simples Nacional calculator

Same toolchain as the regular regime calculator (JDK 25, Maven wrapper). It has no Flyway scripts of
its own: it reads the database the regular regime submodule builds, and only the Simples tables
(`*_SIMPLES_NACIONAL`, from `V0049`, `V0050`, `V0051` and `V0071`) are its own. The D1 dump already
carries all 8 of them, since the lean load keeps every upstream table (`docs/open-data.md`, Lean D1).

### Start

Build the regular regime database first (Running the regular regime calculator, step 1), then copy it:

```powershell
cd upstream/calculadora-rtc-simples-nacional
New-Item -ItemType Directory -Force calculadora/db
Copy-Item ../calculadora-rtc-regime-regular/calculadora/db/calculadora-pro.db calculadora/db/
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=offline"
```

Ready when the log shows `Tomcat started`. It listens on `8082` (API, base path `/api`) and `9103`
(metrics), so it runs next to the regular regime calculator on `8080`. `GET /api/versao` answers
`versaoApp` `1.0.2` and `versaoDb` `V0073`.

### Smoke test

```powershell
$operation = '{"id":"smoke-sn-001","versao":"1.0.0","data":"2027-03-10","tpDoc":"55","CRT":"1","itens":[{"numero":1,"cAtivSN":"01","cClassTrib":"000001","ncm":"22030000","baseCalculo":"1000.00","valorImpostoSeletivo":"0.00","pCBSSN":"2.3591","pIBSSN":"0.0260"}]}'
Invoke-RestMethod -Method Post -Uri http://localhost:8082/api/calculadora/observabilidade/simples-nacional -ContentType 'application/json' -Body $operation
```

Expected: HTTP 200, `estadoItem` `CALCULADO`, `vCBSSN` `23.59`, `vIBSSN` `0.26`, `totalItem` `23.85`.

### What it calculates

The classic endpoint, `POST /api/calculadora/observabilidade/simples-nacional`, takes the operation
date (`data`, not `dhFatoGerador`), `tpDoc`, `CRT`, optional `tpRegimeIBSCBS` and `tpEnteGov`, and per
item the activity (`cAtivSN`), the cClassTrib, NCM or NBS, the base and the two effective rates
(`pCBSSN`, `pIBSSN`). Paths below are relative to
`upstream/calculadora-rtc-simples-nacional/src/main/java/br/gov/serpro/rtc/api/simplesnacional/`.

- **The effective rates are input.** They come from the PGDAS, which derives them from the company's
  revenue over the last 12 months and its annex. Upstream does not compute them, and the database has
  no annex table to compute them from (`service/SimplesNacionalCalculoService.java`, `InsumoCalculoSimples`).
- **Everything starts on 2027-01-01.** Every Simples parameter row starts then; a 2026 operation is
  rejected with `VSN-015`, since no document is enabled for the calculation on that date.
- **The cClassTrib decides the revenue type** (`CLASSIFICACAO_TRIBUTARIA.CLTR_TPRBSN`), and the type
  decides the share of the revenue that is taxed (`TRBS_FATOR_RECEITA`: 1, 0.5 or 0) and whether the
  tax is due or pending (`TRBS_IN_PENDENTE_SUSPENSO`, indirect exports).
- **The CRT decides the destination** (`REGIME_APURACAO_SIMPLES_NACIONAL`): `CRT` `1` pays CBS and IBS,
  `CRT` `2` (sublimit exceeded) gets no IBS field, and `CRT` `3` with `tpRegimeIBSCBS` `2` leaves
  everything pending. `CRT` `4` (MEI) and the pure regular regime are rejected (`VSN-019`).
- **The tax is `revenue × factor × rate / 100`**, exact, rounded once to 2 places `HALF_EVEN`
  (`service/SimplesNacionalCalculoService.java`, `calcularItem`). Totals add the rounded values.
- **A government purchase moves rate between the two taxes** (arts. 372 and 473 of LC 214/2025): the
  Union (`tpEnteGov` `1`) gets all of it as CBS; a state, the Federal District or a municipality moves a
  share of the CBS into the IBS, 0% until 2028 and up to 100% from 2033
  (`TRANSICAO_ALIQUOTA_COMPRA_GOV_SIMPLES_NACIONAL`).
- **A missing, unknown or disallowed activity is not an error.** The item ends `NAO_CALCULADO`, with
  its revenue counted in `vRBSNtot` and no tax.

The non-assisted endpoint (`.../simples-nacional/nao-assistido`) also covers the NFS-e: it takes the
rates per annex, the Fator R and the ISS situation of each item, and rounds the rate to 2 places on
the NFS-e. This project ports it since v0.8.0 (`docs/simples-nacional.md`).

## Running the DANFSe generator

### Toolchain

| Tool | Version used | Install (Windows) |
| --- | --- | --- |
| Go | 1.27.4 | `winget install GoLang.Go` |

[Task](https://taskfile.dev/) is optional; `go run` is enough.

### Start

```powershell
cd upstream/calculadora-rtc-gerador-danfse
$env:SERVER_PORT = '8081'
go run ./cmd/danfse
```

The first run downloads the Go modules. Ready when stderr shows the JSON log line
`"msg":"servidor danfse online","port":"8081"`. Swagger UI:
`http://localhost:8081/api/swagger-ui/index.html`.

Port `8081` keeps it apart from the regular regime calculator on `8080`.

### Render a PDF

From a second terminal at the repository root, with the generator still running:

```powershell
Invoke-WebRequest -Method Post -Uri http://localhost:8081/api/danfse -ContentType 'application/xml' -InFile fixtures/danfse/sample-nfse.xml -OutFile $env:TEMP\danfse.pdf
```

Expected: HTTP 200, a one-page PDF of about 80 KB, in about 0.2 s. Query `stc=1` or `stc=2` adds the
replaced or cancelled watermark; `canhoto=false` hides the receipt stub. An invalid `stc` returns 400.

The layout, the XML paths behind each field and the WebAssembly build are in `docs/danfse-layout.md`.
