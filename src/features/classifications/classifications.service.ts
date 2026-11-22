import type { SearchOption } from "@/shared/data/search.option.ts";
import { type Result, requestApi } from "@/shared/http/api.client.ts";
import { requestSearchOptions } from "@/shared/http/search.request.ts";
import type {
  ClassificationMatch,
  SelectiveTaxClassification,
  SelectiveTaxClassificationList,
} from "./classifications.dto.ts";

interface ClassificationOption extends SearchOption {
  cstCode: string;
}

interface SelectiveTaxClassificationOption extends ClassificationOption {
  isCalculated: boolean;
}

const CLASSIFICATION_SEARCH_PATH = "/api/classifications";
const SELECTIVE_TAX_LIST_PATH = "/api/classifications/selective-tax";
const DIACRITICS = /\p{Diacritic}/gu;

async function searchClassificationOptions(text: string, date: string) {
  const options = await requestSearchOptions({
    path: CLASSIFICATION_SEARCH_PATH,
    parameters: { q: text, date },
    toOption: toClassificationOption,
  });
  return options;
}

function toClassificationOption(match: ClassificationMatch) {
  const option: ClassificationOption = {
    code: match.cClassTrib,
    label: match.description,
    hint: `CST ${match.cstCode} · alíquota ${match.rateType.toLowerCase()}`,
    cstCode: match.cstCode,
  };
  return option;
}

// why: the IS list has about 30 entries, so it comes whole and the typed text filters it here.
async function searchSelectiveTaxClassificationOptions(text: string, date: string) {
  const query = new URLSearchParams({ date }).toString();
  const listing = await requestApi<SelectiveTaxClassificationList>(
    `${SELECTIVE_TAX_LIST_PATH}?${query}`,
  );

  if (!listing.isSuccess) {
    return listing;
  }

  const wanted = foldText(text);
  const options = listing.value.items
    .filter(
      (entry) =>
        entry.cClassTrib.startsWith(wanted) || foldText(entry.description).includes(wanted),
    )
    .map(toSelectiveTaxClassificationOption);
  const result: Result<SelectiveTaxClassificationOption[]> = { isSuccess: true, value: options };
  return result;
}

function toSelectiveTaxClassificationOption(entry: SelectiveTaxClassification) {
  const treatment = entry.isCalculated ? "com cálculo" : "sem cálculo, IS zero";
  const option: SelectiveTaxClassificationOption = {
    code: entry.cClassTrib,
    label: entry.description,
    hint: `CST ${entry.cstCode} · ${treatment}`,
    cstCode: entry.cstCode,
    isCalculated: entry.isCalculated,
  };
  return option;
}

function foldText(text: string) {
  const folded = text.normalize("NFD").replace(DIACRITICS, "").toLowerCase().trim();
  return folded;
}

export type { ClassificationOption, SelectiveTaxClassificationOption };
export { searchClassificationOptions, searchSelectiveTaxClassificationOptions };
