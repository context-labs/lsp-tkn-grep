import { LSPCoreClient } from "../core-client.ts";
import { walkFiles, fileUri } from "../../utils/files.ts";

export class ElixirLS extends LSPCoreClient {
  protected override async initialize(): Promise<void> {
    await super.initialize();

    // Disable Dialyzer and dep fetching — we only need code intelligence,
    // not static analysis. Dialyzer's initial PLT build adds 40s+ to startup.
    this.transport.notify("workspace/didChangeConfiguration", {
      settings: {
        elixirLS: {
          dialyzerEnabled: false,
          suggestSpecs: false,
          fetchDeps: false,
        },
      },
    });
  }

  protected override async waitForReady(): Promise<void> {
    const probeFiles = await walkFiles(this.workDir, this.config.extensions);
    if (probeFiles.length === 0) return;

    const probeFile = probeFiles[0]!;
    this.didOpen(fileUri(probeFile), this.language, await Bun.file(probeFile).text());

    if (this.verbose) {
      console.error(`[lsptkns] Opened probe file: ${probeFile}`);
    }

    // ElixirLS compiles the project on first launch which can take a long time.
    // Poll documentSymbol on the probe file until it returns results —
    // this is the most reliable signal that the server is ready.
    if (this.verbose) {
      this.transport.on("window/logMessage", (params: unknown) => {
        const msg = (params as { message?: string })?.message;
        if (msg) console.error(`[elixir-ls] ${msg.slice(0, 200)}`);
      });
    }

    const probeUri = fileUri(probeFile);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const result = await Promise.race([
          this.documentSymbol(probeUri),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), 5000)
          ),
        ]);
        if (Array.isArray(result) && result.length > 0) {
          if (this.verbose) {
            console.error(`[lsptkns] ElixirLS ready after ${(i + 1) * 3}s`);
          }
          return;
        }
      } catch {
        // Still compiling
      }
      if (this.verbose && i > 0 && i % 5 === 0) {
        console.error(`[lsptkns] Waiting for ElixirLS build... ${(i + 1) * 3}s`);
      }
    }

    if (this.verbose) {
      console.error("[lsptkns] ElixirLS build wait timed out, proceeding anyway");
    }
  }
}
