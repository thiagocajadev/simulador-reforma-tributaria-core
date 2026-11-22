// CBS/IBS tax situations (CST) valid on the reference date. CST 000, 200 and 400 also exist as
// Imposto Seletivo-only rows, so a situation qualifies through its CBS/IBS tribute links.

import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { CstEntry } from "./cst.dto.ts";

const CBS_IBS_TAX_IDS = "2, 3, 4";

const LIST_CST_SQL = `
SELECT
  SITUACAO_TRIBUTARIA.SITR_CD AS cstCode,
  SITUACAO_TRIBUTARIA.SITR_DESCRICAO AS description
FROM
  SITUACAO_TRIBUTARIA
WHERE
  EXISTS (
    SELECT 1
    FROM TRIBUTO_SITUACAO_TRIBUTARIA
    WHERE
      TRIBUTO_SITUACAO_TRIBUTARIA.TRST_SITR_ID = SITUACAO_TRIBUTARIA.SITR_ID AND
      TRIBUTO_SITUACAO_TRIBUTARIA.TRST_TBTO_ID IN (${CBS_IBS_TAX_IDS})
  ) AND
  ${buildValidOnClause({
    startColumn: "SITUACAO_TRIBUTARIA.SITR_INICIO_VIGENCIA",
    endColumn: "SITUACAO_TRIBUTARIA.SITR_FIM_VIGENCIA",
    dateParameter: "?1",
  })}
ORDER BY
  SITUACAO_TRIBUTARIA.SITR_CD;`;

async function listCst(database: D1Database, date: string) {
  const { results } = await database.prepare(LIST_CST_SQL).bind(date).all<CstEntry>();
  return results;
}

export { listCst };
