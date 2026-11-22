// The drawing primitives of the DANFE: boxes, block titles, labelled fields in a row, wrapped text
// and the access key barcode. Times throughout, as MOC 7.0 Anexo II 3.7 requires, at its minimum
// sizes. Imported only by danfe.render.ts, which loads through import().

import type { jsPDF as JsPdf } from "jspdf";
import { encodeCode128C } from "./code128.ts";
import type { DanfeField } from "./danfe.present.ts";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TextStyle {
  size: number;
  isBold?: boolean;
}

const FONT_FAMILY = "times";
const POINT_TO_MM = 25.4 / 72;
const LINE_SPACING = 1.15;
const CELL_PADDING = 0.8;
const FIELD_SIZES = { label: 6, value: 10, smallestValue: 7 };
const BLOCK_TITLE_SIZE = 6;
const SMALLEST_PRODUCT_SIZE = 6;
const BARCODE_QUIET_MODULES = 10;
const COLORS = { text: [20, 20, 24] as const, rule: [40, 40, 46] as const };

function setTextStyle(pdf: JsPdf, style: TextStyle) {
  pdf.setFont(FONT_FAMILY, style.isBold ? "bold" : "normal");
  pdf.setFontSize(style.size);
  pdf.setTextColor(...COLORS.text);
}

function lineHeight(size: number) {
  const height = size * POINT_TO_MM * LINE_SPACING;
  return height;
}

function drawBox(pdf: JsPdf, box: Box) {
  pdf.setDrawColor(...COLORS.rule);
  pdf.setLineWidth(0.2);
  pdf.rect(box.left, box.top, box.width, box.height);
}

function drawBlockTitle(pdf: JsPdf, placement: { left: number; top: number; title: string }) {
  setTextStyle(pdf, { size: BLOCK_TITLE_SIZE, isBold: true });
  pdf.text(placement.title.toUpperCase(), placement.left, placement.top + 3);
}

// why: each field's width is its share of the row, weighted by span, as the manual's grid does.
function drawFieldRow(pdf: JsPdf, row: { box: Box; fields: DanfeField[] }) {
  const { box, fields } = row;
  const totalSpan = fields.reduce((sum, danfeField) => sum + danfeField.span, 0);
  let left = box.left;

  for (const danfeField of fields) {
    const width = (box.width * danfeField.span) / totalSpan;

    drawField(pdf, { box: { ...box, left, width }, danfeField });
    left += width;
  }
}

function drawField(pdf: JsPdf, placement: { box: Box; danfeField: DanfeField }) {
  const { box, danfeField } = placement;
  const textLeft = box.left + CELL_PADDING;
  const room = box.width - 2 * CELL_PADDING;

  drawBox(pdf, box);
  setTextStyle(pdf, { size: FIELD_SIZES.label });
  pdf.text(danfeField.label.toUpperCase(), textLeft, box.top + 2.4, { maxWidth: room });

  const valueSize = fitTextSize(pdf, { text: danfeField.value, room, size: FIELD_SIZES.value });

  setTextStyle(pdf, { size: valueSize });
  pdf.text(danfeField.value, textLeft, box.top + box.height - 1.6);
}

// why: a value wider than its cell (a long municipality name) shrinks down to 7 pt instead of
// running into the next field; the fixed values all fit at the 10 pt of Anexo II 3.7.9.
function fitTextSize(pdf: JsPdf, sizing: { text: string; room: number; size: number }) {
  const { text, room, size } = sizing;

  setTextStyle(pdf, { size });

  const width = pdf.getTextWidth(text);
  const fitted = width <= room ? size : Math.max(FIELD_SIZES.smallestValue, (size * room) / width);
  return fitted;
}

function wrapText(pdf: JsPdf, wrapping: { text: string; width: number; style: TextStyle }) {
  setTextStyle(pdf, wrapping.style);

  const lines: string[] = pdf.splitTextToSize(wrapping.text, wrapping.width);
  return lines;
}

function drawLines(
  pdf: JsPdf,
  placement: {
    lines: string[];
    left: number;
    top: number;
    style: TextStyle;
    align?: "left" | "right" | "center";
    fitWidth?: number;
  },
) {
  const { lines, left, top, style, align = "left", fitWidth } = placement;
  const step = lineHeight(style.size);
  const size = fitWidth ? fitLinesSize(pdf, { lines, room: fitWidth, style }) : style.size;

  setTextStyle(pdf, { ...style, size });
  lines.forEach((line, position) => {
    pdf.text(line, left, top + step * (position + 1) - 0.6, { align });
  });
}

// why: a product cell that would run into the next column shrinks, never below the 6 pt of
// Anexo II 3.7.7; the columns already fit the largest amount the form accepts at full size.
function fitLinesSize(pdf: JsPdf, sizing: { lines: string[]; room: number; style: TextStyle }) {
  const { lines, room, style } = sizing;

  setTextStyle(pdf, style);

  const widest = Math.max(0, ...lines.map((line) => pdf.getTextWidth(line)));
  const fitted =
    widest <= room ? style.size : Math.max(SMALLEST_PRODUCT_SIZE, (style.size * room) / widest);
  return fitted;
}

// why: Anexo II 2 asks for at least 6 cm by 0.8 cm, with a quiet zone of 10 modules on each side.
function drawAccessKeyBarcode(pdf: JsPdf, placement: { box: Box; accessKey: string }) {
  const { box, accessKey } = placement;
  const symbols = encodeCode128C(accessKey);
  const moduleWidth = box.width / (symbols.moduleCount + 2 * BARCODE_QUIET_MODULES);
  let left = box.left + BARCODE_QUIET_MODULES * moduleWidth;

  pdf.setFillColor(0, 0, 0);
  symbols.widths.forEach((width, position) => {
    const isBar = position % 2 === 0;

    if (isBar) {
      pdf.rect(left, box.top, width * moduleWidth, box.height, "F");
    }

    left += width * moduleWidth;
  });
}

function drawDashedRule(pdf: JsPdf, rule: { left: number; right: number; top: number }) {
  pdf.setDrawColor(...COLORS.rule);
  pdf.setLineWidth(0.15);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.line(rule.left, rule.top, rule.right, rule.top);
  pdf.setLineDashPattern([], 0);
}

export type { Box, TextStyle };
export {
  drawAccessKeyBarcode,
  drawBlockTitle,
  drawBox,
  drawDashedRule,
  drawFieldRow,
  drawLines,
  lineHeight,
  setTextStyle,
  wrapText,
};
