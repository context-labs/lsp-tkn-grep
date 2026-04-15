import { LSPCoreClient } from "../core-client.ts";
import { walkFiles, fileUri } from "../../utils/files.ts";

export class TypeScriptLS extends LSPCoreClient {
  protected override async waitForReady(): Promise<void> {
    const probeFiles = await walkFiles(this.workDir, this.config.extensions);
    if (probeFiles.length === 0) return;

    const probeFile = probeFiles[0]!;
    this.didOpen(fileUri(probeFile), this.language, await Bun.file(probeFile).text());

    if (this.verbose) {
      console.error(`[lsptkns] Opened probe file: ${probeFile}`);
    }

    // Poll workspace/symbol("") until results stabilise.
    // tsserver returns progressively more symbols as it processes tsconfig projects.
    let prev = 0;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const probe = await Promise.race([
          this.workspaceSymbol(""),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("poll timeout")), 5000)
          ),
        ]);
        if (this.verbose) {
          console.error(`[lsptkns] Index poll ${i + 1}: ${probe.length} symbols`);
        }
        if (probe.length > 0 && probe.length === prev) break;
        prev = probe.length;
      } catch {
        if (this.verbose) {
          console.error(`[lsptkns] Index poll ${i + 1}: timed out, proceeding`);
        }
        break;
      }
    }
  }
}
