import { describe, expect, it } from "vitest";
import { OPENAPI_DOCUMENT } from "./openapi.document.ts";
import { listApiOperations, OPERATION_GUIDES } from "./openapi.reference.ts";

describe("OPERATION_GUIDES", () => {
  it("writes the Portuguese copy of every operation the document holds, and of no other", () => {
    const documented = Object.values(OPENAPI_DOCUMENT.paths).flatMap((pathItem) =>
      Object.values(pathItem).map((operation) => operation.operationId),
    );

    const expected = [...documented].sort();
    const actual = Object.keys(OPERATION_GUIDES).sort();

    expect(actual).toStrictEqual(expected);
  });

  it("gives every operation an example on its own path", () => {
    const operations = listApiOperations();

    const expected: string[] = [];
    const actual = operations
      .filter((operation) => !operation.example.startsWith(operation.path))
      .map((operation) => operation.operationId);

    expect(actual).toStrictEqual(expected);
  });
});
