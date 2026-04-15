import type { SymbolInfo } from "../types/symbol.ts";
import type { CallGraph } from "../types/graph.ts";
import type { DiffResult } from "../types/diff.ts";

export function formatSymbolsHuman(symbols: SymbolInfo[]): string {
  if (symbols.length === 0) return "No symbols found.";

  const lines = symbols.map((s) => {
    const loc = `${s.location.file}:${s.location.line}:${s.location.col}`;
    const kind = s.kindName.padEnd(14);
    const container = s.containerName ? ` (in ${s.containerName})` : "";
    return `  ${loc}  ${kind}  ${s.name}${container}`;
  });

  return `Found ${symbols.length} symbol(s):\n${lines.join("\n")}`;
}

export function formatGraphHuman(graph: CallGraph): string {
  if (graph.nodes.length === 0) return "No symbols in graph.";

  const lines: string[] = [];
  lines.push(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  lines.push("");

  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} --[${edge.kind}]--> ${edge.to}`);
  }

  if (graph.edges.length === 0) {
    lines.push("  (no edges)");
  }

  return lines.join("\n");
}

export function formatDiffHuman(diff: DiffResult): string {
  const lines: string[] = [];

  if (diff.type === "symbols") {
    const { added, removed, modified } = diff.diff;
    lines.push(`Symbol diff: +${added.length} added, -${removed.length} removed, ~${modified.length} modified`);
    lines.push("");

    for (const s of added) {
      lines.push(`  + ${s.name}  ${s.kindName}  ${s.location.file}:${s.location.line}`);
    }
    for (const s of removed) {
      lines.push(`  - ${s.name}  ${s.kindName}  ${s.location.file}:${s.location.line}`);
    }
    for (const { before, after } of modified) {
      lines.push(`  ~ ${before.name}  ${before.kindName}  ${before.location.file}:${before.location.line} -> ${after.location.file}:${after.location.line}`);
    }
  } else {
    const { addedNodes, removedNodes, addedEdges, removedEdges } = diff.diff;
    lines.push(
      `Graph diff: +${addedNodes.length} nodes, -${removedNodes.length} nodes, +${addedEdges.length} edges, -${removedEdges.length} edges`
    );
    lines.push("");

    for (const n of addedNodes) {
      lines.push(`  + [node] ${n.id}  ${n.symbol.kindName}`);
    }
    for (const n of removedNodes) {
      lines.push(`  - [node] ${n.id}  ${n.symbol.kindName}`);
    }
    for (const e of addedEdges) {
      lines.push(`  + [edge] ${e.from} --> ${e.to}`);
    }
    for (const e of removedEdges) {
      lines.push(`  - [edge] ${e.from} --> ${e.to}`);
    }
  }

  return lines.join("\n");
}
