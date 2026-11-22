<!-- prettier-ignore-start -->
<div align="center">
  <h1 align="center">Simulador da Reforma Tributária: core</h1>
  <p align="center">
    Os motores de cálculo da CBS, do IBS e do IS, a API, os dados abertos e a geração do XML e do PDF das notas da reforma, em TypeScript.<br>
    <a href="README.en.md">English version</a>
  </p>
  <a href="https://github.com/thiagocajadev/simulador-reforma-tributaria-core/actions/workflows/check.yml"><img src="https://img.shields.io/github/actions/workflow/status/thiagocajadev/simulador-reforma-tributaria-core/check.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=check" alt="Check" /></a>
  <a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/Cloudflare%20Workers-plano%20gratuito-F38020?style=flat-square&logo=cloudflareworkers&logoColor=white" alt="Cloudflare Workers, plano gratuito" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 7" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-26%20LTS-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 26 LTS" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="Licença MIT" /></a>
  <a href="https://agents.md"><img src="https://img.shields.io/badge/AGENTS.md-compat%C3%ADvel-6e56cf?style=flat-square&logo=markdown&logoColor=white" alt="AGENTS.md compatível" /></a>
</div>
<!-- prettier-ignore-end -->

<br>

Este repositório é o núcleo de um simulador da reforma tributária do consumo (EC 132/2023 e LC 214/2025): as regras portadas das calculadoras de código aberto da Receita Federal, os dados abertos que elas leem e uma API que calcula a **CBS**, o **IBS** e, de 2027 em diante, o **IS** de uma operação. Ele também monta o XML da NF-e e da NFS-e, desenha o DANFE e o DANFSe e valida o XML contra o XSD oficial.

Não há site aqui. Quem quiser uma interface constrói a sua sobre a API; para conferir tudo funcionando, `npm run dev` abre uma página local de desenvolvimento, o [playground](#playground).

> Simulação educativa, **sem valor fiscal**. O projeto segue as regras e os dados abertos das calculadoras da Receita Federal, mas é independente e sem vínculo com a Receita. Ele não substitui a apuração oficial nem um contador.

<details>
<summary><strong>Conceitos fundamentais</strong></summary>

| Conceito | O que é |
| :-- | :-- |
| **CBS** | Contribuição Social sobre Bens e Serviços, o tributo federal que substitui o PIS e a Cofins |
| **IBS** | Imposto sobre Bens e Serviços, de estados e municípios, que substitui o ICMS e o ISS |
| **IS** | Imposto Seletivo, cobrado sobre bens prejudiciais à saúde ou ao meio ambiente, de 2027 em diante |
| **NF-e e NFS-e** | A nota fiscal eletrônica de mercadorias e a de serviços; o **DANFE** e o **DANFSe** são os PDFs delas |
| **Dados abertos** | As tabelas que a Receita publica com a calculadora oficial: códigos, alíquotas, fórmulas e fundamentos legais |
| **Caso de referência** (golden fixture) | Um pedido e a resposta que a calculadora oficial deu, gravados uma vez; o motor precisa reproduzir cada valor |
| **Upstream** | Os repositórios das calculadoras da Receita, guardados em `upstream/` como referência, nunca executados em produção |

</details>

## Por que existe

Em novembro de 2026 a Receita Federal publicou como código aberto as calculadoras da reforma: três serviços separados, dois em Java e um em Go, cada um com a sua instalação e o seu banco. Este projeto porta as regras para TypeScript e as roda no plano gratuito da Cloudflare, sem contêiner e sem custo, com os casos das calculadoras oficiais como prova de que o resultado é o mesmo.

## O que tem aqui

- **Motores de cálculo:** o regime regular (CBS, IBS estadual e municipal, até 20 itens por operação, de NCM ou NBS, CST e cClassTrib), o Imposto Seletivo de 2027 em diante e o Simples Nacional, na NF-e e na NFS-e. Cada regra mantém o código do upstream (`REG-004`, `VSN-019`).
- **API:** um Worker [Hono](https://hono.dev) com rotas só de leitura, descritas à mão em OpenAPI 3.1 (`/api/openapi.json`).
- **Dados abertos:** o ETL que monta o SQLite a partir do SQL do Flyway da calculadora oficial e o exporta para o Cloudflare D1, com busca em FTS5.
- **Notas:** o XML da NF-e (NT 2025.002, grupos IBS, CBS e IS) e o DANFE (NT 2026.010); o XML da NFS-e e o DANFSe; a validação contra o XSD oficial com `xmllint-wasm`. Rodam no navegador ou no Node.
- **Rede de segurança:** os casos de referência capturados das calculadoras oficiais e os testes que os reproduzem a cada mudança.

## Como os números são conferidos

- **Casos de referência.** Cada caso em `fixtures/` foi calculado uma vez pelas calculadoras oficiais, no regime regular e no Simples Nacional. O motor reproduz cada valor, situação e código de regra deles a cada execução dos testes; a contagem por regime está em [`validation.cases.ts`](src/shared/content/validation.cases.ts).
- **Fórmulas como dados.** O regime regular roda as fórmulas guardadas nos dados abertos, com aritmética decimal exata e o arredondamento do upstream (HALF_EVEN). A API devolve cada passo que executou ([docs/calculation.md](docs/calculation.md)).
- **Fontes como dados.** Cada link oficial vem de um registro conferido, com a data da conferência ([`official.sources.ts`](src/shared/content/official.sources.ts)).

## Arquitetura

```
Cliente (seu front, um script,      Cloudflare Worker (Hono)              D1 (SQLite)
um agente ou o playground)    ──▶   rotas /api/*, limite de pedidos  ──▶  dados abertos: NCM, NBS,
                                    motor de cálculo (TypeScript)         CST, cClassTrib, alíquotas,
XML, DANFE, DANFSe e XSD            /api/openapi.json                     fórmulas, fundamentos legais
(módulos TS, no navegador)
```

- **Fatias verticais.** Cada funcionalidade tem uma pasta em `src/features/` com rota, domínio e acesso a dados.
- **Upstream como referência.** Os três repositórios da Receita são submódulos do git em `upstream/`. Deles vêm os dados abertos, as regras (portadas para TypeScript) e os casos de referência. O plano gratuito da Cloudflare não roda contêineres, então nada deles vai para produção.
- **PDF e XSD fora do Worker.** O orçamento de CPU por pedido do plano gratuito não comporta desenhar um PDF nem rodar o libxml2, então esses módulos rodam no cliente.

## Rodar localmente

Precisa do Node.js 26 (o 24 também serve) e do git.

```bash
git clone --recurse-submodules https://github.com/thiagocajadev/simulador-reforma-tributaria-core.git
cd simulador-reforma-tributaria-core
npm ci
npm run data:load:local   # monta os dados abertos a partir de upstream/ e carrega no D1 local
npm run dev               # a API e o playground em http://localhost:5173
```

```bash
curl "http://localhost:5173/api/ncm?q=cerveja&date=2027-03-10"
```

| Comando | O que faz |
| :-- | :-- |
| `npm run dev` | O Worker e o playground no mesmo processo, com recarga ao editar |
| `npm run check` | Typecheck, Biome, a auditoria de nomes e os três projetos de teste |
| `npm run build` | Typecheck e o bundle do Worker em `dist/`, sem publicar |
| `npm run data:build` | Remonta o dump dos dados abertos em `.data/` |

Publicar numa conta Cloudflare sua: [docs/deploy.md](docs/deploy.md).

## Playground

`npm run dev` abre em `http://localhost:5173` uma página simples, sem framework, feita para desenvolvimento ([`playground/`](playground/)):

1. escolha uma operação de demonstração e edite o JSON do pedido;
2. **Calcular** chama `POST /api/calculations` e mostra o resultado por item;
3. a NF-e ou a NFS-e simulada sai em XML e em PDF, e **Validar XML** confere o XML contra o XSD oficial;
4. um XML seu também pode ser validado, sem sair do navegador.

Ela não vai para produção e não substitui um front: é a forma mais curta de ver os módulos funcionando.

## API

Só de leitura, sem login nem chave, com limite de pedidos por endereço. A descrição completa está em `/api/openapi.json`, que qualquer leitor de OpenAPI carrega.

| Rota | O que responde |
| :-- | :-- |
| `GET /api/health` | Se o Worker e o D1 respondem |
| `GET /api/ncm`, `/api/nbs` | Busca de produtos e serviços |
| `GET /api/cst`, `/api/classifications`, `/api/classifications/selective-tax` | Códigos de situação e de classificação tributária |
| `GET /api/municipalities`, `/api/rates` | Municípios e alíquotas por data |
| `GET /api/operation-indicators` | Itens da LC 116 e indicadores de operação da NFS-e |
| `POST /api/calculations` | O cálculo do regime regular, com o IS |
| `GET /api/simples-nacional-activities`, `POST /api/simples-nacional-calculations` | O Simples Nacional |

## Para agentes de IA

O repositório oferece **AX** (Agent eXperience): documentos escritos para que um agente entenda o projeto e trabalhe nele sem adivinhar.

1. [`AGENTS.md`](AGENTS.md): o ponto de partida, com os comandos, as convenções e o que nunca fazer.
2. [`docs/decisions.md`](docs/decisions.md): cada decisão do projeto, com a data e o motivo.
3. [`docs/porting.md`](docs/porting.md): como portar o simulador para outro tributo, outro host ou outro documento.

## Documentação

| Assunto | Arquivo |
| :-- | :-- |
| Decisões e convenções | [docs/decisions.md](docs/decisions.md) |
| Pedido, resposta, regras e passos do cálculo | [docs/calculation.md](docs/calculation.md) |
| Simples Nacional, na NF-e e na NFS-e | [docs/simples-nacional.md](docs/simples-nacional.md) |
| XML da NF-e, validação e DANFE | [docs/nfe.md](docs/nfe.md) |
| XML da NFS-e e DANFSe | [docs/nfse.md](docs/nfse.md), [docs/danfse-layout.md](docs/danfse-layout.md) |
| Dados abertos no D1, busca e índices | [docs/open-data.md](docs/open-data.md) |
| Calculadoras upstream e casos de referência | [docs/upstream.md](docs/upstream.md) |
| Como portar o projeto | [docs/porting.md](docs/porting.md) |
| Publicar na sua conta Cloudflare | [docs/deploy.md](docs/deploy.md) |
| Limite de pedidos e o que ele não protege | [docs/rate-limiting.md](docs/rate-limiting.md) |
| Logs | [docs/observability.md](docs/observability.md) |
| Segurança | [docs/security.md](docs/security.md) |
| Siglas e nomes no código | [docs/glossary.md](docs/glossary.md) |

## Fora do escopo

- Uma interface de produção: o playground é só local.
- A tributação monofásica de combustíveis, os tratamentos com ajuste ou diferimento e as compras governamentais no regime regular: o item volta como fora do escopo, com o motivo.
- ICMS, IPI, PIS e Cofins na NF-e, a nota da NFC-e e uma assinatura real.
- O envio a qualquer Sefaz ou ao ambiente nacional da NFS-e.

## Contribuir

Fork, clone e pull requests são bem-vindos. Antes de abrir um PR, leia o [CONTRIBUTING.md](CONTRIBUTING.md); para relatar uma falha de segurança, o [SECURITY.md](SECURITY.md).

## Créditos

Criado por Thiago Cajaiba ([@thiagocajadev](https://github.com/thiagocajadev)).

## Licença

Este projeto usa a [licença MIT](LICENSE). Ele se baseia nas calculadoras de código aberto da Receita Federal do Brasil, também sob a licença MIT; os avisos delas, a origem dos dados abertos e a dos schemas XSD estão em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
