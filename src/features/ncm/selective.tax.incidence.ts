// Whether the Imposto Seletivo applies to an NCM on a date, from the rate windows the ETL stores in
// SEARCH_NCM.SELECTIVE_TAX (scripts/open-data/search.index.ts). A rate applies when one of its rows
// is valid on the date and no exception over it is, the same test the calculation runs in SQL
// (selective.tax.match.ts); validity reads as buildValidOnClause does. Pure, so the form runs it
// again whenever the operation date changes.

import type { SelectiveTaxIncidence, SelectiveTaxWindow, ValidityWindow } from "./ncm.dto.ts";

const END_OF_DAY = "T23:59:59";

function readSelectiveTaxWindows(windowsJson: string | null) {
  const windows: SelectiveTaxWindow[] = windowsJson ? JSON.parse(windowsJson) : [];
  return windows;
}

function deriveSelectiveTaxIncidence(windows: SelectiveTaxWindow[], date: string) {
  const applying = windows.filter((window) => isApplying(window, date)).sort(byMostSpecificPrefix);
  const adRem = applying.find((window) => window.rate === "adRem");
  const adValorem = applying.find((window) => window.rate === "adValorem");

  if (!adValorem && !adRem) {
    return null;
  }

  const incidence: SelectiveTaxIncidence = {
    hasAdValorem: adValorem !== undefined,
    adRemUnit: adRem ? { code: adRem.unit ?? "", description: adRem.unitDescription ?? "" } : null,
    officialRates: { adValorem: adValorem?.value ?? null, adRem: adRem?.value ?? null },
  };
  return incidence;
}

// why: the calculation takes the row with the longest NCM prefix (selective.tax.match.ts), so the
// form shows that row's official rate.
function byMostSpecificPrefix(left: SelectiveTaxWindow, right: SelectiveTaxWindow) {
  const order = (right.prefixLength ?? 0) - (left.prefixLength ?? 0);
  return order;
}

function isApplying(window: SelectiveTaxWindow, date: string) {
  const isExcepted = window.exceptions.some((exception) => isValidOn(exception, date));
  const doesApply = isValidOn(window, date) && !isExcepted;
  return doesApply;
}

function isValidOn(window: ValidityWindow, date: string) {
  const isValid =
    window.from <= `${date}${END_OF_DAY}` && (window.to === null || window.to >= date);
  return isValid;
}

export { deriveSelectiveTaxIncidence, readSelectiveTaxWindows };
