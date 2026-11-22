type TaxName = "CBS" | "IBS_UF" | "IBS_MUN";

type RateSource = "standard" | "reference";

interface TaxRate {
  tax: TaxName;
  rate: string;
  source: RateSource;
}

interface RateLookupResult {
  rates: TaxRate[];
  requiresNominalRates: boolean;
}

export type { RateLookupResult, RateSource, TaxName, TaxRate };
