import { spawn } from "node:child_process";
import path from "node:path";
import { JSONRPCEndpoint, LspClient } from "ts-lsp-client";
import { getServerConfig } from "./servers.ts";
import { LspTknsClient, type LspSession } from "./client.ts";
import { walkFiles, fileUri } from "../utils/files.ts";

export interface CreateSessionOptions {
  workDir: string;
  language: string;
  serverPath?: string;
  verbose?: boolean;
}

export async function createSession(
  options: CreateSessionOptions
): Promise<LspTknsClient> {
  const { workDir, language, serverPath, verbose } = options;
  const config = getServerConfig(language);

  const command = serverPath ?? config.command;
  const args = serverPath ? [] : config.args;

  if (verbose) {
    console.error(`[lsptkns] Spawning: ${command} ${args.join(" ")}`);
    console.error(`[lsptkns] Work dir: ${workDir}`);
  }

  const absoluteWorkDir = path.resolve(workDir);
  const rootUri = `file://${absoluteWorkDir}`;

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

  const endpoint = new JSONRPCEndpoint(proc.stdin!, proc.stdout!);
  const client = new LspClient(endpoint);

  const initResult = await client.initialize({
    processId: process.pid,
    capabilities: {
      textDocument: {
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
        },
      },
    },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: path.basename(absoluteWorkDir) }],
  });

  client.initialized();

  if (verbose) {
    console.error(`[lsptkns] Server initialized: ${initResult.capabilities ? "OK" : "no capabilities"}`);
  }

  const session: LspSession = {
    process: proc,
    endpoint,
    client,
    capabilities: (initResult.capabilities as Record<string, unknown>) ?? {},
    workDir: absoluteWorkDir,
  };

  const lspTknsClient = new LspTknsClient(session);

  // Open a probe file so the language server discovers the project.
  // TypeScript's language server requires at least one open file before
  // workspace/symbol will work.
  const probeFiles = await walkFiles(absoluteWorkDir, config.extensions);
  if (probeFiles.length > 0) {
    const probeFile = probeFiles[0]!;
    const probeUri = fileUri(probeFile);
    const probeText = await Bun.file(probeFile).text();
    lspTknsClient.didOpen(probeUri, language, probeText);

    // Give the server a moment to index the project
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (verbose) {
      console.error(`[lsptkns] Opened probe file: ${probeFile}`);
    }
  }

  return lspTknsClient;
}

export async function destroySession(client: LspTknsClient): Promise<void> {
  try {
    await client.client.shutdown();
    client.client.exit();
  } catch {
    // Server may have already exited
  }
}
