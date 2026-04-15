import type { SymbolInfo } from "./symbol.ts";
import type { GraphEdge, GraphNode } from "./graph.ts";

export interface SymbolDiffResult {
  added: SymbolInfo[];
  removed: SymbolInfo[];
  modified: { before: SymbolInfo; after: SymbolInfo }[];
}

export interface GraphDiffResult {
  addedNodes: GraphNode[];
  removedNodes: GraphNode[];
  modifiedNodes: { before: GraphNode; after: GraphNode }[];
  addedEdges: GraphEdge[];
  removedEdges: GraphEdge[];
}

export type DiffResult =
  | { type: "symbols"; diff: SymbolDiffResult }
  | { type: "graph"; diff: GraphDiffResult };
