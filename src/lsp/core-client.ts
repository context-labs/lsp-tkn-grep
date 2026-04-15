import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { JsonRpcTransport } from "./jsonrpc.ts";
import { type ServerConfig, getServerConfig } from "./servers.ts";
import { walkFiles, fileUri } from "../utils/files.ts";

export interface LSPClientOptions {
  workDir: string;
  language: string;
  serverPath?: string;
  verbose?: boolean;
}

/**
 * Base LSP client that handles JSON-RPC transport, initialization, and the
 * common LSP method surface. Language-specific subclasses override
 * `waitForReady()` to handle indexing/compilation quirks.
 */
export class LSPCoreClient {
  readonly transport: JsonRpcTransport;
  readonly process: ChildProcess;
  readonly workDir: string;
  readonly language: string;
  readonly config: ServerConfig;
  protected verbose: boolean;

  constructor(
    proc: ChildProcess,
    transport: JsonRpcTransport,
    workDir: string,
    language: string,
    config: ServerConfig,
    verbose: boolean
  ) {
    this.process = proc;
    this.transport = transport;
    this.workDir = workDir;
    this.language = language;
    this.config = config;
    this.verbose = verbose;
  }

  /**
   * Spawn a language server and perform the LSP handshake.
   * Use `createSession()` from lifecycle.ts instead of calling this directly.
   */
  static async spawn(
    opts: LSPClientOptions,
    ClientClass: typeof LSPCoreClient,
    spawnOpts?: { skipReady?: boolean }
  ): Promise<LSPCoreClient> {
    const { workDir, language, serverPath, verbose = false } = opts;
    const config = getServerConfig(language);
    const command = serverPath ?? config.command;
    const args = serverPath ? [] : config.args;
    const absoluteWorkDir = path.resolve(workDir);

    if (verbose) {
      console.error(`[lsptkns] Spawning: ${command} ${args.join(" ")}`);
      console.error(`[lsptkns] Work dir: ${absoluteWorkDir}`);
    }

    const proc = spawn(command, args, {
      cwd: absoluteWorkDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          `\nError: LSP server "${command}" not found.\n` +
            `Install it with: ${config.installHint}\n`
        );
        process.exit(1);
      }
      throw err;
    });

    if (verbose && proc.stderr) {
      proc.stderr.on("data", (data: Buffer) => {
        console.error(`[lsp-stderr] ${data.toString().trim()}`);
      });
    }

    const transport = new JsonRpcTransport(proc.stdin!, proc.stdout!);

    const client = new ClientClass(
      proc,
      transport,
      absoluteWorkDir,
      language,
      config,
      verbose
    );

    await client.initialize();
    if (!spawnOpts?.skipReady) {
      await client.waitForReady();
    }

    return client;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  protected async initialize(): Promise<void> {
    const rootUri = `file://${this.workDir}`;

    await this.transport.request("initialize", {
      processId: process.pid,
      capabilities: {
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
        },
        window: {
          workDoneProgress: true,
        },
      },
      rootUri,
      workspaceFolders: [
        { uri: rootUri, name: path.basename(this.workDir) },
      ],
    });

    this.transport.notify("initialized", {});
  }

  /**
   * Override in subclasses to wait for the server to finish indexing.
   * Called after initialize/initialized.
   */
  protected async waitForReady(): Promise<void> {
    const probeFiles = await walkFiles(this.workDir, this.config.extensions);
    if (probeFiles.length > 0) {
      const probeFile = probeFiles[0]!;
      this.didOpen(fileUri(probeFile), this.language, await Bun.file(probeFile).text());
      if (this.verbose) {
        console.error(`[lsptkns] Opened probe file: ${probeFile}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.transport.request("shutdown", null);
      this.transport.notify("exit", null);
    } catch {
      // Server may have already exited
    }
    this.transport.destroy();
  }

  // ── LSP Methods ─────────────────────────────────────────────

  async workspaceSymbol(query: string): Promise<unknown[]> {
    const result = await this.transport.request("workspace/symbol", { query });
    return (result as unknown[]) ?? [];
  }

  async documentSymbol(uri: string): Promise<unknown[]> {
    const result = await this.transport.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    return (result as unknown[]) ?? [];
  }

  async references(
    uri: string,
    line: number,
    character: number
  ): Promise<unknown[]> {
    const result = await this.transport.request("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: false },
    });
    if (result && typeof result === "object" && "code" in result) {
      return [];
    }
    return (result as unknown[]) ?? [];
  }

  async definition(
    uri: string,
    line: number,
    character: number
  ): Promise<unknown> {
    return this.transport.request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async prepareCallHierarchy(
    uri: string,
    line: number,
    character: number
  ): Promise<unknown[]> {
    const result = await this.transport.request(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line, character },
      }
    );
    return (result as unknown[]) ?? [];
  }

  async outgoingCalls(item: unknown): Promise<unknown[]> {
    const result = await this.transport.request(
      "callHierarchy/outgoingCalls",
      { item }
    );
    return (result as unknown[]) ?? [];
  }

  async incomingCalls(item: unknown): Promise<unknown[]> {
    const result = await this.transport.request(
      "callHierarchy/incomingCalls",
      { item }
    );
    return (result as unknown[]) ?? [];
  }

  didOpen(uri: string, languageId: string, text: string): void {
    this.transport.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  didClose(uri: string): void {
    this.transport.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }
}
