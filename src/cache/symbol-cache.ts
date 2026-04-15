import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";

const CACHE_VERSION = 1;
const CACHE_SUBDIR = "symbols";

interface CacheEntry {
  v: number;
  hash: string;
  symbols: unknown[];
}

export interface SymbolCache {
  get(relativePath: string, contentHash: string): Promise<unknown[] | null>;
  set(relativePath: string, contentHash: string, symbols: unknown[]): Promise<void>;
  prune(currentFiles: Set<string>): Promise<number>;
}

export function contentHash(text: string): string {
  return Bun.hash(text).toString(16);
}

export function createSymbolCache(cacheDir: string): SymbolCache {
  const baseDir = path.join(cacheDir, CACHE_SUBDIR);

  function cachePath(relativePath: string): string {
    return path.join(baseDir, relativePath + ".json");
  }

  return {
    async get(relativePath, hash) {
      const file = Bun.file(cachePath(relativePath));
      if (!(await file.exists())) return null;
      try {
        const entry: CacheEntry = await file.json();
        if (entry.v !== CACHE_VERSION || entry.hash !== hash) return null;
        return entry.symbols;
      } catch {
        return null;
      }
    },

    async set(relativePath, hash, symbols) {
      const dest = cachePath(relativePath);
      await mkdir(path.dirname(dest), { recursive: true });
      const entry: CacheEntry = { v: CACHE_VERSION, hash, symbols };
      await Bun.write(dest, JSON.stringify(entry));
    },

    async prune(currentFiles) {
      let pruned = 0;
      const glob = new Bun.Glob("**/*.json");
      for await (const match of glob.scan({ cwd: baseDir, onlyFiles: true })) {
        const sourcePath = match.slice(0, -5); // strip ".json"
        if (!currentFiles.has(sourcePath)) {
          await unlink(path.join(baseDir, match));
          pruned++;
        }
      }
      return pruned;
    },
  };
}
