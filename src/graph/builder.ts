import type { LspTknsClient } from "../lsp/client.ts";
import type { CallGraph, GraphEdge, GraphNode } from "../types/graph.ts";
import type { SymbolInfo } from "../types/symbol.ts";
import { symbolKindName } from "../types/symbol.ts";
import { uriToPath } from "../utils/files.ts";

interface CallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
}

interface OutgoingCall {
  to: CallHierarchyItem;
  fromRanges: unknown[];
}

function nodeId(item: CallHierarchyItem): string {
  const file = uriToPath(item.uri);
  return `${file}:${item.name}`;
}

function itemToSymbolInfo(item: CallHierarchyItem): SymbolInfo {
  return {
    name: item.name,
    kind: item.kind,
    kindName: symbolKindName(item.kind),
    location: {
      file: uriToPath(item.uri),
      line: item.selectionRange.start.line + 1,
      col: item.selectionRange.start.character + 1,
      endLine: item.range.end.line + 1,
      endCol: item.range.end.character + 1,
    },
  };
}

export async function buildCallGraph(
  client: LspTknsClient,
  entryItems: CallHierarchyItem[],
  maxDepth: number = 3
): Promise<CallGraph> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  async function traverse(item: CallHierarchyItem, depth: number) {
    const id = nodeId(item);
    if (visited.has(id) || depth > maxDepth) return;
    visited.add(id);

    if (!nodes.has(id)) {
      nodes.set(id, { id, symbol: itemToSymbolInfo(item) });
    }

    const outgoing = (await client.outgoingCalls(item)) as OutgoingCall[];

    for (const call of outgoing) {
      const toId = nodeId(call.to);

      if (!nodes.has(toId)) {
        nodes.set(toId, { id: toId, symbol: itemToSymbolInfo(call.to) });
      }

      edges.push({ from: id, to: toId, kind: "calls" });
      await traverse(call.to, depth + 1);
    }
  }

  for (const item of entryItems) {
    await traverse(item, 0);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}
