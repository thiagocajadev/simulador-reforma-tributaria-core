import fileSystem from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculationResult, Operation } from "@/features/calculations/calculation.dto.ts";
import { UNRECORDED_STEPS } from "@/features/calculations/calculation.fixture.ts";
import { toCalculationView } from "@/features/calculations/calculation.view.ts";
import { mountPlayground } from "./playground.page.ts";

const services = vi.hoisted(() => ({
  submitCalculation: vi.fn(),
  verifyXmlSchema: vi.fn(),
  generateDanfePdf: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock("@/features/calculations/calculation.service.ts", () => ({
  submitCalculation: services.submitCalculation,
}));
vi.mock("@/shared/xml/xml.validation.service.ts", () => ({
  verifyXmlSchema: services.verifyXmlSchema,
}));
vi.mock("@/features/nfe/danfe.service.ts", () => ({ generateDanfePdf: services.generateDanfePdf }));
vi.mock("@/shared/browser/file.download.ts", () => ({ downloadFile: services.downloadFile }));

const PAGE_FILE = path.resolve(import.meta.dirname, "..", "index.html");
const TAX = {
  ...UNRECORDED_STEPS,
  rate: "8.80",
  reductionPercent: null,
  effectiveRate: null,
  amount: "8.80",
};

// The API's answer for any operation: every item simulated at the same rates.
function answerCalculation(operation: Operation) {
  const result: CalculationResult = {
    items: operation.items.map((operationItem) => ({
      itemNumber: operationItem.itemNumber,
      status: "simulated",
      cstCode: operationItem.cstCode,
      cClassTrib: operationItem.cClassTrib,
      treatmentDescription: "Tributação integral",
      legalGround: null,
      selectiveTax: null,
      taxes: {
        baseAmount: "100.00",
        cbs: TAX,
        ibsUf: TAX,
        ibsMun: TAX,
        ibsAmount: "17.60",
      },
    })) as CalculationResult["items"],
    totals: {
      baseAmount: "100.00",
      cbsAmount: "8.80",
      ibsUfAmount: "8.80",
      ibsMunAmount: "8.80",
      ibsAmount: "17.60",
      selectiveTaxAmount: "0.00",
    },
    dataVersion: "V0073",
  };
  const answer = {
    isSuccess: true,
    value: { operation, result, view: toCalculationView(result) },
  };
  return Promise.resolve(answer);
}

function readPageBody() {
  const pageText = fileSystem.readFileSync(PAGE_FILE, "utf8");
  const body = pageText.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
  const bodyWithoutScripts = body.replace(/<script[\s\S]*?<\/script>/g, "");
  return bodyWithoutScripts;
}

function findById<Element extends HTMLElement>(elementId: string) {
  const element = document.getElementById(elementId) as Element;
  return element;
}

beforeEach(() => {
  document.body.innerHTML = readPageBody();
  services.submitCalculation.mockImplementation(answerCalculation);
  services.verifyXmlSchema.mockResolvedValue({ isAvailable: true, check: { isValid: true } });
  services.generateDanfePdf.mockResolvedValue({ isSuccess: true, bytes: new ArrayBuffer(4) });
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("the playground page", () => {
  it("calculates a demo, builds its NF-e, validates the XML and downloads it", async () => {
    mountPlayground(document);
    const demoSelect = findById<HTMLSelectElement>("demo-select");

    demoSelect.value = "basicFoodBasket";
    demoSelect.dispatchEvent(new Event("change"));
    findById<HTMLButtonElement>("calculate-button").click();
    await vi.waitFor(() => expect(findById("note-section").hidden).toBe(false));
    findById<HTMLButtonElement>("validate-button").click();
    await vi.waitFor(() => expect(services.verifyXmlSchema).toHaveBeenCalled());
    findById<HTMLButtonElement>("xml-button").click();

    const [sentOperation] = services.submitCalculation.mock.calls[0] ?? [];
    const [download] = services.downloadFile.mock.calls[0] ?? [];
    const actualRows = findById("result-rows").children.length;
    const expectedRows = sentOperation.items.length;
    const actualValidation = findById("validation-status").textContent;
    const expectedValidation = "NF-e válida contra o XSD oficial.";
    const expectedFileName = /^nfe-simulada-\d{44}\.xml$/;

    expect(actualRows).toBe(expectedRows);
    expect(actualValidation).toBe(expectedValidation);
    expect(download.fileName).toMatch(expectedFileName);
    expect(download.content).toContain("<NFe");
  });

  it("locks the button and the demo choice until the note is shown", async () => {
    mountPlayground(document);
    let resolveCalculation: (answer: unknown) => void = () => {};
    const pendingCalculation = new Promise((resolve) => {
      resolveCalculation = resolve;
    });
    services.submitCalculation.mockReturnValueOnce(pendingCalculation);

    findById<HTMLButtonElement>("calculate-button").click();

    const isLockedDuringRun =
      findById<HTMLButtonElement>("calculate-button").disabled &&
      findById<HTMLSelectElement>("demo-select").disabled;
    const [sentOperation] = services.submitCalculation.mock.calls[0] ?? [];
    resolveCalculation(await answerCalculation(sentOperation));
    await vi.waitFor(() => expect(findById("note-section").hidden).toBe(false));
    const isUnlockedAfter = !findById<HTMLButtonElement>("calculate-button").disabled;

    expect(isLockedDuringRun).toBe(true);
    expect(isUnlockedAfter).toBe(true);
  });

  it("refuses a request that is not JSON and calls no API", async () => {
    mountPlayground(document);
    const operationInput = findById<HTMLTextAreaElement>("operation-json");

    operationInput.value = "{ not json";
    findById<HTMLButtonElement>("calculate-button").click();

    const actualStatus = findById("calculation-status").textContent ?? "";

    expect(actualStatus).toMatch(/^JSON inválido/);
    expect(services.submitCalculation).not.toHaveBeenCalled();
  });
});
