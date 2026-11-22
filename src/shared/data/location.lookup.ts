// UF and municipality lookups by primary key or by the 28-row UF table, shared by the routes that
// take a location: municipality search and rate lookup.

const FIND_UF_CODE_SQL = "SELECT UF.UF_CD AS ufCode FROM UF WHERE UF.UF_SIGLA = ?1;";

const FIND_MUNICIPALITY_SQL = `
SELECT
  MUNICIPIO.MUNI_CD AS municipalityCode,
  MUNICIPIO.MUNI_UF_CD AS ufCode
FROM
  MUNICIPIO
WHERE
  MUNICIPIO.MUNI_CD = ?1;`;

interface MunicipalityLocation {
  municipalityCode: number;
  ufCode: number;
}

async function findUfCode(database: D1Database, uf: string) {
  const ufCode = await database.prepare(FIND_UF_CODE_SQL).bind(uf).first<number>("ufCode");
  return ufCode;
}

async function findMunicipality(database: D1Database, municipalityCode: number) {
  const municipality = await database
    .prepare(FIND_MUNICIPALITY_SQL)
    .bind(municipalityCode)
    .first<MunicipalityLocation>();
  return municipality;
}

export type { MunicipalityLocation };
export { findMunicipality, findUfCode };
