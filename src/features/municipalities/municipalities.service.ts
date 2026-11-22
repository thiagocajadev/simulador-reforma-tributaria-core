import type { SearchOption } from "@/shared/data/search.option.ts";
import { requestSearchOptions } from "@/shared/http/search.request.ts";
import type { MunicipalityMatch } from "./municipalities.dto.ts";

const MUNICIPALITY_SEARCH_PATH = "/api/municipalities";

interface MunicipalitySearch {
  text: string;
  uf: string;
  date: string;
}

async function searchMunicipalityOptions(search: MunicipalitySearch) {
  const { text, uf, date } = search;
  const options = await requestSearchOptions({
    path: MUNICIPALITY_SEARCH_PATH,
    parameters: { q: text, uf, date },
    toOption: toMunicipalityOption,
  });
  return options;
}

function toMunicipalityOption(match: MunicipalityMatch) {
  const option: SearchOption = {
    code: String(match.municipalityCode),
    label: match.name,
    hint: match.uf,
  };
  return option;
}

export { searchMunicipalityOptions };
