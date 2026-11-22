import type { SearchPage } from "@/shared/data/search.page.ts";

interface MunicipalityMatch {
  municipalityCode: number;
  name: string;
  uf: string;
}

type MunicipalitySearchResult = SearchPage<MunicipalityMatch>;

export type { MunicipalityMatch, MunicipalitySearchResult };
