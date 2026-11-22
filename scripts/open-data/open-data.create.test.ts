import fileSystem from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createD1Dump } from "./d1.dump.ts";
import { type DatabaseFingerprint, fingerprintDatabase } from "./database.fingerprint.ts";
import { createOpenDatabase } from "./open-data.create.ts";
import { FLYWAY_SQL_DIRECTORY, PARITY_FIXTURE_PATH } from "./open-data.paths.ts";

const IN_MEMORY = ":memory:";
const PRIMARY_KEY_INDEX_PREFIX = "sqlite_autoindex_";
// why: in name order, as the fingerprint lists them; "idx_" sorts before "sqlite_autoindex_".
const CALCULATION_INDEXES = [
  "idx_aliquota_ad_rem_produto_ncm_cd",
  "idx_aliquota_ad_valorem_produto_ncm_cd",
  "idx_classif_nbs_indop_lc_nbs_cd",
  "idx_classificacao_tributaria_cd",
  "idx_nbs_aplicavel_cltr_id",
  "idx_ncm_aplicavel_cltr_id",
  "idx_percentual_reducao_cltr_id",
  "idx_tipo_dfe_classificacao_cltr_id",
  "idx_tratamento_classificacao_cltr_id",
];
// why: these five calculation indexes also exist upstream, same name and column.
const UPSTREAM_INDEXES_KEPT = 5;
// why: the dump quotes the table of a row insert; the search table inserts are unquoted.
const ROW_INSERT_PREFIX = 'INSERT INTO "';

// why: every test only reads the database Flyway builds, and building it costs about half a second;
// one build per file keeps the suite under the 5 s test timeout when all projects run at once.
let openDatabase: DatabaseSync | null = null;

function readOpenDatabase() {
  openDatabase ??= createOpenDatabase({ sqlDirectory: FLYWAY_SQL_DIRECTORY, location: IN_MEMORY });
  return openDatabase;
}

function readParityFixture() {
  const fixture = JSON.parse(
    fileSystem.readFileSync(PARITY_FIXTURE_PATH, "utf8"),
  ) as DatabaseFingerprint;
  return fixture;
}

function countRows(database: DatabaseSync, tableName: string) {
  const rowCount = Number(
    database.prepare(`SELECT count(*) AS total FROM ${tableName}`).get()?.total,
  );
  return rowCount;
}

describe("createOpenDatabase", () => {
  it("matches the database Flyway built, table by table and row by row", () => {
    const database = readOpenDatabase();

    const expected = readParityFixture();
    const actual = fingerprintDatabase(database);

    expect(actual).toStrictEqual(expected);
  });

  it("indexes only full NCM and NBS codes and the CBS/IBS classifications", () => {
    const database = readOpenDatabase();

    const expectedCounts = { ncm: 10521, nbs: 920, classifications: 173, municipalities: 5573 };
    const actualCounts = {
      ncm: countRows(database, "SEARCH_NCM"),
      nbs: countRows(database, "SEARCH_NBS"),
      classifications: countRows(database, "SEARCH_CLASSIFICATION"),
      municipalities: countRows(database, "SEARCH_MUNICIPALITY"),
    };

    expect(actualCounts).toStrictEqual(expectedCounts);
  });

  it("carries the Imposto Seletivo windows on the NCM codes the IS rate rows cover", () => {
    const database = readOpenDatabase();
    const countQuery = "SELECT count(*) AS count FROM SEARCH_NCM WHERE SELECTIVE_TAX IS NOT NULL";
    const windowsQuery = "SELECT SELECTIVE_TAX AS windows FROM SEARCH_NCM WHERE rowid = ?";

    const expectedCount = 99;
    const expectedRates = ["adValorem", "adRem"];
    const actualCount = database.prepare(countQuery).get()?.count;
    const actualWindows = String(database.prepare(windowsQuery).get(24021000)?.windows);
    const actualRates = [
      ...new Set((JSON.parse(actualWindows) as { rate: string }[]).map((window) => window.rate)),
    ];
    const actualWithout = database.prepare(windowsQuery).get(84713012)?.windows;

    expect(actualCount).toBe(expectedCount);
    expect(actualRates).toStrictEqual(expectedRates);
    expect(actualWithout).toBeNull();
  });

  it("finds a full NCM code through its parent description, without accents or markup", () => {
    const database = readOpenDatabase();
    const query = "SELECT CONTEXT FROM SEARCH_NCM WHERE SEARCH_NCM MATCH ? AND SOURCE_ID = ?";

    const expectedContext =
      "Legumes de vagem, secos, em grão, mesmo pelados ou partidos. › Feijões (Vigna spp., Phaseolus spp.): › Feijão comum (Phaseolus vulgaris) › Preto";
    const actual = database.prepare(query).get("feijao comum preto", "07133319");
    const actualContext = actual?.CONTEXT;

    expect(actualContext).toBe(expectedContext);
  });
});

describe("createD1Dump", () => {
  it("loads back into an empty database with the same tables, rows and search index, and only the calculation indexes", () => {
    const source = readOpenDatabase();
    const dump = createD1Dump(source);
    const target = new DatabaseSync(IN_MEMORY, { enableForeignKeyConstraints: true });

    target.exec(`BEGIN;\n${dump.sql}\nCOMMIT;`);

    const parity = readParityFixture();
    const expectedTables = parity.tables;
    const primaryKeyIndexes = parity.indexes.filter((name) =>
      name.startsWith(PRIMARY_KEY_INDEX_PREFIX),
    );
    const expectedIndexes = [...CALCULATION_INDEXES, ...primaryKeyIndexes];
    const expectedOmittedCount =
      parity.indexes.length - primaryKeyIndexes.length - UPSTREAM_INDEXES_KEPT;
    const expectedSearchRows = countRows(source, "SEARCH_NCM");
    const actual = fingerprintDatabase(target);
    const actualOmittedCount = dump.omittedIndexes.length;
    const actualSearchRows = countRows(target, "SEARCH_NCM");

    expect(actual.tables).toStrictEqual(expectedTables);
    expect(actual.indexes).toStrictEqual(expectedIndexes);
    expect(actualOmittedCount).toBe(expectedOmittedCount);
    expect(actualSearchRows).toBe(expectedSearchRows);
  });

  it("creates each calculation index on the column its queries filter by, after the rows", () => {
    const source = readOpenDatabase();
    const { statements } = createD1Dump(source);
    const isIndexStatement = (statement: string) => statement.startsWith("CREATE INDEX");
    const isRowInsert = (statement: string) => statement.startsWith(ROW_INSERT_PREFIX);

    const expectedStatements = [
      "CREATE INDEX idx_ncm_aplicavel_cltr_id ON NCM_APLICAVEL(NCMA_CLTR_ID);",
      "CREATE INDEX idx_percentual_reducao_cltr_id ON PERCENTUAL_REDUCAO(PERE_CLTR_ID);",
      "CREATE INDEX idx_tipo_dfe_classificacao_cltr_id ON TIPO_DFE_CLASSIFICACAO(TDCL_CLTR_ID);",
      "CREATE INDEX idx_classificacao_tributaria_cd ON CLASSIFICACAO_TRIBUTARIA(CLTR_CD);",
      "CREATE INDEX idx_tratamento_classificacao_cltr_id ON TRATAMENTO_CLASSIFICACAO(TRCL_CLTR_ID);",
      "CREATE INDEX idx_classif_nbs_indop_lc_nbs_cd ON CLASSIF_NBS_INDOP_LC(CNIL_NBS_CD);",
      "CREATE INDEX idx_nbs_aplicavel_cltr_id ON NBS_APLICAVEL(NBSA_CLTR_ID);",
      "CREATE INDEX idx_aliquota_ad_valorem_produto_ncm_cd ON ALIQUOTA_AD_VALOREM_PRODUTO(AAVP_NCM_CD);",
      "CREATE INDEX idx_aliquota_ad_rem_produto_ncm_cd ON ALIQUOTA_AD_REM_PRODUTO(AARP_NCM_CD);",
    ];
    const expectedIsAfterRows = true;
    const actualStatements = statements.filter(isIndexStatement);
    const actualIsAfterRows =
      statements.findIndex(isIndexStatement) > statements.findLastIndex(isRowInsert);

    expect(actualStatements).toStrictEqual(expectedStatements);
    expect(actualIsAfterRows).toBe(expectedIsAfterRows);
  });

  it("keeps out what D1 rejects: transactions and every PRAGMA but defer_foreign_keys", () => {
    const source = readOpenDatabase();
    const forbiddenStatement = /^\s*(BEGIN|COMMIT|ROLLBACK|PRAGMA (?!defer_foreign_keys))/im;

    const expectedFirstLine = "PRAGMA defer_foreign_keys = TRUE;";
    const actual = createD1Dump(source).sql;
    const actualFirstLine = actual.split("\n").at(0);
    const actualAfterFirstLine = actual.slice(expectedFirstLine.length);

    expect(actualFirstLine).toBe(expectedFirstLine);
    expect(actualAfterFirstLine).not.toMatch(forbiddenStatement);
  });

  it("loads one statement at a time with foreign keys enforced, as a chunked D1 import does", () => {
    const source = readOpenDatabase();
    const dump = createD1Dump(source);
    const target = new DatabaseSync(IN_MEMORY, { enableForeignKeyConstraints: true });
    target.exec(dump.sql);

    target.exec(dump.sql);

    const expectedTables = readParityFixture().tables;
    const actual = fingerprintDatabase(target);
    const actualTables = actual.tables;

    expect(actualTables).toStrictEqual(expectedTables);
  });

  it("can be loaded twice, replacing the data instead of failing", () => {
    const source = readOpenDatabase();
    const dump = createD1Dump(source);
    const target = new DatabaseSync(IN_MEMORY, { enableForeignKeyConstraints: true });
    target.exec(`BEGIN;\n${dump.sql}\nCOMMIT;`);

    target.exec(`BEGIN;\n${dump.sql}\nCOMMIT;`);

    const expected = countRows(source, "NCM");
    const actual = countRows(target, "NCM");

    expect(actual).toBe(expected);
  });
});
