// Derived FTS5 tables behind the search endpoints. Accent-insensitive (remove_diacritics 2),
// they hold only what the form can pick: full NCM (8 digits) and NBS (9 digits) codes,
// CBS/IBS classifications (not the Imposto Seletivo ones) and municipalities.
// SOURCE_ID is the key of the source row, and rowid is that key as an integer, so the API reaches
// a search row by code without scanning the FTS table.
// A full NCM or NBS code is often described only relative to its parent ("Outros"), so CONTEXT
// carries the ancestor descriptions, from the heading down, and both columns are searched.
// SEARCH_MUNICIPALITY also indexes the UF, so a search within one state never ranks the others.
// SEARCH_NCM.SELECTIVE_TAX lists, as JSON, every Imposto Seletivo rate row whose NCM prefix covers
// the code, with its value (null while the open data holds none), its validity and the exceptions
// over it, so a search tells whether the IS applies on a date, and at which official rate, without
// reading the rate tables (selective.tax.incidence.ts evaluates it).
// Text is stored clean: no inline HTML tags, no leading hierarchy dashes.

import type { DatabaseSync } from "node:sqlite";

const FTS_OPTIONS = "tokenize = 'unicode61 remove_diacritics 2'";
const CBS_IBS_TAX_IDS = "2, 3, 4";
const CONTEXT_SEPARATOR = " › ";
const INLINE_TAGS = ["<i>", "</i>", "<sub>", "</sub>", "<sup>", "</sup>"];
const HIERARCHY_DASHES = "- ";
const NCM_ANCESTOR_LENGTHS = [4, 5, 6, 7];
const NBS_ANCESTOR_LENGTHS = [5, 6, 7, 8];
const SELECTIVE_TAX_ID = 1;

const SELECTIVE_TAX_WINDOWS_SQL = `(
    SELECT json_group_array(json(WINDOW_JSON))
    FROM (
      SELECT json_object(
        'rate', 'adValorem',
        'value', CAST(ALIQUOTA_AD_VALOREM.AADV_VALOR AS TEXT),
        'prefixLength', length(ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD),
        'from', ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_INICIO_VIGENCIA,
        'to', ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_FIM_VIGENCIA,
        'exceptions', json((
          SELECT json_group_array(json_object('from', EAVP_INICIO_VIGENCIA, 'to', EAVP_FIM_VIGENCIA))
          FROM EXCECAO_AD_VALOREM_PRODUTO
          WHERE
            EAVP_AAVP_ID = ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_ID AND
            (
              EAVP_NCM_CD = substr(NCM.NCM_CD, 1, length(EAVP_NCM_CD)) OR
              EAVP_NCM_CD = substr(ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD, 1, length(EAVP_NCM_CD))
            )
        ))
      ) AS WINDOW_JSON
      FROM ALIQUOTA_AD_VALOREM_PRODUTO
      JOIN ALIQUOTA_AD_VALOREM ON ALIQUOTA_AD_VALOREM.AADV_ID = ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_AADV_ID
      WHERE
        ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD = substr(NCM.NCM_CD, 1, length(ALIQUOTA_AD_VALOREM_PRODUTO.AAVP_NCM_CD)) AND
        ALIQUOTA_AD_VALOREM.AADV_TBTO_ID = ${SELECTIVE_TAX_ID}
      UNION ALL
      SELECT json_object(
        'rate', 'adRem',
        'value', CAST(ALIQUOTA_AD_REM.AARE_VALOR AS TEXT),
        'prefixLength', length(ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD),
        'from', ALIQUOTA_AD_REM_PRODUTO.AARP_INICIO_VIGENCIA,
        'to', ALIQUOTA_AD_REM_PRODUTO.AARP_FIM_VIGENCIA,
        'unit', UNIDADE_MEDIDA.UNMD_SIGLA,
        'unitDescription', UNIDADE_MEDIDA.UNMD_DESCRICAO,
        'exceptions', json((
          SELECT json_group_array(json_object('from', EARP_INICIO_VIGENCIA, 'to', EARP_FIM_VIGENCIA))
          FROM EXCECAO_AD_REM_PRODUTO
          WHERE
            EARP_AARP_ID = ALIQUOTA_AD_REM_PRODUTO.AARP_ID AND
            (
              EARP_NCM_CD = substr(NCM.NCM_CD, 1, length(EARP_NCM_CD)) OR
              EARP_NCM_CD = substr(ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD, 1, length(EARP_NCM_CD))
            )
        ))
      ) AS WINDOW_JSON
      FROM ALIQUOTA_AD_REM_PRODUTO
      JOIN ALIQUOTA_AD_REM ON ALIQUOTA_AD_REM.AARE_ID = ALIQUOTA_AD_REM_PRODUTO.AARP_AARE_ID
      JOIN UNIDADE_MEDIDA ON UNIDADE_MEDIDA.UNMD_ID = ALIQUOTA_AD_REM.AARE_UNMD_ID
      WHERE
        ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD = substr(NCM.NCM_CD, 1, length(ALIQUOTA_AD_REM_PRODUTO.AARP_NCM_CD)) AND
        ALIQUOTA_AD_REM.AARE_TBTO_ID = ${SELECTIVE_TAX_ID}
    )
  )`;

const SEARCH_INDEX_STATEMENTS = [
  "DROP TABLE IF EXISTS SEARCH_NCM;",
  `CREATE VIRTUAL TABLE SEARCH_NCM USING fts5(SOURCE_ID UNINDEXED, DESCRIPTION, CONTEXT, SELECTIVE_TAX UNINDEXED, ${FTS_OPTIONS});`,
  `INSERT INTO SEARCH_NCM (rowid, SOURCE_ID, DESCRIPTION, CONTEXT, SELECTIVE_TAX)
SELECT
  CAST(NCM.NCM_CD AS INTEGER),
  NCM.NCM_CD,
  ${cleanTextSql("NCM.NCM_DESCRICAO")},
  coalesce(${ancestorContextSql({ table: "NCM", codeColumn: "NCM_CD", textColumn: "NCM_DESCRICAO", lengths: NCM_ANCESTOR_LENGTHS })}, ''),
  nullif(${SELECTIVE_TAX_WINDOWS_SQL}, '[]')
FROM
  NCM
WHERE
  length(NCM.NCM_CD) = 8;`,
  "DROP TABLE IF EXISTS SEARCH_NBS;",
  `CREATE VIRTUAL TABLE SEARCH_NBS USING fts5(SOURCE_ID UNINDEXED, DESCRIPTION, CONTEXT, ${FTS_OPTIONS});`,
  `INSERT INTO SEARCH_NBS (rowid, SOURCE_ID, DESCRIPTION, CONTEXT)
SELECT
  CAST(NBS.NBS_CD AS INTEGER),
  NBS.NBS_CD,
  ${cleanTextSql("NBS.NBS_DESCRICAO")},
  coalesce(${ancestorContextSql({ table: "NBS", codeColumn: "NBS_CD", textColumn: "NBS_DESCRICAO", lengths: NBS_ANCESTOR_LENGTHS })}, '')
FROM
  NBS
WHERE
  length(NBS.NBS_CD) = 9;`,
  "DROP TABLE IF EXISTS SEARCH_CLASSIFICATION;",
  `CREATE VIRTUAL TABLE SEARCH_CLASSIFICATION USING fts5(SOURCE_ID UNINDEXED, DESCRIPTION, ${FTS_OPTIONS});`,
  `INSERT INTO SEARCH_CLASSIFICATION (rowid, SOURCE_ID, DESCRIPTION)
SELECT
  CLASSIFICACAO_TRIBUTARIA.CLTR_ID,
  CLASSIFICACAO_TRIBUTARIA.CLTR_ID,
  ${cleanTextSql("CLASSIFICACAO_TRIBUTARIA.CLTR_DESCRICAO")}
FROM
  CLASSIFICACAO_TRIBUTARIA
WHERE
  EXISTS (
    SELECT 1
    FROM TRIBUTO_SITUACAO_TRIBUTARIA
    WHERE
      TRIBUTO_SITUACAO_TRIBUTARIA.TRST_SITR_ID = CLASSIFICACAO_TRIBUTARIA.CLTR_SITR_ID AND
      TRIBUTO_SITUACAO_TRIBUTARIA.TRST_TBTO_ID IN (${CBS_IBS_TAX_IDS})
  );`,
  "DROP TABLE IF EXISTS SEARCH_MUNICIPALITY;",
  `CREATE VIRTUAL TABLE SEARCH_MUNICIPALITY USING fts5(SOURCE_ID UNINDEXED, DESCRIPTION, UF, ${FTS_OPTIONS});`,
  `INSERT INTO SEARCH_MUNICIPALITY (rowid, SOURCE_ID, DESCRIPTION, UF)
SELECT
  MUNICIPIO.MUNI_CD,
  MUNICIPIO.MUNI_CD,
  MUNICIPIO.MUNI_NOME,
  UF.UF_SIGLA
FROM
  MUNICIPIO
JOIN
  UF ON UF.UF_CD = MUNICIPIO.MUNI_UF_CD;`,
];

function buildSearchIndex(database: DatabaseSync) {
  database.exec("BEGIN");

  try {
    database.exec(SEARCH_INDEX_STATEMENTS.join("\n"));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function cleanTextSql(column: string) {
  const withoutTags = INLINE_TAGS.reduce(
    (expression, tag) => `replace(${expression}, '${tag}', '')`,
    column,
  );
  const cleanExpression = `trim(ltrim(${withoutTags}, '${HIERARCHY_DASHES}'))`;
  return cleanExpression;
}

function ancestorContextSql(input: {
  table: string;
  codeColumn: string;
  textColumn: string;
  lengths: number[];
}) {
  const { table, codeColumn, textColumn, lengths } = input;
  const prefixes = lengths
    .map((length) => `substr(${table}.${codeColumn}, 1, ${length})`)
    .join(", ");
  const contextExpression = `(
    SELECT group_concat(ANCESTOR_TEXT, '${CONTEXT_SEPARATOR}')
    FROM (
      SELECT ${cleanTextSql(`ANCESTOR.${textColumn}`)} AS ANCESTOR_TEXT
      FROM ${table} AS ANCESTOR
      WHERE ANCESTOR.${codeColumn} IN (${prefixes})
      ORDER BY length(ANCESTOR.${codeColumn})
    )
  )`;
  return contextExpression;
}

export { buildSearchIndex, SEARCH_INDEX_STATEMENTS };
