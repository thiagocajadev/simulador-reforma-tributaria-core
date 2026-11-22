// The light diagonal "SIMULAÇÃO · SEM VALOR FISCAL" under every page of a simulated fiscal PDF, so the
// document never passes for a real one. Drawn first on a page, so every field prints over it.
// Imported only by the renderers, which load through import(), keeping jsPDF out of the first visit.

import type { jsPDF as JsPdf } from "jspdf";

interface WatermarkPage {
  width: number;
  height: number;
  fontFamily: "helvetica" | "times";
}

const WATERMARK_TEXT = "SIMULAÇÃO · SEM VALOR FISCAL";
const WATERMARK_SIZE = 46;
const WATERMARK_COLOR = [228, 228, 233] as const;

function drawSimulationWatermark(pdf: JsPdf, page: WatermarkPage) {
  // why: along the page diagonal, from the bottom left corner to the top right one.
  const angle = (Math.atan2(page.height, page.width) * 180) / Math.PI;
  const radians = (angle * Math.PI) / 180;

  pdf.setFont(page.fontFamily, "bold");
  pdf.setFontSize(WATERMARK_SIZE);
  pdf.setTextColor(...WATERMARK_COLOR);

  const halfWidth = pdf.getTextWidth(WATERMARK_TEXT) / 2;
  const start = {
    x: page.width / 2 - halfWidth * Math.cos(radians),
    y: page.height / 2 + halfWidth * Math.sin(radians),
  };

  pdf.text(WATERMARK_TEXT, start.x, start.y, { angle });
}

export { drawSimulationWatermark, WATERMARK_TEXT };
