import { Command } from "commander";
import path from "node:path";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { symbolKindName, parseSymbolKind, type SymbolInfo } from "../types/symbol.ts";
import { getServerConfig } from "../lsp/servers.ts";
import { fileUri, uriToPath, walkFiles } from "../utils/files.ts";
import { outputJson } from "../output/json.ts";
import { formatSymbolsHuman } from "../output/formatter.ts";

// Hierarchical format (DocumentSymbol) — has range directly
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

// Flat format (SymbolInformation) — has location.uri + location.range
interface SymbolInformationResult {
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

function isSymbolInformation(
  raw: unknown
): raw is SymbolInformationResult {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "location" in raw &&
    typeof (raw as Record<string, unknown>).location === "object"
  );
}

function documentSymbolToInfo(
  raw: DocumentSymbolResult,
  relativePath: string
): SymbolInfo {
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
    children: raw.children?.map((c) => documentSymbolToInfo(c, relativePath)),
  };
}

function symbolInformationToInfo(
  raw: SymbolInformationResult,
  workDir: string
): SymbolInfo {
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

export const symbolsCommand = new Command("symbols")
  .description("List all symbols in a project")
  .requiredOption("-w, --work-dir <dir>", "Project root directory", ".")
  .requiredOption("-l, --language <lang>", "Language (typescript, python, elixir)")
  .option("-f, --file <glob>", "Filter to files matching a glob pattern")
  .option("-k, --kind <kind>", "Filter by symbol kind (function, class, etc.)")
  .option("--flat", "Flatten hierarchical symbols into a flat list", false)
  .option("--server-path <path>", "Override LSP server binary path")
  .option("--format <format>", "Output format: json or human", "json")
  .option("--verbose", "Enable verbose LSP logging", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns symbols --work-dir ./my-project --language typescript
  $ lsptkns symbols -w . -l typescript --kind function
  $ lsptkns symbols -w . -l python --file "models/*.py" --format human
  $ lsptkns symbols -w . -l elixir --flat`
  )
  .action(async (opts) => {
    const start = performance.now();
    const workDir = path.resolve(opts.workDir);
    const client = await createSession({
      workDir: opts.workDir,
      language: opts.language,
      serverPath: opts.serverPath,
      verbose: opts.verbose,
    });

    try {
      let symbols: SymbolInfo[] = [];

      // Walk all project files and use documentSymbol per file.
      // workspace/symbol("") is unreliable for enumeration — language servers
      // (especially tsserver) cap results for empty queries, returning only a
      // small subset of symbols.
      const config = getServerConfig(opts.language);
      const files = await walkFiles(workDir, config.extensions);

      for (const filePath of files) {
        const uri = fileUri(filePath);
        const relativePath = filePath.startsWith(workDir)
          ? filePath.slice(workDir.length + 1)
          : filePath;
        const text = await Bun.file(filePath).text();

        client.didOpen(uri, opts.language, text);
        const docSymbols = await client.documentSymbol(uri);
        client.didClose(uri);

        for (const ds of docSymbols) {
          if (isSymbolInformation(ds)) {
            symbols.push(symbolInformationToInfo(ds, workDir));
          } else {
            symbols.push(documentSymbolToInfo(ds as DocumentSymbolResult, relativePath));
          }
        }
      }

      // Apply filters
      if (opts.file) {
        const fileGlob = new Bun.Glob(opts.file);
        symbols = symbols.filter((s) => fileGlob.match(s.location.file));
      }

      if (opts.kind) {
        const kind = parseSymbolKind(opts.kind);
        if (kind === undefined) {
          throw new Error(`Unknown symbol kind: "${opts.kind}"`);
        }
        symbols = filterByKind(symbols, kind);
      }

      if (opts.flat) {
        symbols = flattenSymbols(symbols);
        // Remove children from flattened entries
        symbols = symbols.map(({ children, ...rest }) => rest);
      }

      const duration = Math.round(performance.now() - start);

      if (opts.format === "human") {
        const flat = opts.flat ? symbols : flattenSymbols(symbols);
        console.log(formatSymbolsHuman(flat));
      } else {
        outputJson({
          command: "symbols",
          workDir: opts.workDir,
          language: opts.language,
          results: symbols,
          meta: { duration_ms: duration },
        });
      }
    } finally {
      await destroySession(client);
    }
  });

function filterByKind(symbols: SymbolInfo[], kind: number): SymbolInfo[] {
  return symbols
    .filter((s) => s.kind === kind || s.children?.some((c) => c.kind === kind))
    .map((s) => {
      if (s.kind === kind) return s;
      return {
        ...s,
        children: s.children?.filter((c) => c.kind === kind),
      };
    });
}
