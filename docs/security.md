# Security

The checklist this code was hardened against, and what each item found. The threat model is small on
purpose: the API takes no account, no login and no personal data, holds no secret in the code, and
serves public open data. What is left to protect is the availability of a free-plan Worker, the
integrity of what a client reads, and, for whoever builds a front end on it, the visitor's browser.

To report a vulnerability: `SECURITY.md`.

## Checklist

| Item | Result |
| --- | --- |
| Response headers on the API | `src/shared/http/security.headers.ts`, on every `/api/*` answer, 404 and 500 included. No CORS, and `Cross-Origin-Resource-Policy: same-origin`, except `/api/openapi.json`: static, with no D1 read, it answers `Access-Control-Allow-Origin: *` and `cross-origin`, so an OpenAPI reader on another site loads it by URL; `openapi.route.test.ts` pins both sides. A front end on another origin calls the API from its own server, or adds the CORS it needs. |
| Response headers for a front end | `public/_headers` holds the policy a front end served by Workers static assets should ship: a Content Security Policy, HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy and COOP. Scripts allow `'self'` and `'wasm-unsafe-eval'` only, which lets the XML validator compile its WebAssembly (libxml2, `xmllint-wasm`) and never lets a script evaluate text as JavaScript. `security.headers.test.ts` keeps the file and the API headers in step. The local playground is not deployed and does not use it. |
| Secrets | No secret in the code. A deploy reads its Cloudflare token from the environment or from `wrangler login` (`docs/deploy.md`). No `.env`, `.dev.vars`, key or certificate file is tracked; `.gitignore` refuses them. |
| Input limits | Every route caps what it reads, below. |
| Rate limiting | Two bindings, 60 a minute per client (`docs/rate-limiting.md`), and the gap they leave, with a WAF rule that closes it on a zone of your own. |
| Logs | One event per `500` and `429`, never the client address or the body (`docs/observability.md`). |
| Unsafe APIs | No `eval`, no `innerHTML` (the playground writes text through `textContent` only). Text typed into a note is escaped in the XML (`xml.write.ts`) and flattened before the PDF (`pdf.text.ts`). |
| Search | Searches quote every word before FTS5 `MATCH` (`search.match.ts`). |
| Personal data | The fixtures and the sample NFS-e hold fictitious parties only: CNPJ `12.345.678/0001-95`, CPF `123.456.789-00`, `exemplo.invalid` addresses, "Rua Fictícia". |
| Workflow | `.github/workflows/check.yml`: `permissions: contents: read`, every action pinned by commit SHA, `persist-credentials: false`, and no secret at all, so a fork's pull request runs the same check. Dependabot opens weekly update pull requests for npm and the actions (`.github/dependabot.yml`). |

The D1 `database_id` in `wrangler.jsonc` is a placeholder here; a real one is not a secret either,
since using it requires an API token of the account.

## Input limits

| Route | Limits |
| --- | --- |
| `POST /api/calculations` | Body at most 32 KB; 1 to 20 items; every field shaped and checked (`docs/calculation.md`, Request). |
| `POST /api/simples-nacional-calculations` | Body at most 32 KB; 1 to 20 items; rates as decimal strings (`docs/simples-nacional.md`). |
| `GET /api/ncm`, `/api/nbs`, `/api/classifications`, `/api/municipalities` | Search text 2 to 60 characters; `limit` 1 to 20; codes and UF by pattern. |
| `GET /api/cst`, `/api/rates`, `/api/simples-nacional-activities`, `/api/operation-indicators`, `/api/classifications/selective-tax` | Date as `YYYY-MM-DD`; codes, UF and municipality by pattern. |
| `GET /api/health` | No input. |

Every visitor value reaches D1 as a bound parameter. The SQL text interpolates only constants and
column names from the code (`calculation.queries.ts`, `validOn`), never a request value.

## Test signature

The simulated NF-e and NFS-e carry a `Signature` (`src/shared/xml/xml.signature.ts`, Epic 11) only so
that the XML passes the XSD, which requires one. **It is a test signature and signs nothing.** It has
the shape the schemas fix (an enveloped XMLDSig with C14N, RSA-SHA1 and SHA-1 over the `Id` of
`infNFe` or `infNFSe`) and fictitious values: the digest, the signature value and the certificate are
Base64 of "RESUMO SIMULADO", "ASSINATURA SIMULADA, SEM VALOR" and "SIMULADA". No key exists, nothing is
hashed, and any real check fails: a Sefaz, the national NFS-e environment (ADN) or an XMLDSig verifier
rejects it.

What a real note needs instead, for whoever takes this code to production:

1. An ICP-Brasil certificate (e-CNPJ, A1 or A3) of the issuer.
2. Real data: the issuer's key, numbering and parties, and `tpAmb` `1` (production).
3. The XMLDSig enveloped signature computed over the canonical (C14N) form of `infNFe` (or the DPS,
   for the NFS-e), with the issuer's private key.
4. Submission over mutual TLS with that certificate: to the Sefaz of the state for the NF-e, to the
   ADN for the NFS-e, which generates and signs the NFS-e itself.
5. The authorization protocol stored with the note (`nfeProc` with `protNFe`), and the DANFE drawn
   from the authorized XML.

## ICP-Brasil certificates

The code never takes, stores or uses a certificate: no field accepts a `.pfx`, and the signature
above is fictitious. These are the rules for whoever runs this code with real notes:

- An A1 certificate (`.pfx`) lives in a secrets manager or an HSM, never in the repository, an image
  or a shared drive; an A3 stays on its token or smart card.
- Sign on the issuer's own server. Never in a browser, and never on a public site.
- The certificate password is kept apart from the file.
- Never upload a certificate to an online validator or converter.
- If a certificate leaks, revoke it at the certificate authority that issued it at once.

The repository ignores `*.pfx`, `*.p12`, `*.pem` and `*.key`, and GitHub push protection refuses a
known secret at the push (Repository settings, below).

## Repository settings

On the public repository: secret scanning with push protection, private vulnerability reporting
(which `SECURITY.md` points to), Dependabot alerts and security updates, and CodeQL default setup for
JavaScript, TypeScript and GitHub Actions. A fork that publishes its own deploy turns on the same.
