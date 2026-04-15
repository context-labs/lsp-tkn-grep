import type { SymbolInfo } from "./symbol.ts";

export interface GraphNode {
  id: string;
  symbol: SymbolInfo;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "calls" | "references";
}

export interface CallGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
