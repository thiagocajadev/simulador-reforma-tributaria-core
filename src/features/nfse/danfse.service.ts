// Renders the DANFSe on demand. The renderer and jsPDF load through import(), so the first visit
// never downloads them; a failed chunk load or drawing error becomes a value, not an exception.

import type { NfseDocument } from "./nfse.document.ts";

type DanfseRendering = { isSuccess: true; bytes: ArrayBuffer } | { isSuccess: false };

async function generateDanfsePdf(nfseDocument: NfseDocument) {
  try {
    const [{ presentDanfse }, { renderDanfsePdf }] = await Promise.all([
      import("./danfse.present.ts"),
      import("./danfse.render.ts"),
    ]);
    const rendering: DanfseRendering = {
      isSuccess: true,
      bytes: renderDanfsePdf(presentDanfse(nfseDocument)),
    };
    return rendering;
  } catch (error) {
    console.error(JSON.stringify({ event: "danfse.render_failed", message: String(error) }));

    const failure: DanfseRendering = { isSuccess: false };
    return failure;
  }
}

export { generateDanfsePdf };
