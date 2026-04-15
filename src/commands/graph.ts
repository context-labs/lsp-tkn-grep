import { Command } from "commander";
import path from "node:path";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { symbolKindName, type SymbolInfo } from "../types/symbol.ts";
import { getServerConfig } from "../lsp/servers.ts";
import { disambiguate } from "../utils/disambiguate.ts";
import { fileUri, uriToPath, walkFiles } from "../utils/files.ts";
import { buildCallGraph } from "../graph/builder.ts";
import { toDot } from "../graph/output.ts";
import { outputJson } from "../output/json.ts";
import { formatGraphHuman } from "../output/formatter.ts";

interface WorkspaceSymbolResult {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  containerName?: string;
}

function toSymbolInfo(raw: WorkspaceSymbolResult, workDir: string): SymbolInfo {
  const filePath = uriToPath(raw.location.uri);
  const relativePath = filePath.startsWith(workDir)
    ? filePath.slice(workDir.length + 1)
    : filePath;

  return {
    name: raw.name,
    kind: raw.kind,
    kindName: symbolKindName(raw.kind),
    location: {
      file: relativePath,
      line: raw.location.range.start.line + 1,
      col: raw.location.range.start.character + 1,
      endLine: raw.location.range.end.line + 1,
      endCol: raw.location.range.end.character + 1,
    },
    containerName: raw.containerName,
  };
}

interface DocSymbol {
  name: string;
  kind: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: DocSymbol[];
}

function findDocSymbol(
  symbols: DocSymbol[],
  name: string,
  line: number
): DocSymbol | undefined {
  for (const s of symbols) {
    if (s.name === name && s.range.start.line === line) return s;
    if (s.children) {
      const found = findDocSymbol(s.children, name, line);
      if (found) return found;
    }
  }
  return undefined;
}

export const graphCommand = new Command("graph")
  .description("Generate a call graph showing how symbols interact")
  .requiredOption("-w, --work-dir <dir>", "Project root directory", ".")
  .requiredOption("-l, --language <lang>", "Language (typescript, python, elixir)")
  .option("-e, --entry <symbol>", "Entry point symbol to start graph from")
  .option("-d, --depth <n>", "Max traversal depth", "3")
  .option("-o, --out-dir <dir>", "Output directory for graph files")
  .option("-f, --file <path>", "Filter entry symbol to a specific file")
  .option("-k, --kind <kind>", "Filter entry symbol by kind")
  .option("--server-path <path>", "Override LSP server binary path")
  .option("--format <format>", "Output format: json, dot, or human", "json")
  .option("--verbose", "Enable verbose LSP logging", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns graph --work-dir ./my-project --language typescript
  $ lsptkns graph -w . -l typescript --entry "handleRequest" --depth 5
  $ lsptkns graph -w . -l python --format dot > callgraph.dot
  $ lsptkns graph -w . -l typescript --format dot | dot -Tsvg -o graph.svg`
  )
  .action(async (opts) => {
    const start = performance.now();
    const workDir = path.resolve(opts.workDir);
    const maxDepth = parseInt(opts.depth, 10);
    const client = await createSession({
      workDir: opts.workDir,
      language: opts.language,
      serverPath: opts.serverPath,
      verbose: opts.verbose,
    });

    try {
      let entryItems: unknown[] = [];

      if (opts.entry) {
        // Find the specific entry symbol
        const rawResults = (await client.workspaceSymbol(opts.entry)) as WorkspaceSymbolResult[];
        const symbols = rawResults.map((r) => toSymbolInfo(r, workDir));
        const target = disambiguate(symbols, opts.entry, {
          file: opts.file,
          kind: opts.kind,
        });

        const targetUri = fileUri(path.join(workDir, target.location.file));
        const fileText = await Bun.file(path.join(workDir, target.location.file)).text();
        client.didOpen(targetUri, opts.language, fileText);
        await new Promise((r) => setTimeout(r, 500));

        // Use documentSymbol to get selectionRange (the name position),
        // which is what prepareCallHierarchy needs
        const docSyms = (await client.documentSymbol(targetUri)) as DocSymbol[];
        const match = findDocSymbol(docSyms, target.name, target.location.line - 1);
        if (match) {
          entryItems = await client.prepareCallHierarchy(
            targetUri,
            match.selectionRange.start.line,
            match.selectionRange.start.character
          );
        }
        client.didClose(targetUri);
      } else {
        // Discover all functions/methods and use them as entry points
        const config = getServerConfig(opts.language);
        const files = await walkFiles(workDir, config.extensions);

        for (const filePath of files) {
          const uri = fileUri(filePath);
          const text = await Bun.file(filePath).text();
          client.didOpen(uri, opts.language, text);

          const docSymbols = (await client.documentSymbol(uri)) as Array<{
            name: string;
            kind: number;
            selectionRange: { start: { line: number; character: number } };
            children?: Array<{
              name: string;
              kind: number;
              selectionRange: { start: { line: number; character: number } };
            }>;
          }>;

          // Collect functions and methods
          const functionKinds = [6, 12]; // Method = 6, Function = 12
          for (const sym of docSymbols) {
            if (functionKinds.includes(sym.kind)) {
              const items = await client.prepareCallHierarchy(
                uri,
                sym.selectionRange.start.line,
                sym.selectionRange.start.character
              );
              entryItems.push(...items);
            }
            if (sym.children) {
              for (const child of sym.children) {
                if (functionKinds.includes(child.kind)) {
                  const items = await client.prepareCallHierarchy(
                    uri,
                    child.selectionRange.start.line,
                    child.selectionRange.start.character
                  );
                  entryItems.push(...items);
                }
              }
            }
          }

          client.didClose(uri);
        }
      }

      if (entryItems.length === 0) {
        if (opts.format === "human") {
          console.log("No callable symbols found to build graph from.");
        } else if (opts.format === "dot") {
          console.log(toDot({ nodes: [], edges: [] }));
        } else {
          outputJson({
            command: "graph",
            workDir: opts.workDir,
            language: opts.language,
            results: { nodes: [], edges: [] },
            meta: { duration_ms: Math.round(performance.now() - start) },
          });
        }
        return;
      }

      const graph = await buildCallGraph(client, entryItems as any, maxDepth);
      const duration = Math.round(performance.now() - start);

      if (opts.format === "dot") {
        const dotOutput = toDot(graph);
        if (opts.outDir) {
          const outPath = path.join(opts.outDir, "callgraph.dot");
          await Bun.write(outPath, dotOutput);
          console.error(`Written to ${outPath}`);
        } else {
          console.log(dotOutput);
        }
      } else if (opts.format === "human") {
        console.log(formatGraphHuman(graph));
      } else {
        const output = {
          command: "graph",
          workDir: opts.workDir,
          language: opts.language,
          results: graph,
          meta: { duration_ms: duration },
        };
        if (opts.outDir) {
          const outPath = path.join(opts.outDir, "callgraph.json");
          await Bun.write(outPath, JSON.stringify(output, null, 2));
          console.error(`Written to ${outPath}`);
        } else {
          outputJson(output);
        }
      }
    } finally {
      await destroySession(client);
    }
  });
