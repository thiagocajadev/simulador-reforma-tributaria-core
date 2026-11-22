import type { SearchOption } from "@/shared/data/search.option.ts";
import { requestSearchOptions } from "@/shared/http/search.request.ts";
import type { NcmMatch, SelectiveTaxWindow } from "./ncm.dto.ts";

// An NCM picked in the form, with the Imposto Seletivo windows the form checks against its date.
interface NcmOption extends SearchOption {
  selectiveTaxWindows: SelectiveTaxWindow[];
}

const NCM_SEARCH_PATH = "/api/ncm";

async function searchNcmOptions(text: string, date: string) {
  const options = await requestSearchOptions({
    path: NCM_SEARCH_PATH,
    parameters: { q: text, date },
    toOption: toNcmOption,
  });
  return options;
}

function toNcmOption(match: NcmMatch) {
  const option: NcmOption = {
    code: match.ncmCode,
    label: match.description,
    hint: match.context || null,
    selectiveTaxWindows: match.selectiveTaxWindows,
  };
  return option;
}

export type { NcmOption };
export { searchNcmOptions };
