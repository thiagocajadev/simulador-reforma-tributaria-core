import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyXmlSchema } from "./xml.validation.service.ts";

const schema = vi.hoisted(() => ({ checkXmlAgainstSchema: vi.fn() }));

vi.mock("./xml.schema.ts", () => ({ checkXmlAgainstSchema: schema.checkXmlAgainstSchema }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("verifyXmlSchema", () => {
  it("returns the schema check when the validator runs", async () => {
    schema.checkXmlAgainstSchema.mockResolvedValue({ isValid: true });

    const expected = { isAvailable: true, check: { isValid: true } };
    const actual = await verifyXmlSchema({ xml: "<NFe/>", kind: "nfe" });

    expect(actual).toStrictEqual(expected);
  });

  it("turns a validator that fails to load or crashes into unavailable, and logs it once", async () => {
    schema.checkXmlAgainstSchema.mockRejectedValue(new Error("worker failed"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const expected = { verdict: { isAvailable: false }, logged: 1 };
    const verdict = await verifyXmlSchema({ xml: "<NFe/>", kind: "nfe" });
    const actual = { verdict, logged: logError.mock.calls.length };

    expect(actual).toStrictEqual(expected);
  });
});
