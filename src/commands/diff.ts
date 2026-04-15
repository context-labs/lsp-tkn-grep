import { Command } from "commander";
import type { SymbolInfo } from "../types/symbol.ts";
import type { CallGraph, GraphNode, GraphEdge } from "../types/graph.ts";
import type {
  DiffResult,
  SymbolDiffResult,
  GraphDiffResult,
} from "../types/diff.ts";
import { formatDiffHuman } from "../output/formatter.ts";

interface LsptknsOutput {
  command: string;
  results: unknown;
}

function symbolKey(s: SymbolInfo): string {
  return `${s.location.file}::${s.name}::${s.kindName}`;
}

function flattenSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
  const result: SymbolInfo[] = [];
  for (const s of symbols) {
    result.push(s);
    if (s.children) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}

function diffSymbols(a: SymbolInfo[], b: SymbolInfo[]): SymbolDiffResult {
  const flatA = flattenSymbols(a);
  const flatB = flattenSymbols(b);

  const mapA = new Map(flatA.map((s) => [symbolKey(s), s]));
  const mapB = new Map(flatB.map((s) => [symbolKey(s), s]));

  const added: SymbolInfo[] = [];
  const removed: SymbolInfo[] = [];
  const modified: { before: SymbolInfo; after: SymbolInfo }[] = [];

  for (const [key, sym] of mapB) {
    if (!mapA.has(key)) {
      added.push(sym);
    }
  }

  for (const [key, sym] of mapA) {
    if (!mapB.has(key)) {
      removed.push(sym);
    } else {
      const other = mapB.get(key)!;
      // Check if location changed (same symbol, different position)
      if (
        sym.location.line !== other.location.line ||
        sym.location.col !== other.location.col ||
        sym.location.endLine !== other.location.endLine ||
        sym.location.endCol !== other.location.endCol
      ) {
        modified.push({ before: sym, after: other });
      }
    }
  }

  return { added, removed, modified };
}

function nodeKey(n: GraphNode): string {
  return n.id;
}

function edgeKey(e: GraphEdge): string {
  return `${e.from}->${e.to}::${e.kind}`;
}

function diffGraph(a: CallGraph, b: CallGraph): GraphDiffResult {
  const nodesA = new Map(a.nodes.map((n) => [nodeKey(n), n]));
  const nodesB = new Map(b.nodes.map((n) => [nodeKey(n), n]));
  const edgesA = new Map(a.edges.map((e) => [edgeKey(e), e]));
  const edgesB = new Map(b.edges.map((e) => [edgeKey(e), e]));

  const addedNodes = b.nodes.filter((n) => !nodesA.has(nodeKey(n)));
  const removedNodes = a.nodes.filter((n) => !nodesB.has(nodeKey(n)));
  const modifiedNodes: { before: GraphNode; after: GraphNode }[] = [];

  for (const [key, node] of nodesB) {
    if (nodesA.has(key)) {
      const other = nodesA.get(key)!;
      if (
        node.symbol.location.line !== other.symbol.location.line ||
        node.symbol.location.endLine !== other.symbol.location.endLine
      ) {
        modifiedNodes.push({ before: other, after: node });
      }
    }
  }

  const addedEdges = b.edges.filter((e) => !edgesA.has(edgeKey(e)));
  const removedEdges = a.edges.filter((e) => !edgesB.has(edgeKey(e)));

  return { addedNodes, removedNodes, modifiedNodes, addedEdges, removedEdges };
}

export const diffCommand = new Command("diff")
  .description("Diff two lsptkns JSON outputs (from symbols or graph commands)")
  .argument("<file-a>", "Path to the first JSON file (before)")
  .argument("<file-b>", "Path to the second JSON file (after)")
  .option("--format <format>", "Output format: json or human", "json")
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns symbols -w . -l typescript > before.json
  $ # ... make changes ...
  $ lsptkns symbols -w . -l typescript > after.json
  $ lsptkns diff before.json after.json
  $ lsptkns diff before.json after.json --format human

  $ lsptkns graph -w . -l typescript > graph-v1.json
  $ lsptkns graph -w . -l typescript > graph-v2.json
  $ lsptkns diff graph-v1.json graph-v2.json`
  )
  .action(async (fileA: string, fileB: string, opts) => {
    const start = performance.now();

    const [contentA, contentB] = await Promise.all([
      Bun.file(fileA).json() as Promise<LsptknsOutput>,
      Bun.file(fileB).json() as Promise<LsptknsOutput>,
    ]);

    if (contentA.command !== contentB.command) {
      throw new Error(
        `Cannot diff outputs from different commands: "${contentA.command}" vs "${contentB.command}"`
      );
    }

    let result: DiffResult;

    if (contentA.command === "symbols") {
      const diff = diffSymbols(
        contentA.results as SymbolInfo[],
        contentB.results as SymbolInfo[]
      );
      result = { type: "symbols", diff };
    } else if (contentA.command === "graph") {
      const diff = diffGraph(
        contentA.results as CallGraph,
        contentB.results as CallGraph
      );
      result = { type: "graph", diff };
    } else {
      throw new Error(
        `Diff is only supported for "symbols" and "graph" outputs, got "${contentA.command}".`
      );
    }

    const duration = Math.round(performance.now() - start);

    if (opts.format === "human") {
      console.log(formatDiffHuman(result));
    } else {
      console.log(
        JSON.stringify(
          {
            command: "diff",
            inputCommand: contentA.command,
            fileA,
            fileB,
            results: result.diff,
            meta: { duration_ms: duration },
          },
          null,
          2
        )
      );
    }
  });
