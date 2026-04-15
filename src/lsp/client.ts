import type { ChildProcess } from "node:child_process";
import { JSONRPCEndpoint, LspClient } from "ts-lsp-client";

export interface LspSession {
  process: ChildProcess;
  endpoint: JSONRPCEndpoint;
  client: LspClient;
  capabilities: Record<string, unknown>;
  workDir: string;
}

export class LspTknsClient {
  private session: LspSession;

  constructor(session: LspSession) {
    this.session = session;
  }

  get workDir(): string {
    return this.session.workDir;
  }

  get client(): LspClient {
    return this.session.client;
  }

  get endpoint(): JSONRPCEndpoint {
    return this.session.endpoint;
  }

  get capabilities(): Record<string, unknown> {
    return this.session.capabilities;
  }

  async workspaceSymbol(query: string): Promise<unknown[]> {
    const result = await this.endpoint.send("workspace/symbol", { query });
    return (result as unknown[]) ?? [];
  }

  async documentSymbol(uri: string): Promise<unknown[]> {
    const result = await this.client.documentSymbol({
      textDocument: { uri },
    });
    return (result as unknown[]) ?? [];
  }

  async references(
    uri: string,
    line: number,
    character: number
  ): Promise<unknown[]> {
    const result = await this.client.references({
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
    return this.client.definition({
      textDocument: { uri },
      position: { line, character },
    });
  }

  async prepareCallHierarchy(
    uri: string,
    line: number,
    character: number
  ): Promise<unknown[]> {
    const result = await this.endpoint.send(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line, character },
      }
    );
    return (result as unknown[]) ?? [];
  }

  async outgoingCalls(item: unknown): Promise<unknown[]> {
    const result = await this.endpoint.send("callHierarchy/outgoingCalls", {
      item,
    });
    return (result as unknown[]) ?? [];
  }

  async incomingCalls(item: unknown): Promise<unknown[]> {
    const result = await this.endpoint.send("callHierarchy/incomingCalls", {
      item,
    });
    return (result as unknown[]) ?? [];
  }

  didOpen(uri: string, languageId: string, text: string): void {
    this.client.didOpen({
      textDocument: {
        uri,
        languageId,
        version: 1,
        text,
      },
    });
  }

  didClose(uri: string): void {
    this.client.didClose({
      textDocument: { uri },
    });
  }
}
