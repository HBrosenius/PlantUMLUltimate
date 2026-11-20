import { parseTree } from "@plantuml-studio/diagram-tree";
import { WBS_DIALECT } from "./dialect";
import type { WbsDocument, WbsNode } from "./model";

let lastSource: string | undefined;
let lastDocument: WbsDocument | undefined;

export function parseWbs(source: string): WbsDocument {
  if (source === lastSource && lastDocument) return lastDocument;
  const document = parseTree<WbsNode>(source, WBS_DIALECT);
  lastSource = source;
  lastDocument = document;
  return document;
}

export function findWbsNodeAt(document: WbsDocument, position: number): WbsNode | undefined {
  return document.nodes.find((node) => position >= node.sourceRange.from && position <= node.sourceRange.to);
}
