// The Imposto Seletivo rate row that applies to a full NCM on a date, as
// AliquotaAdValoremProdutoRepository and AliquotaAdRemProdutoRepository find it: tribute 1, an NCM
// prefix valid on the date with no valid exception over the code or the prefix, the longest
// prefix first. Shared by the calculation and the NCM search; callers add the SELECT list.
// The prefix test is upstream's SUBSTRING(:ncm, 1, LENGTH(code)) written as an IN list, so D1
// reaches the rows through the idx_aliquota_ad_*_produto_ncm_cd indexes; CROSS JOIN keeps the
// product table first, since SQLite has no statistics to prefer it over the small rate tables.

import { buildValidOnClause } from "./validity.period.ts";

interface SelectiveTaxMatchInput {
  ncmExpression: string;
  dateParameter: string;
}

const SELECTIVE_TAX_ID = 1;
const NCM_PREFIX_LENGTHS = [2, 3, 4, 5, 6, 7, 8];

function buildAdValoremMatchSql(input: SelectiveTaxMatchInput) {
  const { ncmExpression, dateParameter } = input;
  const validOn = (startColumn: string, endColumn: string) =>
    buildValidOnClause({ startColumn, endColumn, dateParameter });
  const sql = `
FROM
  ALIQUOTA_AD_VALOREM_PRODUTO
CROSS JOIN
  ALIQUOTA_AD_VALOREM ON ALIQUOTA_AD_VALOREM.AADV_ID = ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_AADV_ID
WHERE
  ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD IN (${listNcmPrefixes(ncmExpression)}) AND
  ALIQUOTA_AD_VALOREM.AADV_TBTO_ID = ${SELECTIVE_TAX_ID} AND
  ${validOn("ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_INICIO_VIGENCIA", "ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_FIM_VIGENCIA")} AND
  NOT EXISTS (
    SELECT 1
    FROM EXCECAO_AD_VALOREM_PRODUTO
    WHERE
      EXCECAO_AD_VALOREM_PRODUTO.EAVP_AAVP_ID = ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_ID AND
      (
        EXCECAO_AD_VALOREM_PRODUTO.EAVP_NCM_CD = SUBSTR(${ncmExpression}, 1, LENGTH(EXCECAO_AD_VALOREM_PRODUTO.EAVP_NCM_CD)) OR
        EXCECAO_AD_VALOREM_PRODUTO.EAVP_NCM_CD = SUBSTR(ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD, 1, LENGTH(EXCECAO_AD_VALOREM_PRODUTO.EAVP_NCM_CD))
      ) AND
      ${validOn("EXCECAO_AD_VALOREM_PRODUTO.EAVP_INICIO_VIGENCIA", "EXCECAO_AD_VALOREM_PRODUTO.EAVP_FIM_VIGENCIA")}
  )
ORDER BY
  LENGTH(ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD) DESC
LIMIT 1`;
  return sql;
}

function buildAdRemMatchSql(input: SelectiveTaxMatchInput) {
  const { ncmExpression, dateParameter } = input;
  const validOn = (startColumn: string, endColumn: string) =>
    buildValidOnClause({ startColumn, endColumn, dateParameter });
  const sql = `
FROM
  ALIQUOTA_AD_REM_PRODUTO
CROSS JOIN
  ALIQUOTA_AD_REM ON ALIQUOTA_AD_REM.AARE_ID = ALIQUOTA_AD_REM_PRODUTO.AARP_AARE_ID
CROSS JOIN
  UNIDADE_MEDIDA ON UNIDADE_MEDIDA.UNMD_ID = ALIQUOTA_AD_REM.AARE_UNMD_ID
WHERE
  ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD IN (${listNcmPrefixes(ncmExpression)}) AND
  ALIQUOTA_AD_REM.AARE_TBTO_ID = ${SELECTIVE_TAX_ID} AND
  ${validOn("ALIQUOTA_AD_REM_PRODUTO.AARP_INICIO_VIGENCIA", "ALIQUOTA_AD_REM_PRODUTO.AARP_FIM_VIGENCIA")} AND
  NOT EXISTS (
    SELECT 1
    FROM EXCECAO_AD_REM_PRODUTO
    WHERE
      EXCECAO_AD_REM_PRODUTO.EARP_AARP_ID = ALIQUOTA_AD_REM_PRODUTO.AARP_ID AND
      (
        EXCECAO_AD_REM_PRODUTO.EARP_NCM_CD = SUBSTR(${ncmExpression}, 1, LENGTH(EXCECAO_AD_REM_PRODUTO.EARP_NCM_CD)) OR
        EXCECAO_AD_REM_PRODUTO.EARP_NCM_CD = SUBSTR(ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD, 1, LENGTH(EXCECAO_AD_REM_PRODUTO.EARP_NCM_CD))
      ) AND
      ${validOn("EXCECAO_AD_REM_PRODUTO.EARP_INICIO_VIGENCIA", "EXCECAO_AD_REM_PRODUTO.EARP_FIM_VIGENCIA")}
  )
ORDER BY
  LENGTH(ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD) DESC
LIMIT 1`;
  return sql;
}

function listNcmPrefixes(ncmExpression: string) {
  const prefixes = NCM_PREFIX_LENGTHS.map((length) => `SUBSTR(${ncmExpression}, 1, ${length})`);
  const prefixList = prefixes.join(", ");
  return prefixList;
}

export { buildAdRemMatchSql, buildAdValoremMatchSql, SELECTIVE_TAX_ID };
