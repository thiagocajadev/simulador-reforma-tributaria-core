// An XML element as an XML viewer draws it: a group with its children, or a field with its
// value. Groups and fields of the NF-e and the NFS-e get a name in Portuguese (xml.labels.ts); any
// other tag shows as it is, so a note from any layout version still reads whole. Pure.

import { describeXmlTag } from "./xml.labels.ts";

interface XmlTreeNode {
  nodeId: string;
  tag: string;
  label: string | null;
  value: string | null;
  attributes: Array<{ name: string; value: string }>;
  children: XmlTreeNode[];
}

// why: an NF-e item (det) repeats; its nItem tells the copies apart in the accordion.
const NUMBERING_ATTRIBUTES = ["nItem"];

function toXmlTree(element: Element, parentId = "") {
  const nodeId = `${parentId}/${element.localName}[${countPreviousSiblings(element)}]`;
  const childElements = [...element.children];
  const text = childElements.length === 0 ? (element.textContent ?? "").trim() : null;
  const node: XmlTreeNode = {
    nodeId,
    tag: element.localName,
    label: describeXmlTag(element.localName, readNumbering(element)),
    value: text,
    attributes: [...element.attributes]
      .filter((attribute) => !attribute.name.startsWith("xmlns"))
      .map((attribute) => ({ name: attribute.name, value: attribute.value })),
    children: childElements.map((child) => toXmlTree(child, nodeId)),
  };
  return node;
}

function countPreviousSiblings(element: Element) {
  let count = 0;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.localName === element.localName) {
      count += 1;
    }

    sibling = sibling.previousElementSibling;
  }

  return count;
}

function readNumbering(element: Element) {
  const numbering =
    NUMBERING_ATTRIBUTES.map((name) => element.getAttribute(name)).find(
      (value) => value !== null,
    ) ?? null;
  return numbering;
}

export type { XmlTreeNode };
export { toXmlTree };
