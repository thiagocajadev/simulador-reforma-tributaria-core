// Rate lookup over D1, the query the upstream AliquotaPadraoRepository runs: the tribute's
// reference rate valid on the date, joined to a standard rate for the same location, if any.
// CBS takes no location, IBS UF takes the UF and IBS Mun the municipality
// (CalculoTributoService.java:117-131).

import { buildValidOnClause } from "@/shared/data/validity.period.ts";
import type { ApplicationMethod, RateComponents } from "./rates.compose.ts";
import type { TaxName } from "./rates.dto.ts";

interface RateLookupInput {
  date: string;
  ufCode: number;
  municipalityCode: number;
}

interface TaxRateComponents extends RateComponents {
  tax: TaxName;
}

interface RateRow {
  referenceRate: number;
  standardRate: number | null;
  applicationMethod: ApplicationMethod | null;
}

const TAX_IDS: Record<TaxName, number> = { CBS: 2, IBS_UF: 3, IBS_MUN: 4 };
const TAX_ORDER: TaxName[] = ["CBS", "IBS_UF", "IBS_MUN"];

const FIND_RATE_SQL = `
SELECT
  ALIQUOTA_REFERENCIA.ALRE_VALOR AS referenceRate,
  ALIQUOTA_PADRAO.ALPA_VALOR AS standardRate,
  ALIQUOTA_PADRAO.ALPA_FORMA_APLICACAO AS applicationMethod
FROM
  ALIQUOTA_REFERENCIA
LEFT JOIN
  ALIQUOTA_PADRAO
  ON ALIQUOTA_PADRAO.ALPA_ALRE_ID = ALIQUOTA_REFERENCIA.ALRE_ID AND
     ALIQUOTA_PADRAO.ALPA_UF_CD IS ?2 AND
     ALIQUOTA_PADRAO.ALPA_MUNI_CD IS ?3 AND
     ${buildValidOnClause({
       startColumn: "ALIQUOTA_PADRAO.ALPA_INICIO_VIGENCIA",
       endColumn: "ALIQUOTA_PADRAO.ALPA_FIM_VIGENCIA",
       dateParameter: "?1",
     })}
WHERE
  ALIQUOTA_REFERENCIA.ALRE_TBTO_ID = ?4 AND
  ${buildValidOnClause({
    startColumn: "ALIQUOTA_REFERENCIA.ALRE_INICIO_VIGENCIA",
    endColumn: "ALIQUOTA_REFERENCIA.ALRE_FIM_VIGENCIA",
    dateParameter: "?1",
  })}
ORDER BY
  ALIQUOTA_REFERENCIA.ALRE_INICIO_VIGENCIA DESC,
  ALIQUOTA_PADRAO.ALPA_INICIO_VIGENCIA DESC
LIMIT 1;`;

async function findRateComponents(database: D1Database, input: RateLookupInput) {
  const statements = TAX_ORDER.map((tax) => prepareRateQuery(database, { tax, ...input }));
  const results = await database.batch<RateRow>(statements);
  const components = TAX_ORDER.flatMap((tax, position) => {
    const row = results[position]?.results.at(0);
    const found: TaxRateComponents[] = row ? [{ tax, ...row }] : [];
    return found;
  });
  return components;
}

function prepareRateQuery(database: D1Database, input: RateLookupInput & { tax: TaxName }) {
  const { tax, date, ufCode, municipalityCode } = input;
  const locationUf = tax === "IBS_UF" ? ufCode : null;
  const locationMunicipality = tax === "IBS_MUN" ? municipalityCode : null;
  const statement = database
    .prepare(FIND_RATE_SQL)
    .bind(date, locationUf, locationMunicipality, TAX_IDS[tax]);
  return statement;
}

export { findRateComponents };
