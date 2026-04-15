import { Command } from "commander";
import path from "node:path";
import { symbolKindName, parseSymbolKind, type SymbolInfo } from "../types/symbol.ts";
import { getServerConfig } from "../lsp/servers.ts";
import { uriToPath, walkFiles } from "../utils/files.ts";
import { outputJson } from "../output/json.ts";
import { formatSymbolsHuman } from "../output/formatter.ts";
import { createSymbolCache, contentHash } from "../cache/symbol-cache.ts";
import {
  processFilesParallel,
  autoWorkerCount,
  type FileEntry,
} from "../utils/worker-pool.ts";

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

function rawToSymbolInfos(
  docSymbols: unknown[],
  relativePath: string,
  workDir: string
): SymbolInfo[] {
  const result: SymbolInfo[] = [];
  for (const ds of docSymbols) {
    if (isSymbolInformation(ds)) {
      result.push(symbolInformationToInfo(ds, workDir));
    } else {
      result.push(
        documentSymbolToInfo(ds as DocumentSymbolResult, relativePath)
      );
    }
  }
  return result;
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
  .requiredOption(
    "-l, --language <lang>",
    "Language (typescript, python, elixir)"
  )
  .option("-f, --file <glob>", "Filter to files matching a glob pattern")
  .option("-k, --kind <kind>", "Filter by symbol kind (function, class, etc.)")
  .option("--flat", "Flatten hierarchical symbols into a flat list", false)
  .option("--cache-dir <path>", "Directory for symbol cache")
  .option("--workers <n>", "Parallel LSP workers (default: auto)", "auto")
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
  $ lsptkns symbols -w . -l elixir --flat
  $ lsptkns symbols -w . -l typescript --cache-dir .lsptkns-cache
  $ lsptkns symbols -w . -l typescript --workers 4`
  )
  .action(async (opts) => {
    const start = performance.now();
    const workDir = path.resolve(opts.workDir);
    const config = getServerConfig(opts.language);
    const files = await walkFiles(workDir, config.extensions);
    const cache = opts.cacheDir ? createSymbolCache(opts.cacheDir) : null;

    let symbols: SymbolInfo[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Phase 1: Read files, check cache, collect misses
    const misses: FileEntry[] = [];

    for (const filePath of files) {
      const relativePath = filePath.startsWith(workDir)
        ? filePath.slice(workDir.length + 1)
        : filePath;
      const text = await Bun.file(filePath).text();

      if (cache) {
        const hash = contentHash(text);
        const cached = await cache.get(relativePath, hash);
        if (cached) {
          cacheHits++;
          symbols.push(...rawToSymbolInfos(cached, relativePath, workDir));
          continue;
        }
        cacheMisses++;
        misses.push({ filePath, relativePath, text, hash });
      } else {
        misses.push({ filePath, relativePath, text, hash: "" });
      }
    }

    // Phase 2: Process cache misses via parallel LSP workers
    if (misses.length > 0) {
      const workerCount =
        opts.workers === "auto"
          ? autoWorkerCount(misses.length)
          : parseInt(opts.workers, 10);

      if (opts.verbose) {
        console.error(
          `[lsptkns] ${misses.length} cache misses, using ${workerCount} worker(s)`
        );
      }

      const lspOpts = {
        workDir: opts.workDir,
        language: opts.language,
        serverPath: opts.serverPath,
        verbose: opts.verbose,
      };

      const results = await processFilesParallel(
        misses,
        lspOpts,
        workerCount,
        cache
      );

      for (const { relativePath } of misses) {
        const docSymbols = results.get(relativePath);
        if (docSymbols) {
          symbols.push(...rawToSymbolInfos(docSymbols, relativePath, workDir));
        }
      }
    }

    // Phase 3: Prune cache entries for deleted files
    if (cache) {
      const currentFiles = new Set(
        files.map((f) =>
          f.startsWith(workDir) ? f.slice(workDir.length + 1) : f
        )
      );
      await cache.prune(currentFiles);
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
        meta: {
          duration_ms: duration,
          ...(cache
            ? { cache_hits: cacheHits, cache_misses: cacheMisses }
            : {}),
        },
      });
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
