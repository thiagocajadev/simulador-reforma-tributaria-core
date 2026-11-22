// Draws a DanfsePresentation as one A4 page with jsPDF, in the browser (docs/nfse.md, PDF). The
// standard Helvetica font needs no embedding and its WinAnsi encoding covers Portuguese. The QR
// code is drawn as vector squares from the qrcode module matrix, so no canvas is involved. A light
// diagonal watermark goes under every page, so the document never passes for a real one.
// Loaded through import() only when the visitor asks for the PDF, keeping jsPDF out of the
// initial bundle.

import { jsPDF as JsPdf } from "jspdf";
import { create as createQrCode } from "qrcode";
import { drawSimulationWatermark } from "@/shared/pdf/pdf.watermark.ts";
import type { DanfseBlock, DanfseField, DanfsePresentation } from "./danfse.present.ts";

interface Cursor {
  pdf: JsPdf;
  top: number;
}

interface GridCell {
  field: DanfseField;
  isTitle: boolean;
  column: number;
  span: number;
}

const PAGE = { width: 210, height: 297, margin: 8 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const GRID_COLUMNS = 4;
const COLUMN_WIDTH = CONTENT_WIDTH / GRID_COLUMNS;
const CELL_PADDING = 0.6;
const LABEL_LINE = 2.4;
const VALUE_LINE = 2.8;
const QR_SIZE = 22;
const IDENTIFICATION_COLUMNS = 3;
const IDENTIFICATION_WIDTH = CONTENT_WIDTH - QR_SIZE - 20;
const RECEIPT_HEIGHT = 11;
const RECEIPT_TOP = PAGE.height - PAGE.margin - RECEIPT_HEIGHT - 3;

const FONT_SIZES = { title: 10, locality: 8.5, note: 5.5, label: 6, value: 7, section: 7 };
const COLORS = {
  text: [33, 33, 38] as const,
  muted: [90, 90, 98] as const,
  alert: [200, 30, 30] as const,
  rule: [60, 60, 66] as const,
  sectionFill: [235, 235, 238] as const,
};

function renderDanfsePdf(presentation: DanfsePresentation) {
  const bytes = drawDanfse(presentation, { compress: true }).output("arraybuffer");
  return bytes;
}

// why: the tests draw without compression, so the page text can be read in the PDF bytes.
function drawDanfse(presentation: DanfsePresentation, options: { compress: boolean }) {
  const pdf = new JsPdf({ unit: "mm", format: "a4", compress: options.compress });
  const cursor: Cursor = { pdf, top: PAGE.margin };

  pdf.setProperties({ title: `DANFSe simulado ${presentation.accessKey}`, creator: "Simulador" });
  drawSimulationWatermark(pdf, { width: PAGE.width, height: PAGE.height, fontFamily: "helvetica" });
  pdf.setDrawColor(...COLORS.rule);
  pdf.setLineWidth(0.2);
  pdf.rect(PAGE.margin, PAGE.margin, CONTENT_WIDTH, PAGE.height - 2 * PAGE.margin);
  drawHeader(cursor, presentation);
  drawAccess(cursor, presentation);

  for (const block of presentation.blocks) {
    drawBlock(cursor, block);
  }

  requireRoomForReceipt(cursor.top);
  drawReceipt(pdf, presentation.receipt);
  return pdf;
}

// why: NT 008 prints one page; content running into the receipt stub would be cut silently.
function requireRoomForReceipt(contentBottom: number) {
  if (contentBottom > RECEIPT_TOP) {
    throw new Error(
      `DANFSe content ends at ${contentBottom.toFixed(1)} mm, past the receipt at ${RECEIPT_TOP} mm.`,
    );
  }
}

function drawHeader(cursor: Cursor, presentation: DanfsePresentation) {
  const { pdf, top } = cursor;
  const { header } = presentation;
  const center = PAGE.width / 2;
  const right = PAGE.width - PAGE.margin - 2;

  setText(pdf, { size: FONT_SIZES.section, isBold: true });
  pdf.text(pdf.splitTextToSize(header.issuerNote, 45), PAGE.margin + 2, top + 5);
  setText(pdf, { size: FONT_SIZES.title, isBold: true });
  pdf.text(header.title, center, top + 5, { align: "center" });
  pdf.text(header.subtitle, center, top + 9, { align: "center" });
  setText(pdf, { size: FONT_SIZES.title, isBold: true, color: COLORS.alert });
  pdf.text(header.validityNotice, center, top + 13, { align: "center" });
  setText(pdf, { size: FONT_SIZES.locality });
  pdf.text(presentation.locality[0] ?? "", right, top + 5, { align: "right" });
  setText(pdf, { size: FONT_SIZES.label, color: COLORS.muted });
  pdf.text(presentation.locality.slice(1), right, top + 9, { align: "right" });
  cursor.top = top + 16;
  drawRule(pdf, cursor.top);
}

function drawAccess(cursor: Cursor, presentation: DanfsePresentation) {
  const { pdf } = cursor;
  const top = cursor.top;
  const qrLeft = PAGE.width - PAGE.margin - QR_SIZE - 9;

  drawField(pdf, {
    field: { label: "CHAVE DE ACESSO DA NFS-E", value: presentation.accessKey },
    left: PAGE.margin,
    top,
    width: IDENTIFICATION_WIDTH,
  });
  drawQrCode(pdf, { url: presentation.qrCodeUrl, left: qrLeft, top: top + 1 });
  setText(pdf, { size: FONT_SIZES.note, color: COLORS.muted });
  pdf.text(
    pdf.splitTextToSize(presentation.qrCodeNote, QR_SIZE + 16),
    qrLeft + QR_SIZE / 2,
    top + QR_SIZE + 3.5,
    {
      align: "center",
    },
  );

  const identificationWidth = IDENTIFICATION_WIDTH / IDENTIFICATION_COLUMNS;
  const rowHeight = LABEL_LINE + VALUE_LINE + CELL_PADDING * 2;

  presentation.identification.forEach((field, position) => {
    const column = position % IDENTIFICATION_COLUMNS;
    const row = Math.floor(position / IDENTIFICATION_COLUMNS);

    drawField(pdf, {
      field,
      left: PAGE.margin + column * identificationWidth,
      top: top + rowHeight + row * rowHeight,
      width: identificationWidth,
    });
  });
  cursor.top = top + QR_SIZE + 12;
}

function drawQrCode(pdf: JsPdf, placement: { url: string; left: number; top: number }) {
  const { url, left, top } = placement;
  const { modules } = createQrCode(url, { errorCorrectionLevel: "M" });
  const moduleSize = QR_SIZE / modules.size;
  const positions = Array.from({ length: modules.size ** 2 }, (_, position) => position);
  const darkPositions = positions.filter((position) =>
    modules.get(Math.floor(position / modules.size), position % modules.size),
  );

  pdf.setFillColor(...COLORS.text);

  for (const position of darkPositions) {
    const row = Math.floor(position / modules.size);
    const column = position % modules.size;

    pdf.rect(left + column * moduleSize, top + row * moduleSize, moduleSize, moduleSize, "F");
  }
}

function drawBlock(cursor: Cursor, block: DanfseBlock) {
  drawRule(cursor.pdf, cursor.top);

  if (block.kind === "banner") {
    setText(cursor.pdf, { size: FONT_SIZES.section });
    cursor.pdf.text(block.text, PAGE.width / 2, cursor.top + 3.3, { align: "center" });
    cursor.top += 4.6;
    return;
  }

  if (block.kind === "text") {
    drawTextBlock(cursor, block);
    return;
  }

  drawGrid(cursor, block.title, block.fields);
}

function drawTextBlock(cursor: Cursor, block: { title: string; text: string }) {
  const { pdf } = cursor;

  setText(pdf, { size: FONT_SIZES.section, isBold: true });
  pdf.text(block.title, PAGE.margin + CELL_PADDING, cursor.top + 3.5);
  setText(pdf, { size: FONT_SIZES.value });

  const lines: string[] = pdf.splitTextToSize(block.text, CONTENT_WIDTH - 2 * CELL_PADDING);

  pdf.text(lines, PAGE.margin + CELL_PADDING, cursor.top + 6.5);
  cursor.top += 6 + lines.length * VALUE_LINE;
}

function drawGrid(cursor: Cursor, title: string, fields: DanfseField[]) {
  const { pdf } = cursor;
  const titleCell: DanfseField = { label: title, value: "" };
  const rows = placeCells([titleCell, ...fields]);

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((cell) => measureCell(pdf, cell)));

    for (const cell of row) {
      drawGridCell(pdf, cell, cursor.top);
    }

    cursor.top += rowHeight;
  }
}

function drawGridCell(pdf: JsPdf, cell: GridCell, top: number) {
  const left = PAGE.margin + cell.column * COLUMN_WIDTH;
  const width = cell.span * COLUMN_WIDTH;

  if (cell.isTitle) {
    drawTitleCell(pdf, { title: cell.field.label, left, top, width });
    return;
  }

  drawField(pdf, { field: cell.field, left, top, width });
}

// why: cells flow left to right over 4 columns; a cell that does not fit opens the next row.
function placeCells(fields: DanfseField[]) {
  const rows: GridCell[][] = [];
  let row: GridCell[] = [];
  let column = 0;

  fields.forEach((field, position) => {
    const span = Math.min(field.span ?? 1, GRID_COLUMNS);

    if (column + span > GRID_COLUMNS) {
      rows.push(row);
      row = [];
      column = 0;
    }

    row.push({ field, isTitle: position === 0, column, span });
    column += span;
  });
  rows.push(row);
  return rows;
}

function measureCell(pdf: JsPdf, cell: GridCell) {
  if (cell.isTitle) {
    const titleHeight = LABEL_LINE + VALUE_LINE + CELL_PADDING * 2;
    return titleHeight;
  }

  setText(pdf, { size: FONT_SIZES.value });

  const valueLines = pdf.splitTextToSize(
    cell.field.value,
    cell.span * COLUMN_WIDTH - 2 * CELL_PADDING,
  );
  const labelHeight = cell.field.label === "" ? 0 : LABEL_LINE;
  const height = labelHeight + valueLines.length * VALUE_LINE + CELL_PADDING * 2;
  return height;
}

function drawTitleCell(
  pdf: JsPdf,
  placement: { title: string; left: number; top: number; width: number },
) {
  const { title, left, top, width } = placement;
  const height = LABEL_LINE + VALUE_LINE;

  pdf.setFillColor(...COLORS.sectionFill);
  pdf.rect(left + 0.3, top + 0.6, width - 0.6, height, "F");
  setText(pdf, { size: FONT_SIZES.section, isBold: true });
  pdf.text(pdf.splitTextToSize(title, width - 2 * CELL_PADDING), left + CELL_PADDING, top + 3.6);
}

function drawField(
  pdf: JsPdf,
  placement: { field: DanfseField; left: number; top: number; width: number },
) {
  const { field, left, top, width } = placement;
  const textLeft = left + CELL_PADDING;
  const textWidth = width - 2 * CELL_PADDING;
  const hasLabel = field.label !== "";

  if (hasLabel) {
    setText(pdf, { size: FONT_SIZES.label, isBold: true });
    pdf.text(
      pdf.splitTextToSize(field.label, textWidth)[0] ?? "",
      textLeft,
      top + CELL_PADDING + 2,
    );
  }

  setText(pdf, { size: FONT_SIZES.value });
  pdf.text(
    pdf.splitTextToSize(field.value, textWidth),
    textLeft,
    top + CELL_PADDING + (hasLabel ? LABEL_LINE : 0) + 2.4,
  );
}

function drawReceipt(pdf: JsPdf, receipt: DanfseField[]) {
  const top = RECEIPT_TOP;
  let column = 0;

  pdf.rect(PAGE.margin + 2, top, CONTENT_WIDTH - 4, RECEIPT_HEIGHT);

  for (const field of receipt) {
    const span = field.span ?? 1;
    const left = PAGE.margin + 2 + column * ((CONTENT_WIDTH - 4) / GRID_COLUMNS);

    if (column > 0) {
      pdf.line(left, top, left, top + RECEIPT_HEIGHT);
    }

    drawField(pdf, { field, left, top, width: span * ((CONTENT_WIDTH - 4) / GRID_COLUMNS) });
    column += span;
  }
}

function drawRule(pdf: JsPdf, top: number) {
  pdf.setDrawColor(...COLORS.rule);
  pdf.line(PAGE.margin, top, PAGE.width - PAGE.margin, top);
}

function setText(
  pdf: JsPdf,
  style: { size: number; isBold?: boolean; color?: readonly [number, number, number] },
) {
  const { size, isBold = false, color = COLORS.text } = style;

  pdf.setFont("helvetica", isBold ? "bold" : "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
}

export { drawDanfse, renderDanfsePdf };
