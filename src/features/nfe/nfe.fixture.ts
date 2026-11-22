// Reads the NF-e golden cases of fixtures/regime-regular into NfeInput, with the calculated items
// carrying the figures the upstream calculator published. Test-only; the cases are the ones with
// document type 55 and every item calculated.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { CalculatedItem, ItemTaxes } from "@/features/calculations/calculation.dto.ts";
import {
  type CalculatedResponse,
  type ObservedResponse,
  type PublishedItemTaxes,
  toExpectedItems,
  toOperation,
  UNRECORDED_STEPS,
  type UpstreamOperation,
} from "@/features/calculations/calculation.fixture.ts";
import type { NfeInput } from "./nfe.document.ts";

interface NfeGoldenCase {
  caseName: string;
  input: NfeInput;
  calculated: CalculatedResponse;
}

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "../../../fixtures/regime-regular");

const NFE_GOLDEN_CASES = [
  "basic-food-basket-2026",
  "full-rate-goods-2026",
  "full-rate-goods-2027-nominal",
  "multi-item-2026",
  "rounding-half-even-2026",
  "upstream-rounding-t1",
  "upstream-rounding-t4",
  "selective-tax-cigars-2027",
  "selective-tax-multi-item-2027",
  "selective-tax-no-calculation-2027",
  "selective-tax-single-rounding-2027",
  "selective-tax-vehicle-2028",
];

function readNfeGoldenCase(caseName: string) {
  const upstream = readFixtureJson<UpstreamOperation>(`${caseName}.input.json`);
  const calculated = readFixtureJson<CalculatedResponse>(`${caseName}.output.regime-geral.json`);
  const observed = readFixtureJson<ObservedResponse>(`${caseName}.output.observabilidade.json`);
  const calculatedItems = toExpectedItems({ calculated, observed }).map((expectedItem) => {
    const upstreamItem = upstream.itens.find(
      (candidate) => candidate.numero === expectedItem.itemNumber,
    );
    const calculatedItem: CalculatedItem = {
      itemNumber: expectedItem.itemNumber,
      status: expectedItem.status === "simulated" ? "simulated" : "calculated",
      cstCode: upstreamItem?.cst ?? "",
      cClassTrib: upstreamItem?.cClassTrib ?? "",
      treatmentDescription: "",
      legalGround: null,
      selectiveTax: expectedItem.selectiveTax
        ? {
            ...expectedItem.selectiveTax,
            treatmentDescription: "",
            rateSources: { adValorem: "nominal", adRem: "nominal" },
            calculationSteps: [],
          }
        : null,
      taxes: expectedItem.taxes ? withUnrecordedSteps(expectedItem.taxes) : null,
    };
    return calculatedItem;
  });
  const goldenCase: NfeGoldenCase = {
    caseName,
    input: {
      operation: toOperation(upstream),
      calculatedItems,
      municipalityName: "Município do caso",
      itemDescriptions: upstream.itens.map((upstreamItem) => `Mercadoria NCM ${upstreamItem.ncm}`),
    },
    calculated,
  };
  return goldenCase;
}

function withUnrecordedSteps(taxes: PublishedItemTaxes) {
  const itemTaxes: ItemTaxes = {
    ...taxes,
    cbs: { ...taxes.cbs, ...UNRECORDED_STEPS },
    ibsUf: { ...taxes.ibsUf, ...UNRECORDED_STEPS },
    ibsMun: { ...taxes.ibsMun, ...UNRECORDED_STEPS },
  };
  return itemTaxes;
}

function readFixtureJson<Shape>(fileName: string) {
  const text = readFileSync(path.join(FIXTURES_DIRECTORY, fileName), "utf8");
  const parsed = JSON.parse(text) as Shape;
  return parsed;
}

export type { NfeGoldenCase };
export { NFE_GOLDEN_CASES, readNfeGoldenCase };
