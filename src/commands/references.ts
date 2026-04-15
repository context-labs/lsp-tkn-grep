import { Command } from "commander";
import path from "node:path";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { symbolKindName, type SymbolInfo } from "../types/symbol.ts";
import { disambiguate } from "../utils/disambiguate.ts";
import { fileUri, uriToPath } from "../utils/files.ts";
import { outputJson } from "../output/json.ts";

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

interface LocationResult {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
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

export const referencesCommand = new Command("references")
  .description("Find all usages of a symbol across the project")
  .argument("<symbol>", "Symbol name to find references for")
  .requiredOption("-w, --work-dir <dir>", "Project root directory", ".")
  .requiredOption("-l, --language <lang>", "Language (typescript, python, elixir)")
  .option("-f, --file <path>", "Filter symbol lookup to a specific file")
  .option("-k, --kind <kind>", "Filter by symbol kind (function, class, etc.)")
  .option("--server-path <path>", "Override LSP server binary path")
  .option("--format <format>", "Output format: json or human", "json")
  .option("--verbose", "Enable verbose LSP logging", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns references MyClass --work-dir ./my-project --language typescript
  $ lsptkns references "handleRequest" -w . -l typescript --kind function
  $ lsptkns references "User" -w . -l python --format human`
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
      const rawResults = (await client.workspaceSymbol(symbol)) as WorkspaceSymbolResult[];
      const symbols = rawResults.map((r) => toSymbolInfo(r, workDir));

      if (symbols.length === 0) {
        if (opts.format === "human") {
          console.log(`No symbol matching "${symbol}" found.`);
        } else {
          outputJson({
            command: "references",
            workDir: opts.workDir,
            language: opts.language,
            query: symbol,
            results: [],
            meta: { duration_ms: Math.round(performance.now() - start) },
          });
        }
        return;
      }

      const target = disambiguate(symbols, symbol, {
        file: opts.file,
        kind: opts.kind,
      });

      // Open the file so the server knows about it
      const targetUri = fileUri(path.join(workDir, target.location.file));
      const fileText = await Bun.file(path.join(workDir, target.location.file)).text();
      client.didOpen(targetUri, opts.language, fileText);

      const refs = (await client.references(
        targetUri,
        target.location.line - 1,
        target.location.col - 1
      )) as LocationResult[];

      client.didClose(targetUri);

      const results = refs.map((ref) => {
        const filePath = uriToPath(ref.uri);
        const relativePath = filePath.startsWith(workDir)
          ? filePath.slice(workDir.length + 1)
          : filePath;

        return {
          file: relativePath,
          line: ref.range.start.line + 1,
          col: ref.range.start.character + 1,
          endLine: ref.range.end.line + 1,
          endCol: ref.range.end.character + 1,
        };
      });

      const duration = Math.round(performance.now() - start);

      if (opts.format === "human") {
        if (results.length === 0) {
          console.log(`No references found for "${symbol}".`);
        } else {
          console.log(`Found ${results.length} reference(s) for "${symbol}":`);
          for (const ref of results) {
            console.log(`  ${ref.file}:${ref.line}:${ref.col}`);
          }
        }
      } else {
        outputJson({
          command: "references",
          workDir: opts.workDir,
          language: opts.language,
          query: symbol,
          results: { symbol: target, references: results },
          meta: { duration_ms: duration },
        });
      }
    } finally {
      await destroySession(client);
    }
  });
