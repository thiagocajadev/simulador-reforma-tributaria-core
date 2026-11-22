/// <reference types="vite/client" />

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { seedOpenData } from "@/shared/testing/open-data.seed.ts";
import { calculateSimplesOperation } from "./operation.simples.ts";
import type { SimplesCalculationRequest } from "./simples.dto.ts";
import {
  type SimplesFixtureResponse,
  toComparableItem,
  toExpectedIssues,
  toExpectedItems,
  toExpectedTotals,
  toNfseSimplesOperation,
  toStepEndings,
  type UpstreamNfseOperation,
} from "./simples.fixture.ts";

interface FixtureManifest {
  cases: Record<string, { "nao-assistido": number }>;
}

const FIXTURE_FILES = import.meta.glob<unknown>("/fixtures/simples-nacional-nfse/*.json", {
  eager: true,
  import: "default",
});
const SUCCESS_STATUS = 200;
const ISSUE_CODE = /^(VSN-\d{3}):/;
// why: measured at 555 to 562 rows for the one NFS-e item with the calculation indexes, 2026-11-21.
const MAX_ROWS_READ_PER_NFSE_ITEM = 800;

function readFixture<Content>(name: string) {
  const content = FIXTURE_FILES[`/fixtures/simples-nacional-nfse/${name}.json`];

  if (content === undefined) {
    throw new Error(`Missing fixture ${name}.json`);
  }

  const typedContent = content as Content;
  return typedContent;
}

function readCase(caseName: string) {
  const operation = toNfseSimplesOperation(readFixture<UpstreamNfseOperation>(`${caseName}.input`));
  const response = readFixture<SimplesFixtureResponse>(`${caseName}.output.nao-assistido`);
  const fixtureCase = { operation, response };
  return fixtureCase;
}

async function calculateResult(operation: SimplesCalculationRequest) {
  const outcome = await calculateSimplesOperation(env.OPEN_DATA, operation);

  if (outcome.kind !== "calculated") {
    throw new Error(`Expected a calculation, got ${JSON.stringify(outcome.issues)}`);
  }

  return outcome;
}

const manifest = readFixture<FixtureManifest>("manifest");
const caseNames = Object.keys(manifest.cases);
const calculatedCases = caseNames.filter(
  (caseName) => manifest.cases[caseName]?.["nao-assistido"] === SUCCESS_STATUS,
);
const rejectedCases = caseNames.filter((caseName) => !calculatedCases.includes(caseName));

describe("calculateSimplesOperation against the Simples Nacional NFS-e golden fixtures", () => {
  beforeAll(seedOpenData);

  it.each(calculatedCases)("reproduces every item of %s", async (caseName) => {
    const { operation, response } = readCase(caseName);

    const expected = toExpectedItems(response);
    const outcome = await calculateResult(operation);
    const actual = outcome.result.items.map(toComparableItem);

    expect(actual).toStrictEqual(expected);
  });

  it.each(calculatedCases)("ends the steps of every tax of %s at its amount", async (caseName) => {
    const { operation } = readCase(caseName);
    const outcome = await calculateResult(operation);
    const endings = outcome.result.items.flatMap(toStepEndings);

    const expected = endings.map((ending) => ending.amount);
    const actual = endings.map((ending) => ending.stepResult);

    expect(actual).toStrictEqual(expected);
  });

  it.each(calculatedCases)("reproduces the totals of %s", async (caseName) => {
    const { operation, response } = readCase(caseName);

    const expected = toExpectedTotals(response);
    const outcome = await calculateResult(operation);
    const actual = outcome.result.totals;

    expect(actual).toStrictEqual(expected);
  });

  it.each(calculatedCases)("reads a bounded number of D1 rows for %s", async (caseName) => {
    const { operation } = readCase(caseName);

    const expectedMaximum = MAX_ROWS_READ_PER_NFSE_ITEM * operation.items.length;
    const outcome = await calculateResult(operation);
    const actualRowsRead = outcome.rowsRead;

    expect(actualRowsRead).toBeLessThanOrEqual(expectedMaximum);
  });

  it.each(rejectedCases)("refuses the operation of %s with the same codes", async (caseName) => {
    const { operation, response } = readCase(caseName);

    const expected = { kind: "invalid", issues: toExpectedIssues(response) };
    const outcome = await calculateSimplesOperation(env.OPEN_DATA, operation);
    const actual =
      outcome.kind === "invalid"
        ? {
            kind: outcome.kind,
            issues: outcome.issues.map((issue) => ({
              ruleCode: ISSUE_CODE.exec(issue.message)?.[1] ?? issue.message,
              field: issue.field,
            })),
          }
        : outcome;

    expect(actual).toStrictEqual(expected);
  });
});
