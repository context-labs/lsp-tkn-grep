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
      files.push(path.join(workDir, match));
    }
  }

  return files;
}
