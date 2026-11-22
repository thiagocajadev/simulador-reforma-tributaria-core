// Writes fiscal document XML from a tree of nodes: two-space indent, one element per line, text and
// attribute values escaped. Shared by the NFS-e and NF-e writers; XML tag names stay in those files.

interface XmlNode {
  name: string;
  attributes?: Record<string, string>;
  content: string | XmlNode[];
}

const INDENT = "  ";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function writeXmlDocument(root: XmlNode) {
  const xml = `${XML_DECLARATION}\n${serializeNode(root, 0)}\n`;
  return xml;
}

function xmlNode(name: string, content: XmlNode["content"], attributes?: Record<string, string>) {
  const node: XmlNode = attributes ? { name, attributes, content } : { name, content };
  return node;
}

function serializeNode(node: XmlNode, depth: number): string {
  const indent = INDENT.repeat(depth);
  const attributes = Object.entries(node.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join("");
  const openTag = `<${node.name}${attributes}>`;
  const closeTag = `</${node.name}>`;

  if (typeof node.content === "string") {
    const leaf = `${indent}${openTag}${escapeXml(node.content)}${closeTag}`;
    return leaf;
  }

  const children = node.content.map((child) => serializeNode(child, depth + 1)).join("\n");
  const branch = `${indent}${openTag}\n${children}\n${indent}${closeTag}`;
  return branch;
}

function escapeXml(text: string) {
  const escaped = text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
  return escaped;
}

export type { XmlNode };
export { writeXmlDocument, xmlNode };
