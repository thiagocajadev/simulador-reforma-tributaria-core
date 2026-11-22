// The playground's steps, without the page: a demo operation turned into the request JSON, the JSON
// read back, the calculation, and the note (NF-e or NFS-e) built from it, with its XML and its PDF.
// Every step reuses the core's modules as they are; nothing here calculates or writes XML itself.

import type { Operation } from "@/features/calculations/calculation.dto.ts";
import {
  type CalculationOutcome,
  submitCalculation,
} from "@/features/calculations/calculation.service.ts";
import {
  DEMO_OPERATIONS,
  type DemoId,
  findDemoOperation,
} from "@/features/calculations/demo.operations.ts";
import { checkDraft } from "@/features/calculations/operation.draft.ts";
import { generateDanfePdf } from "@/features/nfe/danfe.service.ts";
import { buildNfeDocument } from "@/features/nfe/nfe.document.ts";
import { checkNfeEligibility } from "@/features/nfe/nfe.eligibility.ts";
import { writeNfeXml } from "@/features/nfe/nfe.xml.ts";
import { generateDanfsePdf } from "@/features/nfse/danfse.service.ts";
import { buildNfseDocument } from "@/features/nfse/nfse.document.ts";
import { checkNfseEligibility } from "@/features/nfse/nfse.eligibility.ts";
import { writeNfseXml } from "@/features/nfse/nfse.xml.ts";
import { fetchServiceItems } from "@/features/operation-indicators/operation-indicators.service.ts";
import type { ApiFailure } from "@/shared/http/api.client.ts";
import type { XmlDocumentKind } from "@/shared/xml/xml.schema.ts";

// The names a note prints that the request does not carry: the municipality and each item's text.
interface DemoContext {
  municipalityName: string;
  itemDescriptions: string[];
}

interface PreparedDemo {
  operationJson: string;
  context: DemoContext;
}

type ParsedOperation =
  | { isValid: true; operation: Operation }
  | { isValid: false; message: string };

type CalculationAttempt =
  | { isSuccess: true; outcome: CalculationOutcome }
  | { isSuccess: false; message: string };

type PdfRendering = { isSuccess: true; bytes: ArrayBuffer } | { isSuccess: false };

type PlaygroundNote =
  | {
      isReady: true;
      kind: XmlDocumentKind;
      xml: string;
      fileStem: string;
      renderPdf: () => Promise<PdfRendering>;
    }
  | { isReady: false; reason: string };

const JSON_INDENT = 2;
const ISO_DATE_LENGTH = 10;
// why: the NFS-e is the national service note, document type 91 in the open data.
const NFSE_DOCUMENT_TYPE = 91;
const NO_NOTE_REASON = "Esta operação não gera nota.";
const NO_SERVICE_ITEM_REASON =
  "A API não trouxe item da LC 116 com indicador de operação para este NBS e cClassTrib.";

function listDemos() {
  const demos = DEMO_OPERATIONS.map((demo) => ({ demoId: demo.demoId, label: demo.label }));
  return demos;
}

function prepareDemo(demoId: DemoId) {
  const demo = findDemoOperation(demoId);
  const check = demo ? checkDraft(demo.draft) : null;

  if (!demo || !check?.isValid) {
    return null;
  }

  const prepared: PreparedDemo = {
    operationJson: JSON.stringify(check.operation, null, JSON_INDENT),
    context: {
      municipalityName: demo.draft.municipality?.label ?? "",
      itemDescriptions: demo.draft.operationItems.map(
        (itemDraft, index) =>
          itemDraft.description.trim() || itemDraft.product?.label || `Item ${index + 1}`,
      ),
    },
  };
  return prepared;
}

function parseOperation(operationJson: string) {
  try {
    const parsed: unknown = JSON.parse(operationJson);
    const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    const outcome: ParsedOperation = isObject
      ? { isValid: true, operation: parsed as Operation }
      : { isValid: false, message: "O pedido precisa ser um objeto JSON." };
    return outcome;
  } catch (error) {
    const invalid: ParsedOperation = { isValid: false, message: `JSON inválido: ${String(error)}` };
    return invalid;
  }
}

async function calculateOperation(operation: Operation) {
  const result = await submitCalculation(operation);

  if (!result.isSuccess) {
    const failed: CalculationAttempt = {
      isSuccess: false,
      message: describeFailure(result.failure),
    };
    return failed;
  }

  const attempt: CalculationAttempt = { isSuccess: true, outcome: result.value };
  return attempt;
}

function describeFailure(failure: ApiFailure) {
  const issueLines = (failure.issues ?? []).map((issue) => `${issue.field}: ${issue.message}`);
  const message = [`A API respondeu ${failure.code}.`, ...issueLines].join("\n");
  return message;
}

async function buildNote(input: { outcome: CalculationOutcome; context: DemoContext }) {
  const isService = input.outcome.operation.documentType === NFSE_DOCUMENT_TYPE;
  const note = isService ? await buildNfseNote(input) : buildNfeNote(input);
  return note;
}

function buildNfeNote(input: { outcome: CalculationOutcome; context: DemoContext }) {
  const { outcome, context } = input;
  const eligibility = checkNfeEligibility(outcome.operation, outcome.result);

  if (!eligibility.isEligible) {
    const blocked: PlaygroundNote = {
      isReady: false,
      reason: eligibility.reason ?? NO_NOTE_REASON,
    };
    return blocked;
  }

  const nfeDocument = buildNfeDocument({
    operation: outcome.operation,
    calculatedItems: eligibility.calculatedItems,
    municipalityName: context.municipalityName,
    itemDescriptions: context.itemDescriptions,
  });
  const note: PlaygroundNote = {
    isReady: true,
    kind: "nfe",
    xml: writeNfeXml(nfeDocument),
    fileStem: `nfe-simulada-${nfeDocument.accessKey}`,
    renderPdf: () => generateDanfePdf(nfeDocument),
  };
  return note;
}

async function buildNfseNote(input: { outcome: CalculationOutcome; context: DemoContext }) {
  const { outcome, context } = input;
  const eligibility = checkNfseEligibility(outcome.operation, outcome.result);

  if (!eligibility.isEligible) {
    const blocked: PlaygroundNote = {
      isReady: false,
      reason: eligibility.reason ?? NO_NOTE_REASON,
    };
    return blocked;
  }

  const serviceItems = await fetchServiceItems({
    nbsCode: eligibility.nbsCode,
    cClassTrib: eligibility.calculatedItem.cClassTrib,
    date: outcome.operation.taxEventDate.slice(0, ISO_DATE_LENGTH),
  });
  if (!serviceItems.isSuccess) {
    const unreachable: PlaygroundNote = {
      isReady: false,
      reason: `A busca dos itens da LC 116 falhou: a API respondeu ${serviceItems.failure.code}.`,
    };
    return unreachable;
  }

  const serviceItem = serviceItems.value[0];
  const indicator = serviceItem?.indicators[0];

  if (!serviceItem || !indicator) {
    const missing: PlaygroundNote = { isReady: false, reason: NO_SERVICE_ITEM_REASON };
    return missing;
  }

  const nfseDocument = buildNfseDocument({
    operation: outcome.operation,
    calculatedItem: eligibility.calculatedItem,
    municipalityName: context.municipalityName,
    service: {
      nationalTaxCode: serviceItem.nationalTaxCode,
      nationalTaxDescription: serviceItem.description,
      indicatorCode: indicator.indicatorCode,
      description: `${context.itemDescriptions[0] ?? "Serviço"}. Serviço fictício, gerado para simulação.`,
    },
  });
  const note: PlaygroundNote = {
    isReady: true,
    kind: "nfse",
    xml: writeNfseXml(nfseDocument),
    fileStem: `nfse-simulada-${nfseDocument.accessKey}`,
    renderPdf: () => generateDanfsePdf(nfseDocument),
  };
  return note;
}

export type { CalculationAttempt, DemoContext, ParsedOperation, PlaygroundNote, PreparedDemo };
export { buildNote, calculateOperation, listDemos, parseOperation, prepareDemo };
