// Operation indicators and LC 116 items for one NBS and cClassTrib, valid on the reference date.
// The query reaches CLASSIF_NBS_INDOP_LC through its index on the NBS code (docs/open-data.md,
// Lean D1) and joins the other tables by primary key. Five upstream rows repeat a mapping, hence
// the DISTINCT.

import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { OperationIndicator, ServiceItem } from "./operation-indicators.dto.ts";

interface OperationIndicatorsInput {
  nbsCode: string;
  cClassTrib: string;
  date: string;
}

interface OperationIndicatorRow {
  lc116Code: string;
  lc116Description: string;
  indicatorCode: string;
  incidencePlace: string;
  operationType: string;
}

interface OperationIndicatorsOutcome {
  serviceItems: ServiceItem[];
  rowsRead: number;
}

const LC_116_CODE_PATTERN = /^(\d{1,2})\.(\d{2})$/;

// why: the national code adds a 2-digit breakdown to the LC 116 subitem; its table is not in the
// open data, so every subitem takes its first breakdown, as the DANFSe sample does (080101).
const NATIONAL_BREAKDOWN = "01";

const MAPPING_VALID_ON = buildValidOnClause({
  startColumn: "CLASSIF_NBS_INDOP_LC.CNIL_INICIO_VIGENCIA",
  endColumn: "CLASSIF_NBS_INDOP_LC.CNIL_FIM_VIGENCIA",
  dateParameter: "?1",
});

const INDICATOR_VALID_ON = buildValidOnClause({
  startColumn: "INDICADOR_OPERACAO_IBS_CBS.IOIC_INICIO_VIGENCIA",
  endColumn: "INDICADOR_OPERACAO_IBS_CBS.IOIC_FIM_VIGENCIA",
  dateParameter: "?1",
});

const SERVICE_LIST_VALID_ON = buildValidOnClause({
  startColumn: "LISTA_SERVICOS_LC_116.LSLC_INICIO_VIGENCIA",
  endColumn: "LISTA_SERVICOS_LC_116.LSLC_FIM_VIGENCIA",
  dateParameter: "?1",
});

const FIND_OPERATION_INDICATORS_SQL = `
SELECT DISTINCT
  LISTA_SERVICOS_LC_116.LSLC_CD AS lc116Code,
  LISTA_SERVICOS_LC_116.LSLC_DESCRICAO AS lc116Description,
  INDICADOR_OPERACAO_IBS_CBS.IOIC_CD AS indicatorCode,
  INDICADOR_OPERACAO_IBS_CBS.IOIC_LOCAL_INCIDENCIA AS incidencePlace,
  INDICADOR_OPERACAO_IBS_CBS.IOIC_TIPO_OPERACAO AS operationType
FROM
  CLASSIF_NBS_INDOP_LC
JOIN
  CLASSIFICACAO_TRIBUTARIA ON CLASSIFICACAO_TRIBUTARIA.CLTR_ID = CLASSIF_NBS_INDOP_LC.CNIL_CLTR_ID
JOIN
  INDICADOR_OPERACAO_IBS_CBS ON INDICADOR_OPERACAO_IBS_CBS.IOIC_ID = CLASSIF_NBS_INDOP_LC.CNIL_IOIC_ID
JOIN
  LISTA_SERVICOS_LC_116 ON LISTA_SERVICOS_LC_116.LSLC_CD = CLASSIF_NBS_INDOP_LC.CNIL_LSLC_CD
WHERE
  CLASSIF_NBS_INDOP_LC.CNIL_NBS_CD = ?2 AND
  CLASSIFICACAO_TRIBUTARIA.CLTR_CD = ?3 AND
  ${MAPPING_VALID_ON} AND
  ${INDICATOR_VALID_ON} AND
  ${SERVICE_LIST_VALID_ON}
ORDER BY
  LISTA_SERVICOS_LC_116.LSLC_CD,
  INDICADOR_OPERACAO_IBS_CBS.IOIC_CD;`;

async function findOperationIndicators(database: D1Database, input: OperationIndicatorsInput) {
  const { nbsCode, cClassTrib, date } = input;
  const { results, meta } = await database
    .prepare(FIND_OPERATION_INDICATORS_SQL)
    .bind(date, nbsCode, cClassTrib)
    .all<OperationIndicatorRow>();
  const outcome: OperationIndicatorsOutcome = {
    serviceItems: groupByServiceItem(results),
    rowsRead: meta.rows_read,
  };
  return outcome;
}

function groupByServiceItem(rows: OperationIndicatorRow[]) {
  const serviceItemsByCode = new Map<string, ServiceItem>();

  for (const row of rows) {
    const serviceItem = serviceItemsByCode.get(row.lc116Code) ?? toServiceItem(row);
    const indicator: OperationIndicator = {
      indicatorCode: row.indicatorCode,
      incidencePlace: row.incidencePlace,
      operationType: row.operationType,
    };

    serviceItem.indicators.push(indicator);
    serviceItemsByCode.set(row.lc116Code, serviceItem);
  }

  const serviceItems = [...serviceItemsByCode.values()];
  return serviceItems;
}

function toServiceItem(row: OperationIndicatorRow) {
  const serviceItem: ServiceItem = {
    lc116Code: row.lc116Code,
    nationalTaxCode: deriveNationalTaxCode(row.lc116Code),
    description: row.lc116Description,
    indicators: [],
  };
  return serviceItem;
}

function deriveNationalTaxCode(lc116Code: string) {
  const match = LC_116_CODE_PATTERN.exec(lc116Code);

  if (!match) {
    throw new Error(`LC 116 code must look like "8.01", got "${lc116Code}".`);
  }

  const [, itemNumber = "", subitemNumber = ""] = match;
  const nationalTaxCode = `${itemNumber.padStart(2, "0")}${subitemNumber}${NATIONAL_BREAKDOWN}`;
  return nationalTaxCode;
}

export { findOperationIndicators };
