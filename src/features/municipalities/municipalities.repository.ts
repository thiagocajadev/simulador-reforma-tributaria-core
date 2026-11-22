// Municipality search, within one UF or nationwide, valid on the reference date. A code prefix
// becomes an integer range on the IBGE code (the primary key); text goes through
// SEARCH_MUNICIPALITY, with the UF inside the MATCH when one is given. Results follow the IBGE code,
// so FTS5 never scores every match.

import type { SearchQuery } from "@/shared/data/search.match.ts";
import { toSearchOutcome } from "@/shared/data/search.page.ts";
import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { MunicipalityMatch } from "./municipalities.dto.ts";

interface MunicipalitySearchInput {
  query: SearchQuery;
  uf: string | null;
  ufCode: number | null;
  date: string;
  limit: number;
}

const IBGE_CODE_LENGTH = 7;

const MUNICIPALITY_COLUMNS = `
  MUNICIPIO.MUNI_CD AS municipalityCode,
  MUNICIPIO.MUNI_NOME AS name,
  UF.UF_SIGLA AS uf`;

const MUNICIPALITY_FILTER = `
  (?2 IS NULL OR MUNICIPIO.MUNI_UF_CD = ?2) AND
  ${buildValidOnClause({
    startColumn: "MUNICIPIO.MUNI_INICIO_VIGENCIA",
    endColumn: "MUNICIPIO.MUNI_FIM_VIGENCIA",
    dateParameter: "?1",
  })}`;

const SEARCH_BY_CODE_SQL = `
SELECT ${MUNICIPALITY_COLUMNS}
FROM
  MUNICIPIO
JOIN
  UF ON UF.UF_CD = MUNICIPIO.MUNI_UF_CD
WHERE
  MUNICIPIO.MUNI_CD >= ?3 AND
  MUNICIPIO.MUNI_CD < ?4 AND
  ${MUNICIPALITY_FILTER}
ORDER BY
  MUNICIPIO.MUNI_CD
LIMIT ?5;`;

const SEARCH_BY_TEXT_SQL = `
SELECT ${MUNICIPALITY_COLUMNS}
FROM
  SEARCH_MUNICIPALITY
JOIN
  MUNICIPIO ON MUNICIPIO.MUNI_CD = SEARCH_MUNICIPALITY.rowid
JOIN
  UF ON UF.UF_CD = MUNICIPIO.MUNI_UF_CD
WHERE
  SEARCH_MUNICIPALITY MATCH ?3 AND
  ${MUNICIPALITY_FILTER}
ORDER BY
  SEARCH_MUNICIPALITY.rowid
LIMIT ?4;`;

async function searchMunicipalities(database: D1Database, input: MunicipalitySearchInput) {
  const { query, uf, ufCode, date, limit } = input;
  const statement =
    query.kind === "code"
      ? prepareCodeSearch({ database, query, ufCode, date, limit })
      : database
          .prepare(SEARCH_BY_TEXT_SQL)
          .bind(date, ufCode, scopeToState(uf, query.quotedWords), limit + 1);
  const { results, meta } = await statement.all<MunicipalityMatch>();
  const outcome = toSearchOutcome({ rows: results, limit, rowsRead: meta.rows_read });
  return outcome;
}

// why: the UF column is indexed only to narrow the match; the typed words must not hit it.
function scopeToState(uf: string | null, quotedWords: string[]) {
  const nameTerms = quotedWords.map((word) => `DESCRIPTION : ${word}`).join(" AND ");

  if (uf === null) {
    return nameTerms;
  }

  const expression = `UF : "${uf}" AND ${nameTerms}`;
  return expression;
}

// why: an IBGE code has 7 digits, so the prefix "43149" spans [4314900, 4315000).
function prepareCodeSearch(input: {
  database: D1Database;
  query: Extract<SearchQuery, { kind: "code" }>;
  ufCode: number | null;
  date: string;
  limit: number;
}) {
  const { database, query, ufCode, date, limit } = input;
  const digitsMissing = Math.max(IBGE_CODE_LENGTH - query.codePrefix.length, 0);
  const scale = 10 ** digitsMissing;
  const lowerBound = Number(query.codePrefix) * scale;
  const upperBound = lowerBound + scale;
  const statement = database
    .prepare(SEARCH_BY_CODE_SQL)
    .bind(date, ufCode, lowerBound, upperBound, limit + 1);
  return statement;
}

export { searchMunicipalities };
