// The playground page's entry: index.html loads it, and it mounts the page on the document.

import { mountPlayground } from "./playground.page.ts";

function start() {
  mountPlayground(document);
}

start();
