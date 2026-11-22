import { describe, expect, it } from "vitest";
import { createApiApp } from "@/worker/index.ts";
import { version } from "../../../package.json";
import { OPENAPI_DOCUMENT } from "./openapi.document.ts";

const IGNORED_METHODS = new Set(["ALL"]);

// why: Hono lists a route mounted at "/" under its prefix, sometimes with a trailing slash.
function listApiOperations() {
  const app = createApiApp();
  const operations = app.routes
    .filter((route) => !IGNORED_METHODS.has(route.method))
    .map((route) => `${route.method.toLowerCase()} ${route.path.replace(/\/$/, "")}`);
  const uniqueOperations = [...new Set(operations)].sort();
  return uniqueOperations;
}

function listDocumentedOperations() {
  const operations = Object.entries(OPENAPI_DOCUMENT.paths).flatMap(([path, pathItem]) =>
    Object.keys(pathItem).map((method) => `${method} ${path}`),
  );
  const sortedOperations = operations.sort();
  return sortedOperations;
}

describe("GET /api/openapi.json", () => {
  it("answers the OpenAPI document, bare, with the app version", async () => {
    const app = createApiApp();

    const expectedStatus = 200;
    const expectedOpenApi = "3.1.0";
    const expectedVersion = version;
    const actual = await app.request("/api/openapi.json");
    const actualStatus = actual.status;
    const actualBody = (await actual.json()) as typeof OPENAPI_DOCUMENT;
    const actualOpenApi = actualBody.openapi;
    const actualVersion = actualBody.info.version;

    expect(actualStatus).toBe(expectedStatus);
    expect(actualOpenApi).toBe(expectedOpenApi);
    expect(actualVersion).toBe(expectedVersion);
  });
});

describe("the OpenAPI document across origins", () => {
  it("opens the document to every origin and keeps the data routes same-origin", async () => {
    const app = createApiApp();
    const documentReply = await app.request("/api/openapi.json");
    const healthReply = await app.request("/api/health");

    const expected = {
      documentOrigin: "*",
      documentPolicy: "cross-origin",
      healthOrigin: null,
      healthPolicy: "same-origin",
    };
    const actual = {
      documentOrigin: documentReply.headers.get("access-control-allow-origin"),
      documentPolicy: documentReply.headers.get("cross-origin-resource-policy"),
      healthOrigin: healthReply.headers.get("access-control-allow-origin"),
      healthPolicy: healthReply.headers.get("cross-origin-resource-policy"),
    };

    expect(actual).toStrictEqual(expected);
  });
});

describe("OPENAPI_DOCUMENT", () => {
  it("describes every route the Worker serves, and no other", () => {
    const expected = listApiOperations();
    const actual = listDocumentedOperations();

    expect(actual).toStrictEqual(expected);
  });

  it("resolves every $ref it holds", () => {
    const serialized = JSON.stringify(OPENAPI_DOCUMENT);
    const references = [...serialized.matchAll(/"\$ref":"#\/components\/(\w+)\/(\w+)"/g)];
    const components = OPENAPI_DOCUMENT.components as Record<string, Record<string, unknown>>;

    const expected: string[] = [];
    const actual = references
      .map(([, group, name]) => `${group}/${name}`)
      .filter((pointer) => {
        const [group = "", name = ""] = pointer.split("/");
        const isResolved = components[group]?.[name] !== undefined;
        return !isResolved;
      });

    expect(actual).toStrictEqual(expected);
  });

  it("gives every operation a unique operationId", () => {
    const operationIds = Object.values(OPENAPI_DOCUMENT.paths).flatMap((pathItem) =>
      Object.values(pathItem).map((operation) => operation.operationId),
    );

    const expected = operationIds.length;
    const actual = new Set(operationIds).size;

    expect(actual).toBe(expected);
  });
});
