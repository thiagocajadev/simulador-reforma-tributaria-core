import type { SearchPage } from "@/shared/data/search.page.ts";

interface AdRemUnit {
  code: string;
  description: string;
}

// The rates the open data holds for the IS on the date: a percentage, and reais per unit. Null while
// a rate row holds no value, as every one does at V0073; the visitor then types it.
interface SelectiveTaxOfficialRates {
  adValorem: string | null;
  adRem: string | null;
}

// Whether the Imposto Seletivo applies to the code on the search date: an ad valorem rate, an ad
// rem rate per unit (with its unit, such as VN, "Vintena de cigarro"), or both. Null when neither.
interface SelectiveTaxIncidence {
  hasAdValorem: boolean;
  adRemUnit: AdRemUnit | null;
  officialRates: SelectiveTaxOfficialRates;
}

interface ValidityWindow {
  from: string;
  to: string | null;
}

// One Imposto Seletivo rate row over the code, with its value, its validity and the exceptions over
// it. `value` is absent or null while the open data holds no rate; `prefixLength` is the length of
// the NCM prefix the row covers, since the most specific row wins.
interface SelectiveTaxWindow extends ValidityWindow {
  rate: "adValorem" | "adRem";
  value?: string | null;
  prefixLength?: number;
  unit?: string;
  unitDescription?: string;
  exceptions: ValidityWindow[];
}

// `selectiveTax` is the incidence on the search date; `selectiveTaxWindows` lets a client evaluate
// another date without searching again.
interface NcmMatch {
  ncmCode: string;
  description: string;
  context: string;
  validFrom: string;
  validTo: string | null;
  selectiveTax: SelectiveTaxIncidence | null;
  selectiveTaxWindows: SelectiveTaxWindow[];
}

type NcmSearchResult = SearchPage<NcmMatch>;

export type {
  AdRemUnit,
  NcmMatch,
  NcmSearchResult,
  SelectiveTaxIncidence,
  SelectiveTaxOfficialRates,
  SelectiveTaxWindow,
  ValidityWindow,
};
