# Deploy

How to publish the API to a Cloudflare account of your own. The repository deploys nothing by
itself: `.github/workflows/check.yml` only checks. Everything here fits the Cloudflare Free plan.

What a deploy publishes is the Worker, the `/api/*` routes. The playground (`index.html`,
`playground/`) is a local development page and is not part of it.

## First deploy

1. Log in: `npx wrangler login`.
2. Create the database and copy the `database_id` it prints into `wrangler.jsonc`, in place of the
   zeros:

   ```bash
   npx wrangler d1 create simulador-open-data
   ```

3. Load the open data into it (`docs/open-data.md`, Load into D1):

   ```bash
   npm run data:load:remote
   ```

4. Check, then deploy:

   ```bash
   npm run check
   npx wrangler deploy
   ```

5. The Worker answers at `https://simulador-reforma-tributaria-core.<your subdomain>.workers.dev`.
   Check `GET /api/health` and `GET /api/openapi.json` there.

The two rate limiting bindings use the namespace ids `1001` and `1002`, which must be unique in the
account; change them in `wrangler.jsonc` if another Worker already uses them.

## A domain of your own

To serve the API on a host of a zone in the same account, add it to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "api.example.com", "custom_domain": true }]
```

The deploy creates the DNS record and the certificate; no record may exist for that host beforehand.
On a zone, a WAF rate limiting rule can back the Worker's limiters (`docs/rate-limiting.md`, WAF
rule). Once the domain answers, set `"workers_dev": false` and deploy again, so no one reaches the
Worker around the zone's rules.

## Deploying from GitHub Actions

To deploy on every push to `main`, add a step after the check in a workflow of your own:

```yaml
- name: Deploy to Cloudflare
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: npx wrangler deploy
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard, My Profile, API Tokens, template "Edit Cloudflare Workers", scoped to the account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, Workers & Pages, Account details |

Set them with `gh secret set CLOUDFLARE_API_TOKEN` and `gh secret set CLOUDFLARE_ACCOUNT_ID`, which ask
for each value, so it never lands in the shell history. Pull request runs do not receive secrets, so
the deploy step must never run on them.

## Data

A deploy does not touch D1. Refreshing the open data after an upstream update is a manual step, with
`npm run data:load:remote` (`docs/open-data.md`, Load into D1).

## Rollback

Each deploy is a Worker version. To go back, run `npx wrangler rollback`, then revert the commit, so
the next deploy does not bring it back.
