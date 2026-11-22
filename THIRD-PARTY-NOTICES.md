# Third-party notices

This project ports rules from, captures test cases from, and builds its open data from software of
the Receita Federal do Brasil. It also bundles official XML schemas. Their notices follow.

## The Receita Federal calculators

The calculation rules in `src/features/` are ported from, the golden fixtures in `fixtures/` were
captured from, the NFS-e XSD files are read from, and the open data dump is built from the Flyway
scripts of these repositories, kept as git submodules in `upstream/`:

- [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) (`upstream/calculadora-rtc-regime-regular/LICENSE`)
- [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) (`upstream/calculadora-rtc-simples-nacional/LICENSE`)
- [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) (`upstream/calculadora-rtc-gerador-danfse/LICENSE`)

Each carries the same license, reproduced here:

```
MIT License

Copyright (c) 2026 Receita Federal do Brasil

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This project is independent of the Receita Federal and is not endorsed by it.

## NF-e XML schemas

`src/shared/xml/schemas/nfe-pl010h-v1.03/` holds the five NF-e schemas of the Pacote de Liberação
nº 010h v1.03, published by the Portal Nacional da NF-e (`docs/nfe.md`, Validation), copied unchanged.
Among them, `xmldsig-core-schema_v1.01.xsd` is the W3C XML Signature schema, which the package
redistributes.

## Dependencies

The npm packages this project installs keep their own licenses, listed in each package under
`node_modules/` after `npm ci`.
