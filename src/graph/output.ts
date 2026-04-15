import type { CallGraph } from "../types/graph.ts";

export function toDot(graph: CallGraph): string {
  const lines: string[] = [];
  lines.push("digraph callgraph {");
  lines.push("  rankdir=LR;");
  lines.push('  node [shape=box, style=rounded, fontname="monospace"];');
  lines.push("");

  for (const node of graph.nodes) {
    const label = `${node.symbol.name}\\n(${node.symbol.kindName})`;
    lines.push(`  "${node.id}" [label="${label}"];`);
  }

  lines.push("");

  for (const edge of graph.edges) {
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.kind}"];`);
  }

  lines.push("}");
  return lines.join("\n");
}
