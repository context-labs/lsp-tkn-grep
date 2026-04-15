import path from "node:path";
import { LSPCoreClient } from "../core-client.ts";
import { walkFiles, fileUri } from "../../utils/files.ts";

/**
 * Pick probe files from different parts of the workspace by reading
 * tsconfig.json project references. Falls back to the first file.
 */
async function pickProbeFiles(
  files: string[],
  workDir: string
): Promise<string[]> {
  // Strategy 1: read tsconfig.json project references
  const tsconfigFile = Bun.file(path.join(workDir, "tsconfig.json"));
  if (await tsconfigFile.exists()) {
    try {
      const text = await tsconfigFile.text();
      const refs = [...text.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map(
        (m) => m[1]!
      );
      if (refs.length > 0) {
        const probes: string[] = [];
        for (const ref of refs) {
          const refDir = path.join(workDir, ref);
          const match = files.find(
            (f) =>
              f.startsWith(refDir + path.sep) &&
              f.endsWith(".ts") &&
              f.includes("/src/")
          );
          if (match) probes.push(match);
        }
        if (probes.length > 0) return probes;
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 2: for monorepos without root tsconfig references,
  // pick one .ts file from each unique second-level directory that has src/
  const prefix = workDir + path.sep;
  const seen = new Set<string>();
  const probes: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".ts") || !f.includes("/src/")) continue;
    const rel = f.slice(prefix.length);
    const parts = rel.split(path.sep);
    const key = parts.length >= 2 ? parts[0] + "/" + parts[1] : parts[0]!;
    if (!seen.has(key)) {
      seen.add(key);
      probes.push(f);
    }
  }

  return probes.length > 0 ? probes : [files[0]!];
}

export class TypeScriptLS extends LSPCoreClient {
  protected override async waitForReady(): Promise<void> {
    const allFiles = await walkFiles(this.workDir, this.config.extensions);
    if (allFiles.length === 0) return;

    const probes = await pickProbeFiles(allFiles, this.workDir);

    for (const probeFile of probes) {
      this.didOpen(
        fileUri(probeFile),
        this.language,
        await Bun.file(probeFile).text()
      );
    }

    if (this.verbose) {
      console.error(
        `[lsptkns] Opened ${probes.length} probe files for indexing`
      );
    }

    // Poll workspace/symbol("") until stable. Use 500ms intervals with
    // a 1.5s initial wait for tsserver to discover project references.
    await new Promise((r) => setTimeout(r, 1500));

    let prev = 0;
    let stableRuns = 0;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const probe = await Promise.race([
          this.workspaceSymbol(""),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("poll timeout")), 5000)
          ),
        ]);
        if (this.verbose) {
          console.error(
            `[lsptkns] Index poll ${i + 1}: ${probe.length} symbols (stable=${stableRuns})`
          );
        }
        if (probe.length > 0 && probe.length === prev) {
          stableRuns++;
        } else {
          stableRuns = 0;
        }
        if (stableRuns >= 2) break;
        prev = probe.length;
      } catch {
        if (this.verbose) {
          console.error(
            `[lsptkns] Index poll ${i + 1}: timed out, proceeding`
          );
        }
        break;
      }
    }
  }
}
