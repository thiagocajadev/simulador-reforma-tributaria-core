import fileSystem from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { API_SECURITY_HEADERS } from "./security.headers.ts";

const STATIC_HEADERS_FILE = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "public",
  "_headers",
);
const SHARED_HEADERS = ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options"];

function readStaticHeaders() {
  const lines = fileSystem.readFileSync(STATIC_HEADERS_FILE, "utf8").split("\n");
  const entries = lines
    .filter((line) => line.startsWith("  "))
    .map((line) => {
      const separator = line.indexOf(":");
      const entry = [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      return entry;
    });
  const headers: Record<string, string> = Object.fromEntries(entries);
  return headers;
}

describe("security headers", () => {
  it("send the same transport, sniffing and framing rules on the pages and on the API", () => {
    const staticHeaders = readStaticHeaders();

    const expected = SHARED_HEADERS.map((name) => API_SECURITY_HEADERS[name]);
    const actual = SHARED_HEADERS.map((name) => staticHeaders[name]);

    expect(actual).toStrictEqual(expected);
  });

  it("let the pages load scripts, styles and fonts from the site only, and never be framed", () => {
    const policy = readStaticHeaders()["Content-Security-Policy"] ?? "";

    const expectedDirectives = [
      "default-src 'self'",
      "script-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ];
    const actualMissing = expectedDirectives.filter((directive) => !policy.includes(directive));

    expect(actualMissing).toStrictEqual([]);
  });

  it("let the XML validator compile WebAssembly, and never let a script evaluate text as code", () => {
    const policy = readStaticHeaders()["Content-Security-Policy"] ?? "";
    const scriptSources = policy.match(/script-src ([^;]+)/)?.[1]?.split(" ") ?? [];

    const expected = ["'self'", "'wasm-unsafe-eval'"];
    const actual = scriptSources;

    expect(actual).toStrictEqual(expected);
  });
});
