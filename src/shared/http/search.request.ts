// Calls one of the search routes and maps its page of matches to the options a picker shows.
// Parameters go through URLSearchParams, so a typed text never reaches the URL unencoded.

import type { SearchPage } from "@/shared/data/search.page.ts";
import { type Result, requestApi } from "./api.client.ts";

interface SearchRequest<Match, Option> {
  path: string;
  parameters: Record<string, string>;
  toOption: (match: Match) => Option;
}

async function requestSearchOptions<Match, Option>(request: SearchRequest<Match, Option>) {
  const { path, parameters, toOption } = request;
  const query = new URLSearchParams(parameters).toString();
  const result = await requestApi<SearchPage<Match>>(`${path}?${query}`);

  if (!result.isSuccess) {
    return result;
  }

  const options: Result<Option[]> = { isSuccess: true, value: result.value.items.map(toOption) };
  return options;
}

export { requestSearchOptions };
