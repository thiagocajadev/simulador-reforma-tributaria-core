# Contributing

Forks, issues and pull requests are welcome. This file says how to get a change in without surprises.

## Before you start

- Read `AGENTS.md` (the commands and the rules) and `docs/decisions.md` (why the code is the way it
  is). A change that undoes a decision says so, and why, in the pull request.
- For anything larger than a fix, open an issue first, so the approach is agreed before the code.
- A calculation is right when it matches the official calculator, not when it looks right. A rule
  change comes with a golden case captured from the calculator in `upstream/` when it covers the
  case (`docs/upstream.md`), and the decimals stay strings (`src/shared/math/`).

## Set up

```bash
git clone --recurse-submodules https://github.com/<you>/simulador-reforma-tributaria-core.git
cd simulador-reforma-tributaria-core
npm ci
npm run data:load:local
npm run dev
```

## Before a pull request

1. `npm run check` passes: typecheck, Biome, the names audit and the three test projects. CI runs the
   same check on every pull request (`.github/workflows/check.yml`).
2. New behaviour has a test: the happy path, an edge, and the failure.
3. A route change updates `src/features/openapi/openapi.document.ts`; a fact the code states goes
   into its registry (`docs/decisions.md`, Registries).
4. Docs change with the code they describe.
5. One subject per pull request, with a commit message in English that says what changed and why
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Licensing

By contributing, you agree that your contribution is licensed under the MIT license of this
repository (`LICENSE`).
