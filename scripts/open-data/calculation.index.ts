// The secondary indexes the D1 dump carries: one per table that a calculation, or the indicators
// lookup that follows an NFS-e calculation, was measured to scan by a column that is not its key
// (docs/open-data.md, Lean D1). They exist only in the dump; the local database keeps the upstream
// indexes, so it stays identical to the one Flyway builds.
// idx_ncm_aplicavel_cltr_id, idx_nbs_aplicavel_cltr_id, idx_classif_nbs_indop_lc_nbs_cd and the two
// Imposto Seletivo idx_aliquota_ad_*_produto_ncm_cd are upstream indexes, same name and column. The
// other four have no upstream counterpart and follow the upstream naming.

interface CalculationIndex {
  name: string;
  table: string;
  column: string;
}

const CALCULATION_INDEXES: CalculationIndex[] = [
  { name: "idx_ncm_aplicavel_cltr_id", table: "NCM_APLICAVEL", column: "NCMA_CLTR_ID" },
  { name: "idx_percentual_reducao_cltr_id", table: "PERCENTUAL_REDUCAO", column: "PERE_CLTR_ID" },
  {
    name: "idx_tipo_dfe_classificacao_cltr_id",
    table: "TIPO_DFE_CLASSIFICACAO",
    column: "TDCL_CLTR_ID",
  },
  { name: "idx_classificacao_tributaria_cd", table: "CLASSIFICACAO_TRIBUTARIA", column: "CLTR_CD" },
  {
    name: "idx_tratamento_classificacao_cltr_id",
    table: "TRATAMENTO_CLASSIFICACAO",
    column: "TRCL_CLTR_ID",
  },
  { name: "idx_classif_nbs_indop_lc_nbs_cd", table: "CLASSIF_NBS_INDOP_LC", column: "CNIL_NBS_CD" },
  { name: "idx_nbs_aplicavel_cltr_id", table: "NBS_APLICAVEL", column: "NBSA_CLTR_ID" },
  {
    name: "idx_aliquota_ad_valorem_produto_ncm_cd",
    table: "ALIQUOTA_AD_VALOREM_PRODUTO",
    column: "AAVP_NCM_CD",
  },
  {
    name: "idx_aliquota_ad_rem_produto_ncm_cd",
    table: "ALIQUOTA_AD_REM_PRODUTO",
    column: "AARP_NCM_CD",
  },
];

const CALCULATION_INDEX_NAMES = CALCULATION_INDEXES.map(
  (calculationIndex) => calculationIndex.name,
);

const CALCULATION_INDEX_STATEMENTS = CALCULATION_INDEXES.map(
  ({ name, table, column }) => `CREATE INDEX ${name} ON ${table}(${column});`,
);

export { CALCULATION_INDEX_NAMES, CALCULATION_INDEX_STATEMENTS };
