/// <reference types="vite/client" />

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "@/shared/math/decimal.ts";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import type {
  ItemResult,
  ItemTaxes,
  Operation,
  PublishedSelectiveTax,
  PublishedTax,
  SelectiveTaxResult,
  TaxResult,
} from "./calculation.dto.ts";
import {
  type CalculatedResponse,
  type ExpectedItem,
  type ObservedResponse,
  type PublishedItemTaxes,
  toExpectedItems,
  toExpectedTotals,
  toOperation,
  type UpstreamOperation,
} from "./calculation.fixture.ts";
import { parseFormula } from "./formula.evaluate.ts";
import { calculateOperation } from "./operation.calculate.ts";

interface FixtureManifest {
  cases: Record<string, { "regime-geral": number; observabilidade: number }>;
}

const FIXTURE_FILES = import.meta.glob<unknown>("/fixtures/regime-regular/*.json", {
  eager: true,
  import: "default",
});
const SUCCESS_STATUS = 200;
const MONEY = { minPlaces: 2, maxPlaces: 2 };
const PORTO_ALEGRE = { uf: "RS", municipalityCode: 4314902 };
const SAO_PAULO_CODE = 3550308;
// why: measured at 720 to 1,302 rows per item, 2026-11-21; the NBS annex index then took about 118 off each.
const MAX_ROWS_READ_PER_ITEM = 1_500;
// why: 200005 has the most NCM_APLICAVEL rows (121), so it is the costliest item measured.
const LARGEST_ANNEX_CLASSIFICATION = "200005";

const FORMULAS_SQL = `
SELECT
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_ALIQUOTA AS rate,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA AS effectiveRate,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_BASE_CALCULO AS base,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_TRIBUTO_CALCULADO AS calculatedTax,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_TRIBUTO_DEVIDO AS taxDue,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO AS deferralPercent,
  TRATAMENTO_TRIBUTARIO.TRTR_EXPRESSAO_VALOR_DIFERIMENTO AS deferralAmount
FROM
  TRATAMENTO_TRIBUTARIO;`;

function readFixture<Content>(name: string) {
  const content = FIXTURE_FILES[`/fixtures/regime-regular/${name}.json`];

  if (content === undefined) {
    throw new Error(`Missing fixture ${name}.json`);
  }

  const typedContent = content as Content;
  return typedContent;
}

function toComparableItem(result: ItemResult) {
  const { itemNumber, status } = result;

  if (result.status === "rejected") {
    const [violation] = result.violations;
    const rejected: ExpectedItem = {
      itemNumber,
      status,
      violation: { ruleCode: violation?.ruleCode ?? "", field: violation?.field ?? "" },
    };
    return rejected;
  }

  const taxes = "taxes" in result ? toPublishedTaxes(result.taxes) : undefined;
  const selectiveTax =
    "selectiveTax" in result ? toPublishedSelectiveTax(result.selectiveTax) : undefined;
  const comparable: ExpectedItem = { itemNumber, status, taxes, selectiveTax };
  return comparable;
}

function toPublishedTaxes(taxes: ItemTaxes | null) {
  if (!taxes) {
    return null;
  }

  const published: PublishedItemTaxes = {
    ...taxes,
    cbs: toPublishedTax(taxes.cbs),
    ibsUf: toPublishedTax(taxes.ibsUf),
    ibsMun: toPublishedTax(taxes.ibsMun),
  };
  return published;
}

function toPublishedSelectiveTax(selectiveTax: SelectiveTaxResult | null) {
  if (!selectiveTax) {
    return null;
  }

  const { treatmentDescription, rateSources, calculationSteps, ...published } = selectiveTax;
  const publishedSelectiveTax: PublishedSelectiveTax = published;
  return publishedSelectiveTax;
}

function toPublishedTax(tax: TaxResult) {
  const published: PublishedTax = {
    rate: tax.rate,
    reductionPercent: tax.reductionPercent,
    effectiveRate: tax.effectiveRate,
    amount: tax.amount,
  };
  return published;
}

function listCalculatedTaxes(result: ItemResult) {
  const taxes = "taxes" in result && result.taxes ? result.taxes : null;
  const listed = taxes ? [taxes.cbs, taxes.ibsUf, taxes.ibsMun] : [];
  return listed;
}

async function calculateResult(operation: Operation) {
  const outcome = await calculateOperation(env.OPEN_DATA, operation);

  if (outcome.kind !== "calculated") {
    throw new Error(`Expected a calculation, got ${JSON.stringify(outcome.issues)}`);
  }

  return outcome;
}

function buildOperation(item: Partial<Operation["items"][number]>) {
  const operation: Operation = {
    taxEventDate: "2026-03-10T10:00:00-03:00",
    ...PORTO_ALEGRE,
    items: [{ itemNumber: 1, cstCode: "000", cClassTrib: "000001", baseAmount: "100.00", ...item }],
  };
  return operation;
}

const manifest = readFixture<FixtureManifest>("manifest");
const caseNames = Object.keys(manifest.cases);

describe("calculateOperation against the regular regime golden fixtures", () => {
  beforeAll(seedOpenData);

  it.each(caseNames)("reproduces every item of %s", async (caseName) => {
    const operation = toOperation(readFixture<UpstreamOperation>(`${caseName}.input`));
    const calculated = readFixture<CalculatedResponse>(`${caseName}.output.regime-geral`);
    const observed = readFixture<ObservedResponse>(`${caseName}.output.observabilidade`);

    const expected = toExpectedItems({ calculated, observed });
    const outcome = await calculateResult(operation);
    const actual = outcome.result.items.map(toComparableItem);

    expect(actual).toStrictEqual(expected);
  });

  it.each(
    caseNames.filter((caseName) => manifest.cases[caseName]?.["regime-geral"] === SUCCESS_STATUS),
  )("reproduces the totals of %s", async (caseName) => {
    const operation = toOperation(readFixture<UpstreamOperation>(`${caseName}.input`));
    const calculated = readFixture<CalculatedResponse>(`${caseName}.output.regime-geral`);

    const expected = toExpectedTotals(calculated);
    const outcome = await calculateResult(operation);
    const actual = outcome.result.totals;

    expect(actual).toStrictEqual(expected);
  });

  it.each(caseNames)(
    "ends the steps of every tax of %s at its published amount",
    async (caseName) => {
      const operation = toOperation(readFixture<UpstreamOperation>(`${caseName}.input`));
      const outcome = await calculateResult(operation);
      const taxes = outcome.result.items.flatMap(listCalculatedTaxes);

      const expected = taxes.map((tax) => tax.amount);
      const actual = taxes.map((tax) => {
        const lastResult = tax.calculationSteps.at(-1)?.result ?? "missing";
        const amount = formatDecimal(parseDecimal(lastResult), MONEY);
        return amount;
      });

      expect(actual).toStrictEqual(expected);
    },
  );
});

describe("calculateOperation beyond the fixtures", () => {
  beforeAll(seedOpenData);

  it("parses every formula of TRATAMENTO_TRIBUTARIO", async () => {
    const { results } =
      await env.OPEN_DATA.prepare(FORMULAS_SQL).all<Record<string, string | null>>();
    const formulas = results.flatMap((row) =>
      Object.values(row).filter((formula): formula is string => Boolean(formula?.trim())),
    );

    const expectedUnparsed: string[] = [];
    const actualUnparsed = formulas.filter((formula) => {
      try {
        parseFormula(formula);
        return false;
      } catch {
        return true;
      }
    });

    expect(actualUnparsed).toStrictEqual(expectedUnparsed);
  });

  it("leaves a treatment with adjustment out as notImplemented", async () => {
    const operation = buildOperation({ cstCode: "620", cClassTrib: "620001" });

    const expected = [{ itemNumber: 1, status: "notImplemented", reason: "adjustment" }];
    const actual = (await calculateResult(operation)).result.items;

    expect(actual).toStrictEqual(expected);
  });

  it("calculates no values for a CST without the IBS/CBS group", async () => {
    const operation = buildOperation({ cstCode: "410", cClassTrib: "410001" });

    const expectedTaxes = null;
    const expectedStatus = "calculated";
    const [actual] = (await calculateResult(operation)).result.items;
    const actualTaxes = actual && "taxes" in actual ? actual.taxes : undefined;
    const actualStatus = actual?.status;

    expect(actualTaxes).toBe(expectedTaxes);
    expect(actualStatus).toBe(expectedStatus);
  });

  it("takes the reduction group from the classification's CST, not the item's", async () => {
    const operation = buildOperation({ cstCode: "000", cClassTrib: "200001" });

    const expected = {
      rate: "0.90",
      reductionPercent: "100.00",
      effectiveRate: "0.00",
      amount: "0.00",
    };
    const [actualItem] = (await calculateResult(operation)).result.items;
    const actualCbs = actualItem && "taxes" in actualItem ? actualItem.taxes?.cbs : undefined;
    const actual = actualCbs ? toPublishedTax(actualCbs) : undefined;

    expect(actual).toStrictEqual(expected);
  });

  it("refuses a municipality outside the state as an operation issue", async () => {
    const operation = { ...buildOperation({}), municipalityCode: SAO_PAULO_CODE };

    const expected = {
      kind: "invalid",
      issues: [
        { field: "municipalityCode", message: `Municipality ${SAO_PAULO_CODE} is not in RS.` },
      ],
    };
    const actual = await calculateOperation(env.OPEN_DATA, operation);

    expect(actual).toStrictEqual(expected);
  });

  it("reads a bounded number of D1 rows per item", async () => {
    const operation = toOperation(readFixture<UpstreamOperation>("multi-item-2026.input"));

    const expectedMaximum = MAX_ROWS_READ_PER_ITEM * operation.items.length;
    const actualRowsRead = (await calculateResult(operation)).rowsRead;

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });

  it("stays within the ceiling for one item of the largest NCM annex", async () => {
    const operation = buildOperation({
      cstCode: "200",
      cClassTrib: LARGEST_ANNEX_CLASSIFICATION,
      ncmCode: "07133319",
    });

    const expectedMaximum = MAX_ROWS_READ_PER_ITEM;
    const actualRowsRead = (await calculateResult(operation)).rowsRead;

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });
});
