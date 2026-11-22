// The Imposto Seletivo classifications valid on a date, with their CST, for the form's picker:
// tribute 1, as ClassificacaoTributariaRepository.buscarClassificacaoTributaria finds them, and
// whether their treatment calculates the tax (TRTR 1) or yields zero (TRTR 2, "Sem Cálculo").
// About 30 rows, listed whole in code order: SEARCH_CLASSIFICATION holds none of them. The IS
// situations are found once (the IN list), so each classification is read once.

import { SELECTIVE_TAX_ID } from "@/shared/data/selective.tax.match.ts";
import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { SelectiveTaxClassification } from "./classifications.dto.ts";

interface SelectiveTaxClassificationRow {
  cClassTrib: string;
  description: string;
  cstCode: string;
  cstDescription: string;
  isCalculated: 0 | 1;
}

function validOn(startColumn: string, endColumn: string) {
  const clause = buildValidOnClause({ startColumn, endColumn, dateParameter: "?1" });
  return clause;
}

const LIST_SELECTIVE_TAX_CLASSIFICATIONS_SQL = `
SELECT
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD AS cClassTrib,
  CLASSIFICACAO_TRIBUTARIA.CLTR_DESCRICAO AS description,
  SITUACAO_TRIBUTARIA.SITR_CD AS cstCode,
  SITUACAO_TRIBUTARIA.SITR_DESCRICAO AS cstDescription,
  coalesce(TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_TRIBUTO_CALCULADO, '0') <> '0' AS isCalculated
FROM
  CLASSIFICACAO_TRIBUTARIA
CROSS JOIN
  SITUACAO_TRIBUTARIA ON SITUACAO_TRIBUTARIA.SITR_ID = CLASSIFICACAO_TRIBUTARIA.CLTR_SITR_ID
CROSS JOIN
  TRATAMENTO_CLASSIFICACAO ON TRATAMENTO_CLASSIFICACAO.TRCL_CLTR_ID = CLASSIFICACAO_TRIBUTARIA.CLTR_ID
CROSS JOIN
  TRATAMENTO_TRIBUTARIO ON TRATAMENTO_TRIBUTARIO.TRTR_ID = TRATAMENTO_CLASSIFICACAO.TRCL_TRTR_ID
WHERE
  CLASSIFICACAO_TRIBUTARIA.CLTR_SITR_ID IN (
    SELECT TRIBUTO_SITUACAO_TRIBUTARIA.TRST_SITR_ID
    FROM TRIBUTO_SITUACAO_TRIBUTARIA
    WHERE
      TRIBUTO_SITUACAO_TRIBUTARIA.TRST_TBTO_ID = ${SELECTIVE_TAX_ID} AND
      ${validOn("TRIBUTO_SITUACAO_TRIBUTARIA.TRST_INICIO_VIGENCIA", "TRIBUTO_SITUACAO_TRIBUTARIA.TRST_FIM_VIGENCIA")}
  ) AND
  ${validOn("CLASSIFICACAO_TRIBUTARIA.CLTR_INICIO_VIGENCIA", "CLASSIFICACAO_TRIBUTARIA.CLTR_FIM_VIGENCIA")} AND
  ${validOn("SITUACAO_TRIBUTARIA.SITR_INICIO_VIGENCIA", "SITUACAO_TRIBUTARIA.SITR_FIM_VIGENCIA")} AND
  ${validOn("TRATAMENTO_CLASSIFICACAO.TRCL_INICIO_VIGENCIA", "TRATAMENTO_CLASSIFICACAO.TRCL_FIM_VIGENCIA")}
ORDER BY
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD;`;

async function listSelectiveTaxClassifications(database: D1Database, date: string) {
  const { results, meta } = await database
    .prepare(LIST_SELECTIVE_TAX_CLASSIFICATIONS_SQL)
    .bind(date)
    .all<SelectiveTaxClassificationRow>();
  const outcome = {
    classifications: results.map(toSelectiveTaxClassification),
    rowsRead: meta.rows_read,
  };
  return outcome;
}

function toSelectiveTaxClassification(row: SelectiveTaxClassificationRow) {
  const classification: SelectiveTaxClassification = {
    cClassTrib: row.cClassTrib,
    description: row.description,
    cstCode: row.cstCode,
    cstDescription: row.cstDescription,
    isCalculated: row.isCalculated === 1,
  };
  return classification;
}

export { listSelectiveTaxClassifications };
