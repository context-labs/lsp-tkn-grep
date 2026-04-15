import path from "node:path";

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
  "coverage",
  "__pycache__",
  ".git",
  "deps",
  "_build",
]);

function isExcluded(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  return parts.some((p) => EXCLUDED_DIRS.has(p));
}

export async function walkFiles(
  workDir: string,
  extensions: string[]
): Promise<string[]> {
  const files: string[] = [];

  for (const ext of extensions) {
    const glob = new Bun.Glob(`**/*${ext}`);
    for await (const match of glob.scan({
      cwd: workDir,
      onlyFiles: true,
    })) {
      if (!isExcluded(match)) {
        files.push(path.join(workDir, match));
      }
    }
  }

  return files;
}
