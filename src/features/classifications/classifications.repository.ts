// cClassTrib search over D1, CBS/IBS only: SEARCH_CLASSIFICATION holds no Imposto Seletivo row,
// so joining through it filters them out. Valid on the reference date, optionally within one CST.
// A code prefix (or no query, to list a CST) walks CLASSIFICACAO_TRIBUTARIA (202 rows) in code
// order; text goes through the FTS5 table, also in code order, never ranked by relevance.

import type { SearchQuery } from "@/shared/data/search.match.ts";
import { toSearchOutcome } from "@/shared/data/search.page.ts";
import { buildValidOnClause, toValidityPeriod } from "@/shared/data/validity.period.ts";
import type { ClassificationMatch } from "./classifications.dto.ts";

interface ClassificationSearchInput {
  query: SearchQuery | null;
  cstCode: string | null;
  date: string;
  limit: number;
}

interface ClassificationRow {
  cClassTrib: string;
  description: string;
  cstCode: string;
  rateType: string;
  nomenclature: string | null;
  validFrom: string;
  validTo: string | null;
}

// why: classification codes are digit strings, so [ "", ":" ) spans all of them.
const EVERY_CODE = { codePrefix: "", codeUpperBound: ":" };

const CLASSIFICATION_VALID_ON = buildValidOnClause({
  startColumn: "CLASSIFICACAO_TRIBUTARIA.CLTR_INICIO_VIGENCIA",
  endColumn: "CLASSIFICACAO_TRIBUTARIA.CLTR_FIM_VIGENCIA",
  dateParameter: "?1",
});

const CLASSIFICATION_COLUMNS = `
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD AS cClassTrib,
  SEARCH_CLASSIFICATION.DESCRIPTION AS description,
  SITUACAO_TRIBUTARIA.SITR_CD AS cstCode,
  CLASSIFICACAO_TRIBUTARIA.CLTR_TIPO_ALIQUOTA AS rateType,
  CLASSIFICACAO_TRIBUTARIA.CLTR_NOMENCLATURA AS nomenclature,
  CLASSIFICACAO_TRIBUTARIA.CLTR_INICIO_VIGENCIA AS validFrom,
  CLASSIFICACAO_TRIBUTARIA.CLTR_FIM_VIGENCIA AS validTo`;

const CST_FILTER = "(?2 IS NULL OR SITUACAO_TRIBUTARIA.SITR_CD = ?2)";

const SEARCH_BY_CODE_SQL = `
SELECT ${CLASSIFICATION_COLUMNS}
FROM
  CLASSIFICACAO_TRIBUTARIA
JOIN
  SEARCH_CLASSIFICATION ON SEARCH_CLASSIFICATION.rowid = CLASSIFICACAO_TRIBUTARIA.CLTR_ID
JOIN
  SITUACAO_TRIBUTARIA ON SITUACAO_TRIBUTARIA.SITR_ID = CLASSIFICACAO_TRIBUTARIA.CLTR_SITR_ID
WHERE
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD >= ?3 AND
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD < ?4 AND
  ${CST_FILTER} AND
  ${CLASSIFICATION_VALID_ON}
ORDER BY
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD
LIMIT ?5;`;

const SEARCH_BY_TEXT_SQL = `
SELECT ${CLASSIFICATION_COLUMNS}
FROM
  SEARCH_CLASSIFICATION
JOIN
  CLASSIFICACAO_TRIBUTARIA ON CLASSIFICACAO_TRIBUTARIA.CLTR_ID = SEARCH_CLASSIFICATION.rowid
JOIN
  SITUACAO_TRIBUTARIA ON SITUACAO_TRIBUTARIA.SITR_ID = CLASSIFICACAO_TRIBUTARIA.CLTR_SITR_ID
WHERE
  SEARCH_CLASSIFICATION MATCH ?3 AND
  ${CST_FILTER} AND
  ${CLASSIFICATION_VALID_ON}
ORDER BY
  SEARCH_CLASSIFICATION.rowid
LIMIT ?4;`;

async function searchClassifications(database: D1Database, input: ClassificationSearchInput) {
  const { query, cstCode, date, limit } = input;
  const statement =
    query?.kind === "text"
      ? database.prepare(SEARCH_BY_TEXT_SQL).bind(date, cstCode, query.matchExpression, limit + 1)
      : prepareCodeSearch({ database, codeRange: query ?? EVERY_CODE, cstCode, date, limit });
  const { results, meta } = await statement.all<ClassificationRow>();
  const outcome = toSearchOutcome({
    rows: results.map(toClassificationMatch),
    limit,
    rowsRead: meta.rows_read,
  });
  return outcome;
}

function prepareCodeSearch(input: {
  database: D1Database;
  codeRange: { codePrefix: string; codeUpperBound: string };
  cstCode: string | null;
  date: string;
  limit: number;
}) {
  const { database, codeRange, cstCode, date, limit } = input;
  const statement = database
    .prepare(SEARCH_BY_CODE_SQL)
    .bind(date, cstCode, codeRange.codePrefix, codeRange.codeUpperBound, limit + 1);
  return statement;
}

function toClassificationMatch(row: ClassificationRow) {
  const match: ClassificationMatch = {
    cClassTrib: row.cClassTrib,
    description: row.description,
    cstCode: row.cstCode,
    rateType: row.rateType,
    nomenclature: row.nomenclature,
    ...toValidityPeriod(row.validFrom, row.validTo),
  };
  return match;
}

export { searchClassifications };
