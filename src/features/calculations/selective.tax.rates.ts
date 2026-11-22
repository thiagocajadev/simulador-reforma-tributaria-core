// The Imposto Seletivo rates of an item, as ProcessamentoItemService.analisarAliquotaImpostoSeletivo
// resolves them: each rate the visitor typed wins, and the open data fills only a rate left out,
// for a full NCM, once its row holds a value. A rate neither side gives stays null.

import type { OperationItem, SelectiveTaxRateSource } from "./calculation.dto.ts";
import type { SelectiveTaxRatesFacts } from "./calculation.facts.ts";

interface ResolvedSelectiveTaxRate {
  rate: string;
  source: SelectiveTaxRateSource;
}

interface ResolvedSelectiveTaxRates {
  adValorem: ResolvedSelectiveTaxRate | null;
  adRem: ResolvedSelectiveTaxRate | null;
}

function resolveSelectiveTaxRates(item: OperationItem, rates: SelectiveTaxRatesFacts) {
  const typed = item.selectiveTax;
  const resolved: ResolvedSelectiveTaxRates = {
    adValorem: pickRate(typed?.adValoremRate, rates.adValorem?.percent),
    adRem: pickRate(typed?.adRemRate, rates.adRem?.amount),
  };
  return resolved;
}

function pickRate(typedRate: string | undefined, officialRate: string | null | undefined) {
  if (typedRate !== undefined) {
    const nominal: ResolvedSelectiveTaxRate = { rate: typedRate, source: "nominal" };
    return nominal;
  }

  if (officialRate === null || officialRate === undefined) {
    return null;
  }

  const official: ResolvedSelectiveTaxRate = { rate: officialRate, source: "official" };
  return official;
}

function hasResolvedRate(resolved: ResolvedSelectiveTaxRates) {
  const hasRate = resolved.adValorem !== null || resolved.adRem !== null;
  return hasRate;
}

export type { ResolvedSelectiveTaxRate, ResolvedSelectiveTaxRates };
export { hasResolvedRate, resolveSelectiveTaxRates };
