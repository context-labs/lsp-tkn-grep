import path from "node:path";
import { readdir } from "node:fs/promises";

export function fileUri(filePath: string): string {
  const absolute = path.resolve(filePath);
  return `file://${absolute}`;
}

export function uriToPath(uri: string): string {
  return uri.replace("file://", "");
}

export async function readFileText(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  return file.text();
}

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".output",
  ".wrangler",
  "coverage",
  "__pycache__",
  ".git",
  "deps",
  "_build",
]);

export async function walkFiles(
  workDir: string,
  extensions: string[]
): Promise<string[]> {
  const files: string[] = [];
  const extSet = new Set(extensions);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && extSet.has(path.extname(entry.name))) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  await walk(workDir);
  return files;
}
