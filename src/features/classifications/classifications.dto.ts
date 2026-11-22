import type { SearchPage } from "@/shared/data/search.page.ts";

interface ClassificationMatch {
  cClassTrib: string;
  description: string;
  cstCode: string;
  rateType: string;
  nomenclature: string | null;
  validFrom: string;
  validTo: string | null;
}

type ClassificationSearchResult = SearchPage<ClassificationMatch>;

// An Imposto Seletivo classification; isCalculated is false where the treatment yields zero.
interface SelectiveTaxClassification {
  cClassTrib: string;
  description: string;
  cstCode: string;
  cstDescription: string;
  isCalculated: boolean;
}

interface SelectiveTaxClassificationList {
  items: SelectiveTaxClassification[];
}

export type {
  ClassificationMatch,
  ClassificationSearchResult,
  SelectiveTaxClassification,
  SelectiveTaxClassificationList,
};
