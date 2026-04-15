import { Command } from "commander";
import path from "node:path";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { symbolKindName, type SymbolInfo } from "../types/symbol.ts";
import { disambiguate } from "../utils/disambiguate.ts";
import { fileUri, uriToPath } from "../utils/files.ts";
import { outputJson } from "../output/json.ts";
import { formatSymbolsHuman } from "../output/formatter.ts";

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

interface DocumentSymbolResult {
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
  children?: DocumentSymbolResult[];
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

function docSymbolToInfo(raw: DocumentSymbolResult, relativePath: string): SymbolInfo {
  return {
    name: raw.name,
    kind: raw.kind,
    kindName: symbolKindName(raw.kind),
    location: {
      file: relativePath,
      line: raw.range.start.line + 1,
      col: raw.range.start.character + 1,
      endLine: raw.range.end.line + 1,
      endCol: raw.range.end.character + 1,
    },
    children: raw.children?.map((c) => docSymbolToInfo(c, relativePath)),
  };
}

function findSymbolInTree(
  symbols: SymbolInfo[],
  targetName: string,
  targetLine: number
): SymbolInfo | undefined {
  for (const s of symbols) {
    if (s.name === targetName && s.location.line === targetLine) {
      return s;
    }
    if (s.children) {
      const found = findSymbolInTree(s.children, targetName, targetLine);
      if (found) return found;
    }
  }
  return undefined;
}

export const childrenCommand = new Command("children")
  .description(
    "Get the children/inner code of a symbol (e.g. methods inside a class)"
  )
  .argument("<symbol>", "Symbol name to inspect")
  .requiredOption("-w, --work-dir <dir>", "Project root directory", ".")
  .requiredOption("-l, --language <lang>", "Language (typescript, python, elixir)")
  .option("-f, --file <path>", "Filter symbol lookup to a specific file")
  .option("-k, --kind <kind>", "Filter by symbol kind")
  .option("--source", "Include the raw source code of the symbol", false)
  .option("--server-path <path>", "Override LSP server binary path")
  .option("--format <format>", "Output format: json or human", "json")
  .option("--verbose", "Enable verbose LSP logging", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns children MyClass --work-dir ./my-project --language typescript
  $ lsptkns children "Router" -w . -l elixir --format human
  $ lsptkns children "UserService" -w . -l python --source`
  )
  .action(async (symbol: string, opts) => {
    const start = performance.now();
    const workDir = path.resolve(opts.workDir);
    const client = await createSession({
      workDir: opts.workDir,
      language: opts.language,
      serverPath: opts.serverPath,
      verbose: opts.verbose,
    });

    try {
      // First find the symbol
      const rawResults = (await client.workspaceSymbol(symbol)) as WorkspaceSymbolResult[];
      const symbols = rawResults.map((r) => toSymbolInfo(r, workDir));

      if (symbols.length === 0) {
        throw new Error(`No symbol matching "${symbol}" found.`);
      }

      const target = disambiguate(symbols, symbol, {
        file: opts.file,
        kind: opts.kind,
      });

      // Get document symbols for the file to get the hierarchical tree
      const filePath = path.join(workDir, target.location.file);
      const uri = fileUri(filePath);
      const fileText = await Bun.file(filePath).text();
      client.didOpen(uri, opts.language, fileText);

      const docSymbols = (await client.documentSymbol(uri)) as DocumentSymbolResult[];
      client.didClose(uri);

      const tree = docSymbols.map((ds) => docSymbolToInfo(ds, target.location.file));

      // Find the target in the tree to get its children
      const treeNode = findSymbolInTree(tree, target.name, target.location.line);
      const children = treeNode?.children ?? [];

      // Optionally extract source code
      let source: string | undefined;
      if (opts.source && treeNode) {
        const lines = fileText.split("\n");
        const startLine = treeNode.location.line - 1;
        const endLine = treeNode.location.endLine - 1;
        source = lines.slice(startLine, endLine + 1).join("\n");
      }

      const duration = Math.round(performance.now() - start);

      if (opts.format === "human") {
        console.log(`Children of ${target.name} (${target.kindName}):`);
        if (children.length === 0) {
          console.log("  (no children)");
        } else {
          console.log(formatSymbolsHuman(children));
        }
        if (source) {
          console.log(`\nSource:\n${source}`);
        }
      } else {
        outputJson({
          command: "children",
          workDir: opts.workDir,
          language: opts.language,
          query: symbol,
          results: {
            symbol: target,
            children,
            ...(source ? { source } : {}),
          },
          meta: { duration_ms: duration },
        });
      }
    } finally {
      await destroySession(client);
    }
  });
