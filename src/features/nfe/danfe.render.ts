// Draws a DanfePresentation on A4 portrait sheets with jsPDF, in the browser: the blocks of the
// NT 2026.010 v1.00 reference model on the geometry of MOC 7.0 Anexo II 3.8.1. Items that do not fit
// the first sheet continue on additional sheets that repeat the header, as Anexo II 3.5 requires,
// and every sheet prints FOLHA n/m and the simulation watermark. Loaded through import() only.

import { jsPDF as JsPdf } from "jspdf";
import { drawSimulationWatermark } from "@/shared/pdf/pdf.watermark.ts";
import {
  type Box,
  drawAccessKeyBarcode,
  drawBlockTitle,
  drawBox,
  drawDashedRule,
  drawFieldRow,
  drawLines,
  lineHeight,
  wrapText,
} from "./danfe.draw.ts";
import type { DanfeField, DanfePresentation, DanfeProductRow } from "./danfe.present.ts";

interface Sheet {
  pdf: JsPdf;
  presentation: DanfePresentation;
  sheetNumber: number;
  sheetCount: number;
}

interface ProductColumn {
  title: string;
  width: number;
  align: "left" | "right";
}

const PAGE = { width: 210, height: 297, left: 2.5, top: 4, bottom: 4 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.left;
const ROW_HEIGHT = 8.5;
const TITLE_HEIGHT = 4.2;
const RECEIPT_HEIGHT = 17;
const RECEIPT_NOTE_WIDTH = 44.7;
const HEADER_HEIGHT = 39.2;
const HEADER_WIDTHS = { issuer: 74, danfe: 40 };
const KEY_BOX_HEIGHTS = { barcode: 14.8, key: 8.5 };
const ADDITIONAL_HEIGHT = 30;
const FISCO_WIDTH = 76.2;
const PRODUCT_HEADER_HEIGHT = 6;
const PRODUCT_STYLE = { size: 6.5 };
const PRODUCT_TITLE_STYLE = { size: 5.5, isBold: true };
const PRODUCT_PADDING = 0.8;
// why: sized so the largest amount the form accepts (13 integer digits) fits at 6.5 pt.
const PRODUCT_COLUMNS: ProductColumn[] = [
  { title: "DESCRIÇÃO DO PRODUTO / SERVIÇO", width: 49, align: "left" },
  { title: "CST / CFOP", width: 14, align: "left" },
  { title: "QTD / UN", width: 11, align: "right" },
  { title: "VLR UNIT", width: 22, align: "right" },
  { title: "VLR TOTAL", width: 22, align: "right" },
  { title: "BASES DE CÁLCULO", width: 31, align: "left" },
  { title: "ALÍQUOTAS", width: 22.5, align: "left" },
  { title: "VALOR DOS TRIBUTOS", width: CONTENT_WIDTH - 171.5, align: "left" },
];

const RECEIPT_GAP = 4;
// why: below the header, the first sheet holds three single rows (operation, issuer, regime), five
// titled blocks with seven rows among them, then the products title and column header.
const FIRST_SHEET_PRODUCTS_TOP =
  PAGE.top +
  RECEIPT_HEIGHT +
  RECEIPT_GAP +
  HEADER_HEIGHT +
  10 * ROW_HEIGHT +
  6 * TITLE_HEIGHT +
  PRODUCT_HEADER_HEIGHT;
const ADDITIONAL_TOP = PAGE.height - PAGE.bottom - ADDITIONAL_HEIGHT - TITLE_HEIGHT;
const OTHER_SHEET_PRODUCTS_TOP =
  PAGE.top + HEADER_HEIGHT + 2 * ROW_HEIGHT + TITLE_HEIGHT + PRODUCT_HEADER_HEIGHT;
const PRODUCTS_BOTTOM = { first: ADDITIONAL_TOP - 1, other: PAGE.height - PAGE.bottom };

function renderDanfePdf(presentation: DanfePresentation) {
  const bytes = drawDanfe(presentation, { compress: true }).output("arraybuffer");
  return bytes;
}

// why: the tests draw without compression, so the sheet text can be read in the PDF bytes.
function drawDanfe(presentation: DanfePresentation, options: { compress: boolean }) {
  const pdf = new JsPdf({ unit: "mm", format: "a4", compress: options.compress });
  const sheets = paginateProducts(pdf, presentation.products);

  pdf.setProperties({ title: `DANFE simulado ${presentation.accessKey}`, creator: "Simulador" });
  sheets.forEach((rows, position) => {
    if (position > 0) {
      pdf.addPage();
    }

    drawSheet({ pdf, presentation, sheetNumber: position + 1, sheetCount: sheets.length }, rows);
  });
  return pdf;
}

// why: a product taller than a whole additional sheet could never fit; fail loudly instead of
// drawing it past the bottom, as jsPDF never adds a page on its own.
function paginateProducts(pdf: JsPdf, products: DanfeProductRow[]) {
  const sheets: DanfeProductRow[][] = [[]];
  const otherSheetRoom = PRODUCTS_BOTTOM.other - OTHER_SHEET_PRODUCTS_TOP;
  let room = PRODUCTS_BOTTOM.first - FIRST_SHEET_PRODUCTS_TOP;

  for (const product of products) {
    const height = measureProduct(pdf, product);

    if (height > otherSheetRoom) {
      throw new Error(
        `DANFE product is ${height.toFixed(1)} mm tall, more than a sheet holds (${otherSheetRoom.toFixed(1)} mm).`,
      );
    }

    if (height > room) {
      sheets.push([]);
      room = otherSheetRoom;
    }

    sheets.at(-1)?.push(product);
    room -= height;
  }

  return sheets;
}

function measureProduct(pdf: JsPdf, product: DanfeProductRow) {
  const descriptionLines = wrapDescription(pdf, product);
  const lineCount = Math.max(descriptionLines.length + 1, product.rates.length);
  const height = lineCount * lineHeight(PRODUCT_STYLE.size) + 2 * PRODUCT_PADDING;
  return height;
}

function wrapDescription(pdf: JsPdf, product: DanfeProductRow) {
  const width = (PRODUCT_COLUMNS[0]?.width ?? 0) - 2 * PRODUCT_PADDING;
  const lines = wrapText(pdf, { text: product.description, width, style: PRODUCT_STYLE });
  return lines;
}

function drawSheet(sheet: Sheet, rows: DanfeProductRow[]) {
  const { pdf, presentation, sheetNumber } = sheet;
  const isFirstSheet = sheetNumber === 1;
  const headerTop = isFirstSheet ? PAGE.top + RECEIPT_HEIGHT + RECEIPT_GAP : PAGE.top;

  drawSimulationWatermark(pdf, { width: PAGE.width, height: PAGE.height, fontFamily: "times" });

  if (isFirstSheet) {
    drawReceipt(sheet);
  }

  drawHeader(sheet, headerTop);

  const afterHeader = headerTop + HEADER_HEIGHT;
  const operationTop = drawRow(pdf, afterHeader, presentation.operationRow);
  const afterIssuer = drawRow(pdf, operationTop, presentation.issuerRow);

  if (isFirstSheet) {
    drawFirstSheetBlocks(sheet, afterIssuer);
    drawProducts(pdf, { rows, top: FIRST_SHEET_PRODUCTS_TOP, bottom: PRODUCTS_BOTTOM.first });
    drawAdditionalInformation(pdf, presentation.additionalInformation);
    return;
  }

  drawProducts(pdf, { rows, top: OTHER_SHEET_PRODUCTS_TOP, bottom: PRODUCTS_BOTTOM.other });
}

function drawRow(pdf: JsPdf, top: number, fields: DanfeField[]) {
  drawFieldRow(pdf, { box: rowBox(top), fields });

  const nextTop = top + ROW_HEIGHT;
  return nextTop;
}

function rowBox(top: number) {
  const box: Box = { left: PAGE.left, top, width: CONTENT_WIDTH, height: ROW_HEIGHT };
  return box;
}

function drawTitledRows(pdf: JsPdf, block: { top: number; title: string; rows: DanfeField[][] }) {
  drawBlockTitle(pdf, { left: PAGE.left, top: block.top, title: block.title });

  const nextTop = block.rows.reduce(
    (top, fields) => drawRow(pdf, top, fields),
    block.top + TITLE_HEIGHT,
  );
  return nextTop;
}

function drawFirstSheetBlocks(sheet: Sheet, top: number) {
  const { pdf, presentation } = sheet;
  const titledBlocks = [
    { title: "DESTINATÁRIO / REMETENTE", rows: presentation.recipientRows },
    { title: "TOTAL DOS PRODUTOS E TOTAL DA NOTA", rows: [presentation.productTotals] },
    { title: "TOTAL DO ICMS / IPI", rows: [presentation.icmsTotals] },
    { title: "TOTAL DO IBS / CBS / IS", rows: [presentation.reformTotals] },
    { title: "TRANSPORTADOR / VOLUMES TRANSPORTADOS", rows: [presentation.transport] },
  ];
  const afterRegime = drawRow(pdf, top, presentation.regimeRow);
  const blocksBottom = titledBlocks.reduce(
    (blockTop, block) => drawTitledRows(pdf, { top: blockTop, ...block }),
    afterRegime,
  );
  const productsTitleTop = FIRST_SHEET_PRODUCTS_TOP - PRODUCT_HEADER_HEIGHT - TITLE_HEIGHT;

  if (blocksBottom > productsTitleTop) {
    throw new Error(
      `DANFE blocks end at ${blocksBottom.toFixed(1)} mm, past the products at ${productsTitleTop.toFixed(1)} mm.`,
    );
  }
}

function drawReceipt(sheet: Sheet) {
  const { pdf, presentation } = sheet;
  const statementWidth = CONTENT_WIDTH - RECEIPT_NOTE_WIDTH;
  const statementLines = wrapText(pdf, {
    text: presentation.receiptStatement,
    width: statementWidth - 2,
    style: { size: 6.5 },
  });

  drawBox(pdf, { left: PAGE.left, top: PAGE.top, width: statementWidth, height: ROW_HEIGHT });
  drawLines(pdf, {
    lines: statementLines,
    left: PAGE.left + 1,
    top: PAGE.top + 0.6,
    style: { size: 6.5 },
  });
  drawFieldRow(pdf, {
    box: { left: PAGE.left, top: PAGE.top + ROW_HEIGHT, width: statementWidth, height: ROW_HEIGHT },
    fields: [
      { label: "DATA DE RECEBIMENTO", value: "", span: 1 },
      { label: "IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", value: "", span: 3 },
    ],
  });

  const noteLeft = PAGE.left + statementWidth;

  drawBox(pdf, {
    left: noteLeft,
    top: PAGE.top,
    width: RECEIPT_NOTE_WIDTH,
    height: RECEIPT_HEIGHT,
  });
  drawLines(pdf, {
    lines: ["NF-e", `Nº ${presentation.noteNumber}`, `SÉRIE ${presentation.noteSeries}`],
    left: noteLeft + RECEIPT_NOTE_WIDTH / 2,
    top: PAGE.top + 1.5,
    style: { size: 10, isBold: true },
    align: "center",
  });
  drawDashedRule(pdf, {
    left: PAGE.left,
    right: PAGE.left + CONTENT_WIDTH,
    top: PAGE.top + RECEIPT_HEIGHT + 2,
  });
}

function drawHeader(sheet: Sheet, top: number) {
  const { pdf, presentation } = sheet;
  const issuerBox = { left: PAGE.left, top, width: HEADER_WIDTHS.issuer, height: HEADER_HEIGHT };
  const nameLines = wrapText(pdf, {
    text: presentation.issuerName,
    width: issuerBox.width - 4,
    style: { size: 12, isBold: true },
  });

  drawBox(pdf, issuerBox);
  drawLines(pdf, {
    lines: nameLines.slice(0, 2),
    left: issuerBox.left + issuerBox.width / 2,
    top: top + 6,
    style: { size: 12, isBold: true },
    align: "center",
  });
  drawLines(pdf, {
    lines: presentation.issuerAddress,
    left: issuerBox.left + issuerBox.width / 2,
    top: top + 20,
    style: { size: 8, isBold: true },
    align: "center",
  });
  drawDanfeBox(sheet, top);
  drawAccessKeyBoxes(sheet, top);
}

function drawDanfeBox(sheet: Sheet, top: number) {
  const { pdf, presentation, sheetNumber, sheetCount } = sheet;
  const left = PAGE.left + HEADER_WIDTHS.issuer;
  const center = left + HEADER_WIDTHS.danfe / 2;

  drawBox(pdf, { left, top, width: HEADER_WIDTHS.danfe, height: HEADER_HEIGHT });
  drawLines(pdf, {
    lines: ["DANFE"],
    left: center,
    top: top + 1,
    style: { size: 12, isBold: true },
    align: "center",
  });
  drawLines(pdf, {
    lines: ["DOCUMENTO AUXILIAR DA", "NOTA FISCAL ELETRÔNICA"],
    left: center,
    top: top + 6.5,
    style: { size: 8 },
    align: "center",
  });
  drawLines(pdf, {
    lines: ["0 - ENTRADA", "1 - SAÍDA"],
    left: left + 4,
    top: top + 14,
    style: { size: 8 },
  });
  drawBox(pdf, { left: left + HEADER_WIDTHS.danfe - 8, top: top + 15.5, width: 5, height: 5 });
  drawLines(pdf, {
    lines: [presentation.operationType],
    left: left + HEADER_WIDTHS.danfe - 5.5,
    top: top + 15.4,
    style: { size: 10, isBold: true },
    align: "center",
  });
  drawLines(pdf, {
    lines: [
      `Nº ${presentation.noteNumber}`,
      `SÉRIE ${presentation.noteSeries}`,
      `FOLHA ${sheetNumber}/${sheetCount}`,
    ],
    left: center,
    top: top + 23,
    style: { size: 10, isBold: true },
    align: "center",
  });
}

function drawAccessKeyBoxes(sheet: Sheet, top: number) {
  const { pdf, presentation } = sheet;
  const left = PAGE.left + HEADER_WIDTHS.issuer + HEADER_WIDTHS.danfe;
  const width = CONTENT_WIDTH - HEADER_WIDTHS.issuer - HEADER_WIDTHS.danfe;
  const keyTop = top + KEY_BOX_HEIGHTS.barcode;
  const lookupTop = keyTop + KEY_BOX_HEIGHTS.key;
  const lookupLines = wrapText(pdf, {
    text: presentation.lookupNote,
    width: width - 6,
    style: { size: 8 },
  });

  drawBox(pdf, { left, top, width, height: KEY_BOX_HEIGHTS.barcode });
  drawAccessKeyBarcode(pdf, {
    box: { left: left + 2, top: top + 2.4, width: width - 4, height: 10 },
    accessKey: presentation.accessKey,
  });
  drawFieldRow(pdf, {
    box: { left, top: keyTop, width, height: KEY_BOX_HEIGHTS.key },
    fields: [{ label: "CHAVE DE ACESSO", value: "", span: 1 }],
  });
  drawLines(pdf, {
    lines: [presentation.accessKeyText],
    left: left + width / 2,
    top: keyTop + 3.2,
    style: { size: 8.5, isBold: true },
    align: "center",
  });
  drawBox(pdf, {
    left,
    top: lookupTop,
    width,
    height: HEADER_HEIGHT - KEY_BOX_HEIGHTS.barcode - KEY_BOX_HEIGHTS.key,
  });
  drawLines(pdf, {
    lines: lookupLines,
    left: left + width / 2,
    top: lookupTop + 3,
    style: { size: 8 },
    align: "center",
  });
}

function drawProducts(pdf: JsPdf, table: { rows: DanfeProductRow[]; top: number; bottom: number }) {
  const { rows, top, bottom } = table;
  const headerTop = top - PRODUCT_HEADER_HEIGHT;

  drawBlockTitle(pdf, {
    left: PAGE.left,
    top: headerTop - TITLE_HEIGHT,
    title: "DADOS DOS PRODUTOS / SERVIÇOS",
  });
  drawProductColumns(pdf, { headerTop, bottom });
  rows.reduce((rowTop, product) => drawProductRow(pdf, { product, top: rowTop }), top);
}

function drawProductColumns(pdf: JsPdf, frame: { headerTop: number; bottom: number }) {
  const { headerTop, bottom } = frame;
  let left = PAGE.left;

  for (const column of PRODUCT_COLUMNS) {
    const titleLines = wrapText(pdf, {
      text: column.title,
      width: column.width - 1.6,
      style: PRODUCT_TITLE_STYLE,
    });

    drawBox(pdf, { left, top: headerTop, width: column.width, height: bottom - headerTop });
    drawBox(pdf, { left, top: headerTop, width: column.width, height: PRODUCT_HEADER_HEIGHT });
    drawLines(pdf, {
      lines: titleLines,
      left: left + column.width / 2,
      top: headerTop + 0.3,
      style: PRODUCT_TITLE_STYLE,
      align: "center",
    });
    left += column.width;
  }
}

// why: Anexo II 3.1.7 asks for a divider between items printed on more than one line.
function drawProductRow(pdf: JsPdf, placement: { product: DanfeProductRow; top: number }) {
  const { product, top } = placement;
  const descriptionLines = wrapDescription(pdf, product);
  const cells = [
    [...descriptionLines, product.codes],
    product.cstCfop,
    product.quantityUnit,
    [product.unitPrice],
    [product.totalPrice],
    product.bases,
    product.rates,
    product.amounts,
  ];
  let left = PAGE.left;

  PRODUCT_COLUMNS.forEach((column, position) => {
    const isRight = column.align === "right";

    drawLines(pdf, {
      lines: cells[position] ?? [],
      left: isRight ? left + column.width - PRODUCT_PADDING : left + PRODUCT_PADDING,
      top: top + PRODUCT_PADDING,
      style: PRODUCT_STYLE,
      align: column.align,
      fitWidth: column.width - 2 * PRODUCT_PADDING,
    });
    left += column.width;
  });

  const nextTop = top + measureProduct(pdf, product);

  drawDashedRule(pdf, { left: PAGE.left, right: PAGE.left + CONTENT_WIDTH, top: nextTop });
  return nextTop;
}

function drawAdditionalInformation(pdf: JsPdf, text: string) {
  const boxTop = ADDITIONAL_TOP + TITLE_HEIGHT;
  const informationWidth = CONTENT_WIDTH - FISCO_WIDTH;
  const maxLines = Math.floor((ADDITIONAL_HEIGHT - 4) / lineHeight(7));
  const lines = wrapText(pdf, { text, width: informationWidth - 2, style: { size: 7 } });

  // why: the additional information is fixed text today; a longer one must not vanish unseen.
  if (lines.length > maxLines) {
    throw new Error(
      `DANFE additional information takes ${lines.length} lines; its box holds ${maxLines}.`,
    );
  }

  drawBlockTitle(pdf, { left: PAGE.left, top: ADDITIONAL_TOP, title: "DADOS ADICIONAIS" });
  drawFieldRow(pdf, {
    box: { left: PAGE.left, top: boxTop, width: CONTENT_WIDTH, height: ADDITIONAL_HEIGHT },
    fields: [
      { label: "INFORMAÇÕES COMPLEMENTARES", value: "", span: informationWidth },
      { label: "RESERVADO AO FISCO", value: "", span: FISCO_WIDTH },
    ],
  });
  drawLines(pdf, { lines, left: PAGE.left + 1, top: boxTop + 3, style: { size: 7 } });
}

export { drawDanfe, renderDanfePdf };
