// NCM search over D1. Only full 8-digit codes are returned, valid on the reference date.
// A code prefix walks the NCM primary key in order; text goes through the SEARCH_NCM FTS5 table,
// in code order (its rowid), never by relevance: ranking would score every match before the
// LIMIT, and a common word matches thousands. Both stop at limit + 1 rows.
// Each match also says whether the Imposto Seletivo applies to it on the date, from the windows the
// search row carries, so the form can ask for its rates without another read.

import type { SearchQuery } from "@/shared/data/search.match.ts";
import { toSearchOutcome } from "@/shared/data/search.page.ts";
import { buildValidOnClause, toValidityPeriod } from "@/shared/data/validity.period.ts";
import type { NcmMatch } from "./ncm.dto.ts";
import { deriveSelectiveTaxIncidence, readSelectiveTaxWindows } from "./selective.tax.incidence.ts";

interface NcmSearchInput {
  query: SearchQuery;
  date: string;
  limit: number;
}

interface NcmRow {
  ncmCode: string;
  description: string;
  context: string;
  validFrom: string;
  validTo: string | null;
  selectiveTaxWindows: string | null;
}

const NCM_VALID_ON = buildValidOnClause({
  startColumn: "NCM.NCM_INICIO_VIGENCIA",
  endColumn: "NCM.NCM_FIM_VIGENCIA",
  dateParameter: "?1",
});

const NCM_COLUMNS = `
  NCM.NCM_CD AS ncmCode,
  SEARCH_NCM.DESCRIPTION AS description,
  SEARCH_NCM.CONTEXT AS context,
  NCM.NCM_INICIO_VIGENCIA AS validFrom,
  NCM.NCM_FIM_VIGENCIA AS validTo,
  SEARCH_NCM.SELECTIVE_TAX AS selectiveTaxWindows`;

const SEARCH_BY_CODE_SQL = `
SELECT ${NCM_COLUMNS}
FROM
  NCM
JOIN
  SEARCH_NCM ON SEARCH_NCM.rowid = CAST(NCM.NCM_CD AS INTEGER)
WHERE
  NCM.NCM_CD >= ?2 AND
  NCM.NCM_CD < ?3 AND
  length(NCM.NCM_CD) = 8 AND
  ${NCM_VALID_ON}
ORDER BY
  NCM.NCM_CD
LIMIT ?4;`;

const SEARCH_BY_TEXT_SQL = `
SELECT ${NCM_COLUMNS}
FROM
  SEARCH_NCM
JOIN
  NCM ON NCM.NCM_CD = SEARCH_NCM.SOURCE_ID
WHERE
  SEARCH_NCM MATCH ?2 AND
  ${NCM_VALID_ON}
ORDER BY
  SEARCH_NCM.rowid
LIMIT ?3;`;

async function searchNcm(database: D1Database, input: NcmSearchInput) {
  const { query, date, limit } = input;
  const statement =
    query.kind === "code"
      ? database
          .prepare(SEARCH_BY_CODE_SQL)
          .bind(date, query.codePrefix, query.codeUpperBound, limit + 1)
      : database.prepare(SEARCH_BY_TEXT_SQL).bind(date, query.matchExpression, limit + 1);
  const { results, meta } = await statement.all<NcmRow>();
  const outcome = toSearchOutcome({
    rows: results.map((row) => toNcmMatch(row, date)),
    limit,
    rowsRead: meta.rows_read,
  });
  return outcome;
}

function toNcmMatch(row: NcmRow, date: string) {
  const selectiveTaxWindows = readSelectiveTaxWindows(row.selectiveTaxWindows);
  const match: NcmMatch = {
    ncmCode: row.ncmCode,
    description: row.description,
    context: row.context,
    ...toValidityPeriod(row.validFrom, row.validTo),
    selectiveTax: deriveSelectiveTaxIncidence(selectiveTaxWindows, date),
    selectiveTaxWindows,
  };
  return match;
}

export { searchNcm };
