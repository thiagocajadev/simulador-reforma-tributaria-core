import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const SOURCE_DIRECTORY = path.resolve(import.meta.dirname, "src");
const ROUTE_TESTS = "src/features/**/*.route.test.ts";
const D1_TESTS = "src/features/**/*.d1.test.ts";
const DOM_TESTS = "{src,playground}/**/*.dom.test.ts";

export default defineConfig({
  resolve: {
    alias: { "@": SOURCE_DIRECTORY },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: [ROUTE_TESTS, D1_TESTS, DOM_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "happy-dom",
          include: [DOM_TESTS],
        },
      },
      {
        extends: true,
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: {
          name: "workers",
          include: [ROUTE_TESTS, D1_TESTS],
          globalSetup: ["scripts/open-data/open-data.provide.ts"],
        },
      },
    ],
  },
});
