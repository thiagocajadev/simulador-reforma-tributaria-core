// NBS search over D1. Only full 9-digit codes are returned, valid on the reference date.
// A code prefix walks the NBS primary key in order; text goes through the SEARCH_NBS FTS5 table,
// in code order (its rowid), never by relevance: ranking would score every match before the
// LIMIT. Both stop at limit + 1 rows.

import type { SearchQuery } from "@/shared/data/search.match.ts";
import { toSearchOutcome } from "@/shared/data/search.page.ts";
import { buildValidOnClause, toValidityPeriod } from "@/shared/data/validity.period.ts";
import type { NbsMatch } from "./nbs.dto.ts";

interface NbsSearchInput {
  query: SearchQuery;
  date: string;
  limit: number;
}

interface NbsRow {
  nbsCode: string;
  description: string;
  context: string;
  validFrom: string;
  validTo: string | null;
}

const NBS_VALID_ON = buildValidOnClause({
  startColumn: "NBS.NBS_INICIO_VIGENCIA",
  endColumn: "NBS.NBS_FIM_VIGENCIA",
  dateParameter: "?1",
});

const NBS_COLUMNS = `
  NBS.NBS_CD AS nbsCode,
  SEARCH_NBS.DESCRIPTION AS description,
  SEARCH_NBS.CONTEXT AS context,
  NBS.NBS_INICIO_VIGENCIA AS validFrom,
  NBS.NBS_FIM_VIGENCIA AS validTo`;

const SEARCH_BY_CODE_SQL = `
SELECT ${NBS_COLUMNS}
FROM
  NBS
JOIN
  SEARCH_NBS ON SEARCH_NBS.rowid = CAST(NBS.NBS_CD AS INTEGER)
WHERE
  NBS.NBS_CD >= ?2 AND
  NBS.NBS_CD < ?3 AND
  length(NBS.NBS_CD) = 9 AND
  ${NBS_VALID_ON}
ORDER BY
  NBS.NBS_CD
LIMIT ?4;`;

const SEARCH_BY_TEXT_SQL = `
SELECT ${NBS_COLUMNS}
FROM
  SEARCH_NBS
JOIN
  NBS ON NBS.NBS_CD = SEARCH_NBS.SOURCE_ID
WHERE
  SEARCH_NBS MATCH ?2 AND
  ${NBS_VALID_ON}
ORDER BY
  SEARCH_NBS.rowid
LIMIT ?3;`;

async function searchNbs(database: D1Database, input: NbsSearchInput) {
  const { query, date, limit } = input;
  const statement =
    query.kind === "code"
      ? database
          .prepare(SEARCH_BY_CODE_SQL)
          .bind(date, query.codePrefix, query.codeUpperBound, limit + 1)
      : database.prepare(SEARCH_BY_TEXT_SQL).bind(date, query.matchExpression, limit + 1);
  const { results, meta } = await statement.all<NbsRow>();
  const outcome = toSearchOutcome({
    rows: results.map(toNbsMatch),
    limit,
    rowsRead: meta.rows_read,
  });
  return outcome;
}

function toNbsMatch(row: NbsRow) {
  const match: NbsMatch = {
    nbsCode: row.nbsCode,
    description: row.description,
    context: row.context,
    ...toValidityPeriod(row.validFrom, row.validTo),
  };
  return match;
}

export { searchNbs };
