import type { SearchPage } from "@/shared/data/search.page.ts";

interface NbsMatch {
  nbsCode: string;
  description: string;
  context: string;
  validFrom: string;
  validTo: string | null;
}

type NbsSearchResult = SearchPage<NbsMatch>;

export type { NbsMatch, NbsSearchResult };
