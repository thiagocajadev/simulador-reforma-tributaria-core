// The Simples Nacional activities valid on a date that a document type admits, through
// TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL, as the classic calculation checks them. 15 rows at V0073.

import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { SimplesActivity } from "./simples-activities.dto.ts";

interface SimplesActivityRow {
  activityCode: string;
  description: string;
  annex: string | null;
  isNonTaxable: number;
  annexWithoutFatorR: string | null;
  annexWithFatorR: string | null;
  hasIssInSimples: number;
  allowsMunicipalBenefit: number;
}

function validOn(startColumn: string, endColumn: string) {
  const clause = buildValidOnClause({ startColumn, endColumn, dateParameter: "?1" });
  return clause;
}

const LIST_SIMPLES_ACTIVITIES_SQL = `
SELECT
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_CATIVSN AS activityCode,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_DESCRICAO AS description,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_ROTULO_CURTO AS annex,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_IN_NAO_TRIBUTAVEL AS isNonTaxable,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_ANEXO_SEM_FATOR_R AS annexWithoutFatorR,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_ANEXO_COM_FATOR_R AS annexWithFatorR,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_IN_ISS_NO_SIMPLES AS hasIssInSimples,
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_IN_ADMITE_BENEFICIO_MUNICIPAL AS allowsMunicipalBenefit
FROM
  ATIVIDADE_SIMPLES_NACIONAL
WHERE
  ${validOn("ATIVIDADE_SIMPLES_NACIONAL.ATSN_INICIO_VIGENCIA", "ATIVIDADE_SIMPLES_NACIONAL.ATSN_FIM_VIGENCIA")} AND
  EXISTS (
    SELECT 1
    FROM
      TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL
    JOIN
      TIPO_DFE ON TIPO_DFE.TPDF_ID = TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL.TDAS_TPDF_ID
    WHERE
      TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL.TDAS_ATSN_ID = ATIVIDADE_SIMPLES_NACIONAL.ATSN_ID AND
      TIPO_DFE.TPDF_TIPO = ?2 AND
      ${validOn("TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL.TDAS_INICIO_VIGENCIA", "TIPO_DFE_ATIVIDADE_SIMPLES_NACIONAL.TDAS_FIM_VIGENCIA")} AND
      ${validOn("TIPO_DFE.TPDF_INICIO_VIGENCIA", "TIPO_DFE.TPDF_FIM_VIGENCIA")}
  )
ORDER BY
  ATIVIDADE_SIMPLES_NACIONAL.ATSN_ORDEM;`;

async function listSimplesActivities(
  database: D1Database,
  input: { date: string; documentType: number },
) {
  const { date, documentType } = input;
  const { results } = await database
    .prepare(LIST_SIMPLES_ACTIVITIES_SQL)
    .bind(date, documentType)
    .all<SimplesActivityRow>();
  const activities = results.map((row) => {
    const activity: SimplesActivity = {
      activityCode: row.activityCode,
      description: row.description,
      annex: row.annex,
      isNonTaxable: row.isNonTaxable === 1,
      annexWithoutFatorR: row.annexWithoutFatorR,
      annexWithFatorR: row.annexWithFatorR,
      hasIssInSimples: row.hasIssInSimples === 1,
      allowsMunicipalBenefit: row.allowsMunicipalBenefit === 1,
    };
    return activity;
  });
  return activities;
}

export { listSimplesActivities };
