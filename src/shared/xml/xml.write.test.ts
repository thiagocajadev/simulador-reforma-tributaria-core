import { describe, expect, it } from "vitest";
import { writeXmlDocument, xmlNode } from "./xml.write.ts";

describe("writeXmlDocument", () => {
  it("writes the declaration, two-space indents and one element per line", () => {
    const root = xmlNode("nota", [xmlNode("valor", "10.00")], { versao: "1.00" });

    const expected =
      '<?xml version="1.0" encoding="UTF-8"?>\n<nota versao="1.00">\n  <valor>10.00</valor>\n</nota>\n';
    const actual = writeXmlDocument(root);

    expect(actual).toBe(expected);
  });

  it("escapes text and attribute values", () => {
    const root = xmlNode("texto", `Arroz & "feijão" <1kg>`, { titulo: "D'Ávila" });

    const expectedLine = `<texto titulo="D&apos;Ávila">Arroz &amp; &quot;feijão&quot; &lt;1kg&gt;</texto>`;
    const actualLine = writeXmlDocument(root).split("\n")[1];

    expect(actualLine).toBe(expectedLine);
  });
});
