// Wires the playground page (index.html) to playground.flow.ts: pick a demo, edit the request,
// calculate, then download the note's XML and PDF and check the XML against the official XSD; or
// check an XML file of your own. Text only reaches the page through textContent.

import type { CalculationOutcome } from "@/features/calculations/calculation.service.ts";
import type { TaxLineView } from "@/features/calculations/calculation.view.ts";
import type { DemoId } from "@/features/calculations/demo.operations.ts";
import { readUploadedXml } from "@/features/xml-upload/xml.upload.read.ts";
import { downloadFile } from "@/shared/browser/file.download.ts";
import type { XmlDocumentKind } from "@/shared/xml/xml.schema.ts";
import { verifyXmlSchema, type XmlSchemaVerdict } from "@/shared/xml/xml.validation.service.ts";
import {
  buildNote,
  calculateOperation,
  type DemoContext,
  listDemos,
  type PlaygroundNote,
  parseOperation,
  prepareDemo,
} from "./playground.flow.ts";

interface PlaygroundElements {
  demoSelect: HTMLSelectElement;
  operationInput: HTMLTextAreaElement;
  calculateButton: HTMLButtonElement;
  calculationStatus: HTMLElement;
  resultSection: HTMLElement;
  resultRows: HTMLElement;
  resultTotals: HTMLElement;
  resultJson: HTMLElement;
  noteSection: HTMLElement;
  noteStatus: HTMLElement;
  noteXml: HTMLElement;
  xmlButton: HTMLButtonElement;
  pdfButton: HTMLButtonElement;
  validateButton: HTMLButtonElement;
  validationStatus: HTMLElement;
  uploadInput: HTMLInputElement;
  uploadStatus: HTMLElement;
}

interface PlaygroundState {
  context: DemoContext;
  note: PlaygroundNote | null;
}

const XML_MIME_TYPE = "application/xml";
const PDF_MIME_TYPE = "application/pdf";
const JSON_INDENT = 2;
const NOTE_NAMES: Record<XmlDocumentKind, string> = { nfe: "NF-e", nfse: "NFS-e" };
const PDF_NAMES: Record<XmlDocumentKind, string> = { nfe: "DANFE", nfse: "DANFSe" };

function mountPlayground(page: Document) {
  const elements = findElements(page);
  const state: PlaygroundState = {
    context: { municipalityName: "", itemDescriptions: [] },
    note: null,
  };

  fillDemoOptions(page, elements.demoSelect);
  elements.demoSelect.addEventListener("change", () =>
    loadDemo(elements, state, elements.demoSelect.value as DemoId),
  );
  elements.calculateButton.addEventListener("click", () => void calculate(elements, state));
  elements.xmlButton.addEventListener("click", () => downloadNoteXml(state));
  elements.pdfButton.addEventListener("click", () => void downloadNotePdf(elements, state));
  elements.validateButton.addEventListener("click", () => void validateNote(elements, state));
  elements.uploadInput.addEventListener("change", () => void validateUpload(elements));
  loadDemo(elements, state, elements.demoSelect.value as DemoId);
}

function findElements(page: Document) {
  const elements: PlaygroundElements = {
    demoSelect: findElement(page, "demo-select"),
    operationInput: findElement(page, "operation-json"),
    calculateButton: findElement(page, "calculate-button"),
    calculationStatus: findElement(page, "calculation-status"),
    resultSection: findElement(page, "result-section"),
    resultRows: findElement(page, "result-rows"),
    resultTotals: findElement(page, "result-totals"),
    resultJson: findElement(page, "result-json"),
    noteSection: findElement(page, "note-section"),
    noteStatus: findElement(page, "note-status"),
    noteXml: findElement(page, "note-xml"),
    xmlButton: findElement(page, "xml-button"),
    pdfButton: findElement(page, "pdf-button"),
    validateButton: findElement(page, "validate-button"),
    validationStatus: findElement(page, "validation-status"),
    uploadInput: findElement(page, "upload-input"),
    uploadStatus: findElement(page, "upload-status"),
  };
  return elements;
}

function findElement<Element extends HTMLElement>(page: Document, elementId: string) {
  const element = page.getElementById(elementId);

  if (!element) {
    throw new Error(
      `The playground page has no element #${elementId}; index.html and this file disagree.`,
    );
  }

  return element as Element;
}

function fillDemoOptions(page: Document, demoSelect: HTMLSelectElement) {
  const options = listDemos().map((demo) => {
    const option = page.createElement("option");

    option.value = demo.demoId;
    option.textContent = demo.label;
    return option;
  });

  demoSelect.replaceChildren(...options);
}

function loadDemo(elements: PlaygroundElements, state: PlaygroundState, demoId: DemoId) {
  const prepared = prepareDemo(demoId);

  if (!prepared) {
    elements.calculationStatus.textContent = "Esta demonstração não montou um pedido válido.";
    return;
  }

  state.context = prepared.context;
  state.note = null;
  elements.operationInput.value = prepared.operationJson;
  elements.calculationStatus.textContent = "";
  elements.resultSection.hidden = true;
  elements.noteSection.hidden = true;
}

async function calculate(elements: PlaygroundElements, state: PlaygroundState) {
  const parsed = parseOperation(elements.operationInput.value);

  if (!parsed.isValid) {
    elements.calculationStatus.textContent = parsed.message;
    return;
  }

  // why: the run keeps the context it started with, and the form stays locked until the note is
  // shown, so a second click or a new demo never mixes two runs.
  const context = state.context;

  lockForm(elements, true);
  elements.calculationStatus.textContent = "Calculando...";

  const attempt = await calculateOperation(parsed.operation);

  if (!attempt.isSuccess) {
    lockForm(elements, false);
    elements.calculationStatus.textContent = attempt.message;
    elements.resultSection.hidden = true;
    elements.noteSection.hidden = true;
    return;
  }

  elements.calculationStatus.textContent = "Calculado.";
  showResult(elements, attempt.outcome);
  state.note = await buildNote({ outcome: attempt.outcome, context });
  lockForm(elements, false);
  showNote(elements, state.note);
}

function lockForm(elements: PlaygroundElements, isLocked: boolean) {
  elements.calculateButton.disabled = isLocked;
  elements.demoSelect.disabled = isLocked;
  elements.operationInput.readOnly = isLocked;
}

function showResult(elements: PlaygroundElements, outcome: CalculationOutcome) {
  const rows = outcome.view.itemViews.map((itemView) => {
    const taxText = itemView.taxLines.map(describeTaxLine).join("\n");
    const row = createRow(elements.resultRows.ownerDocument, [
      String(itemView.itemNumber),
      itemView.statusLabel,
      itemView.baseAmount ?? "-",
      taxText || "-",
      itemView.totalAmount ?? "-",
    ]);
    return row;
  });
  const totals = outcome.view.totals.map((total) => `${total.label}: ${total.amount}`);

  elements.resultRows.replaceChildren(...rows);
  elements.resultTotals.textContent = [...totals, `Total: ${outcome.view.grandTotal}`].join(" · ");
  elements.resultJson.textContent = JSON.stringify(outcome.result, null, JSON_INDENT);
  elements.resultSection.hidden = false;
}

function describeTaxLine(taxLine: TaxLineView) {
  const reduction = taxLine.hasReduction ? `, redução de ${taxLine.reduction}` : "";
  const description = `${taxLine.label} ${taxLine.rate}${reduction} = ${taxLine.amount}`;
  return description;
}

function createRow(page: Document, cellTexts: string[]) {
  const row = page.createElement("tr");
  const cells = cellTexts.map((cellText) => {
    const cell = page.createElement("td");

    cell.textContent = cellText;
    return cell;
  });

  row.replaceChildren(...cells);
  return row;
}

function showNote(elements: PlaygroundElements, note: PlaygroundNote) {
  elements.noteSection.hidden = false;
  elements.validationStatus.textContent = "";
  elements.xmlButton.disabled = !note.isReady;
  elements.pdfButton.disabled = !note.isReady;
  elements.validateButton.disabled = !note.isReady;

  if (!note.isReady) {
    elements.noteStatus.textContent = note.reason;
    elements.noteXml.textContent = "";
    return;
  }

  elements.noteStatus.textContent = `${NOTE_NAMES[note.kind]} simulada, com ${PDF_NAMES[note.kind]} em PDF.`;
  elements.noteXml.textContent = note.xml;
}

function downloadNoteXml(state: PlaygroundState) {
  if (!state.note?.isReady) {
    return;
  }

  downloadFile({
    fileName: `${state.note.fileStem}.xml`,
    content: state.note.xml,
    mimeType: XML_MIME_TYPE,
  });
}

async function downloadNotePdf(elements: PlaygroundElements, state: PlaygroundState) {
  const note = state.note;

  if (!note?.isReady) {
    return;
  }

  elements.pdfButton.disabled = true;

  const rendering = await note.renderPdf();

  elements.pdfButton.disabled = false;

  if (!rendering.isSuccess) {
    elements.noteStatus.textContent = `O ${PDF_NAMES[note.kind]} não foi gerado; veja o console.`;
    return;
  }

  downloadFile({
    fileName: `${note.fileStem}.pdf`,
    content: rendering.bytes,
    mimeType: PDF_MIME_TYPE,
  });
}

async function validateNote(elements: PlaygroundElements, state: PlaygroundState) {
  const note = state.note;

  if (!note?.isReady) {
    return;
  }

  elements.validationStatus.textContent = "Validando contra o XSD oficial...";

  const verdict = await verifyXmlSchema({ xml: note.xml, kind: note.kind });

  elements.validationStatus.textContent = describeVerdict(verdict, NOTE_NAMES[note.kind]);
}

async function validateUpload(elements: PlaygroundElements) {
  const file = elements.uploadInput.files?.[0];

  if (!file) {
    return;
  }

  const uploaded = readUploadedXml(await file.text());

  if (uploaded.kind === "malformed" || uploaded.kind === "unsupported") {
    elements.uploadStatus.textContent =
      uploaded.kind === "malformed"
        ? "O arquivo não é um XML bem formado."
        : `A raiz ${uploaded.rootName} não é NF-e nem NFS-e.`;
    return;
  }

  elements.uploadStatus.textContent = "Validando contra o XSD oficial...";

  const verdict = await verifyXmlSchema({ xml: uploaded.xml, kind: uploaded.kind });

  elements.uploadStatus.textContent = describeVerdict(verdict, NOTE_NAMES[uploaded.kind]);
}

function describeVerdict(verdict: XmlSchemaVerdict, noteName: string) {
  if (!verdict.isAvailable) {
    const unavailable = "O validador não carregou; veja o console.";
    return unavailable;
  }

  if (verdict.check.isValid) {
    const valid = `${noteName} válida contra o XSD oficial.`;
    return valid;
  }

  const errorLines = verdict.check.errors.map(
    (schemaError) => `linha ${schemaError.lineNumber ?? "?"}: ${schemaError.message}`,
  );
  const invalid = [`${noteName} com ${errorLines.length} erro(s) de schema:`, ...errorLines].join(
    "\n",
  );
  return invalid;
}

export { mountPlayground };
