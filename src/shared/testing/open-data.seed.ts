// Loads the open data dump into the D1 binding of a route test, in one batch (one transaction),
// so the deferred foreign keys hold as they do in `wrangler d1 execute --file`.

import { env } from "cloudflare:workers";
import { inject } from "vitest";

async function seedOpenData() {
  const statements = inject("openDataStatements");
  const preparedStatements = statements.map((statement) => env.OPEN_DATA.prepare(statement));

  await env.OPEN_DATA.batch(preparedStatements);
}

export { seedOpenData };
