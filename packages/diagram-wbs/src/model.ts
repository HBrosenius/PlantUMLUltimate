import type { TreeDocument, TreeNode, TreeNodeInput, TreeRelationship, TreeSide } from "@plantuml-studio/diagram-tree";

export type WbsSide = TreeSide;

export interface WbsNode extends TreeNode {
  alias?: string;
}

export type WbsRelationship = TreeRelationship;

export type WbsDocument = TreeDocument<WbsNode>;

export type WbsNodeInput = TreeNodeInput;
