import { cpus } from "node:os";
import { createSession, destroySession } from "../lsp/lifecycle.ts";
import { fileUri } from "./files.ts";
import type { SymbolCache } from "../cache/symbol-cache.ts";

const BATCH_SIZE = 20;

export interface FileEntry {
  filePath: string;
  relativePath: string;
  text: string;
  hash: string;
}

export interface WorkerResult {
  /** relativePath → raw documentSymbol result */
  symbols: Map<string, unknown[]>;
}

export function autoWorkerCount(fileCount: number): number {
  if (fileCount < 100) return 1;
  const byFiles = Math.ceil(fileCount / 500);
  const byCpus = Math.floor(cpus().length / 4);
  return Math.min(byFiles, byCpus, 8);
}

async function processChunk(
  files: FileEntry[],
  opts: {
    workDir: string;
    language: string;
    serverPath?: string;
    verbose?: boolean;
  },
  cache: SymbolCache | null
): Promise<WorkerResult> {
  const client = await createSession({
    ...opts,
    skipReady: true,
  });

  const symbols = new Map<string, unknown[]>();

  try {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const chunk = files.slice(i, i + BATCH_SIZE);

      for (const { filePath, text } of chunk) {
        client.didOpen(fileUri(filePath), opts.language, text);
      }

      const results = await Promise.all(
        chunk.map(({ filePath }) => client.documentSymbol(fileUri(filePath)))
      );

      for (let j = 0; j < chunk.length; j++) {
        const entry = chunk[j]!;
        const docSymbols = results[j]!;
        symbols.set(entry.relativePath, docSymbols);
        client.didClose(fileUri(entry.filePath));

        if (cache) {
          await cache.set(entry.relativePath, entry.hash, docSymbols);
        }
      }
    }
  } finally {
    await destroySession(client);
  }

  return { symbols };
}

export async function processFilesParallel(
  files: FileEntry[],
  opts: {
    workDir: string;
    language: string;
    serverPath?: string;
    verbose?: boolean;
  },
  workerCount: number,
  cache: SymbolCache | null
): Promise<Map<string, unknown[]>> {
  if (files.length === 0) return new Map();

  const count = Math.min(workerCount, files.length);
  const chunkSize = Math.ceil(files.length / count);
  const chunks: FileEntry[][] = [];

  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }

  if (opts.verbose) {
    console.error(
      `[lsptkns] Processing ${files.length} files across ${chunks.length} workers`
    );
  }

  const results = await Promise.all(
    chunks.map((chunk) => processChunk(chunk, opts, cache))
  );

  // Merge all results
  const merged = new Map<string, unknown[]>();
  for (const result of results) {
    for (const [key, value] of result.symbols) {
      merged.set(key, value);
    }
  }

  return merged;
}
