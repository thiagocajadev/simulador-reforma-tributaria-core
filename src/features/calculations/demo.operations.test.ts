import { describe, expect, it } from "vitest";
import { checkSimplesDraft } from "@/features/simples-nacional/simples.draft.ts";
import { DEMO_OPERATIONS, findDemoOperation } from "./demo.operations.ts";
import { checkDraft } from "./operation.draft.ts";

describe("DEMO_OPERATIONS", () => {
  it("passes the form's own checks for every demo operation", () => {
    const expected = DEMO_OPERATIONS.map(() => true);
    const actual = DEMO_OPERATIONS.map((demo) => checkDraft(demo.draft).isValid);

    expect(actual).toStrictEqual(expected);
  });

  it("compares with the Simples Nacional only in the notebook demo", () => {
    const expected = {
      basicFoodBasket: "skipped",
      cigars: "skipped",
      preschool: "skipped",
      simplesNotebook: "ready",
    };
    const actual = Object.fromEntries(
      DEMO_OPERATIONS.map((demo) => {
        const check = checkDraft(demo.draft);
        const simplesKind = check.isValid
          ? checkSimplesDraft(demo.simplesDraft, check.operation, null).kind
          : "invalid";
        return [demo.demoId, simplesKind];
      }),
    );

    expect(actual).toStrictEqual(expected);
  });

  it("finds a demo by its id", () => {
    const expected = "Pré-escola, redução de 60% (NFS-e, 2027)";
    const actual = findDemoOperation("preschool")?.label;

    expect(actual).toBe(expected);
  });
});
