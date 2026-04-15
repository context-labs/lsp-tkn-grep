import { Command } from "commander";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { symbolKindName, type SymbolInfo } from "../types/symbol.ts";
import { disambiguate } from "../utils/disambiguate.ts";
import { uriToPath } from "../utils/files.ts";
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

export const findCommand = new Command("find")
  .description("Find a symbol definition in the project")
  .argument("<symbol>", "Symbol name to search for")
  .requiredOption("-w, --work-dir <dir>", "Project root directory", ".")
  .requiredOption("-l, --language <lang>", "Language (typescript, python, elixir)")
  .option("-f, --file <path>", "Filter results to a specific file path")
  .option("-k, --kind <kind>", "Filter by symbol kind (function, class, etc.)")
  .option("--server-path <path>", "Override LSP server binary path")
  .option("--format <format>", "Output format: json or human", "json")
  .option("--verbose", "Enable verbose LSP logging", false)
  .addHelpText(
    "after",
    `
Examples:
  $ lsptkns find MyClass --work-dir ./my-project --language typescript
  $ lsptkns find "handleRequest" -w . -l typescript --kind function
  $ lsptkns find "User" -w . -l python --file models.py
  $ lsptkns find "GenServer" -w . -l elixir --format human`
  )
  .action(async (symbol: string, opts) => {
    const start = performance.now();
    const client = await createSession({
      workDir: opts.workDir,
      language: opts.language,
      serverPath: opts.serverPath,
      verbose: opts.verbose,
    });

    try {
      const rawResults = (await client.workspaceSymbol(symbol)) as WorkspaceSymbolResult[];
      const symbols = rawResults.map((r) => toSymbolInfo(r, client.workDir));

      if (symbols.length === 0) {
        if (opts.format === "human") {
          console.log(`No symbol matching "${symbol}" found.`);
        } else {
          outputJson({
            command: "find",
            workDir: opts.workDir,
            language: opts.language,
            query: symbol,
            results: [],
            meta: { duration_ms: Math.round(performance.now() - start) },
          });
        }
        return;
      }

      const result = disambiguate(symbols, symbol, {
        file: opts.file,
        kind: opts.kind,
      });

      const duration = Math.round(performance.now() - start);

      if (opts.format === "human") {
        console.log(formatSymbolsHuman([result]));
      } else {
        outputJson({
          command: "find",
          workDir: opts.workDir,
          language: opts.language,
          query: symbol,
          results: [result],
          meta: { duration_ms: duration },
        });
      }
    } finally {
      await destroySession(client);
    }
  });
