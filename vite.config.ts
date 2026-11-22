import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const SOURCE_DIRECTORY = path.resolve(import.meta.dirname, "src");

// npm run dev: the Worker (the API under /api) and the local playground page (index.html) in one
// process. The playground is a development tool; nothing here is deployed with it.
export default defineConfig({
  plugins: [cloudflare()],
  resolve: {
    alias: { "@": SOURCE_DIRECTORY },
  },
});
