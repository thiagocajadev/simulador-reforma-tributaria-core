# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, through GitHub's **Report a vulnerability** button on this
repository's Security tab (private vulnerability reporting). Do not open a public issue for it.

Include what you found, how to reproduce it, and what it affects. This is an open source project kept
by volunteers, so there is no bounty.

## Scope

In scope: the code in this repository (the Worker, the engines, the ETL, the note modules and the
playground).

Out of scope: the Receita Federal calculators in `upstream/` (report those to their maintainers), a
deploy someone else runs from this code, and volumetric denial of service against a free plan, whose
limits are documented in `docs/rate-limiting.md`.

## What the code holds

No accounts, no login and no personal data: an operation is calculated and discarded. The notes carry
a test signature with fictitious values and sign nothing. The checklist the code was hardened
against is in `docs/security.md`.
