// Hands the visitor a file built in the browser. Nothing leaves the page: the content becomes a
// Blob URL, an anchor clicks it, and the URL is revoked after the browser has taken the file.

// why: revoking in the same task can cancel the download in some browsers.
const REVOKE_DELAY_MILLISECONDS = 1000;

function downloadFile(input: { fileName: string; content: BlobPart; mimeType: string }) {
  const { fileName, content, mimeType } = input;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MILLISECONDS);
}

export { downloadFile };
