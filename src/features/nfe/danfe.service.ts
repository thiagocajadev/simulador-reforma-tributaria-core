// Renders the DANFE on demand. The presenter, the renderer and jsPDF load through import(), so the
// first visit never downloads them; a failed chunk load or drawing error becomes a value.

import type { NfeDocument } from "./nfe.document.ts";

type DanfeRendering = { isSuccess: true; bytes: ArrayBuffer } | { isSuccess: false };

async function generateDanfePdf(nfeDocument: NfeDocument) {
  try {
    const [{ presentDanfe }, { renderDanfePdf }] = await Promise.all([
      import("./danfe.present.ts"),
      import("./danfe.render.ts"),
    ]);
    const rendering: DanfeRendering = {
      isSuccess: true,
      bytes: renderDanfePdf(presentDanfe(nfeDocument)),
    };
    return rendering;
  } catch (error) {
    console.error(JSON.stringify({ event: "danfe.render_failed", message: String(error) }));

    const failure: DanfeRendering = { isSuccess: false };
    return failure;
  }
}

export { generateDanfePdf };
