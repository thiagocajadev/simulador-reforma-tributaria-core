// Parses a search text the way the routes do, for tests that call a repository directly.

import { parseSearchQuery, type SearchQuery } from "@/shared/data/search.match.ts";

function toSearchQuery(text: string) {
  const parsed = parseSearchQuery(text);

  if (!parsed.isValid) {
    throw new Error(`Test search text "${text}" is invalid: ${parsed.issue.message}`);
  }

  const query: SearchQuery = parsed.value;
  return query;
}

export { toSearchQuery };
