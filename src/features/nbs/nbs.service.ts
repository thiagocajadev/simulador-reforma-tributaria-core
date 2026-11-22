import type { SearchOption } from "@/shared/data/search.option.ts";
import { requestSearchOptions } from "@/shared/http/search.request.ts";
import type { NbsMatch } from "./nbs.dto.ts";

const NBS_SEARCH_PATH = "/api/nbs";

async function searchNbsOptions(text: string, date: string) {
  const options = await requestSearchOptions({
    path: NBS_SEARCH_PATH,
    parameters: { q: text, date },
    toOption: toNbsOption,
  });
  return options;
}

function toNbsOption(match: NbsMatch) {
  const option: SearchOption = {
    code: match.nbsCode,
    label: match.description,
    hint: match.context || null,
  };
  return option;
}

export { searchNbsOptions };
