import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * JSON-RPC 2.0 transport with Content-Length framing.
 *
 * Handles:
 * - Multiple in-flight client requests via a pending map (id -> resolver)
 * - Server-initiated requests (id + method) — auto-responds with null
 *   unless a listener is registered for that method
 * - Server notifications (method, no id) — emitted as events
 */
export class JsonRpcTransport extends EventEmitter {
  private stdin: Writable;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private buffer = "";

  constructor(stdin: Writable, stdout: Readable) {
    super();
    this.stdin = stdin;
    stdout.setEncoding("utf-8");
    stdout.on("data", (chunk: string) => this.onData(chunk));
  }

  /**
   * Send a request and return a promise that resolves with the result.
   */
  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    this.write(msg);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  /**
   * Send a notification (no response expected).
   */
  notify(method: string, params?: unknown): void {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.write(msg);
  }

  /**
   * Respond to a server-initiated request.
   */
  respond(id: number, result: unknown): void {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id, result };
    this.write(msg);
  }

  private write(msg: JsonRpcMessage): void {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.stdin.write(header + body);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (this.parseNext()) {}
  }

  private parseNext(): boolean {
    // Look for Content-Length header
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return false;

    const header = this.buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Malformed header — skip past it
      this.buffer = this.buffer.slice(headerEnd + 4);
      return true;
    }

    const contentLength = parseInt(match[1]!, 10);
    const bodyStart = headerEnd + 4;
    const bodyBytes = Buffer.byteLength(this.buffer.slice(bodyStart), "utf-8");

    if (bodyBytes < contentLength) return false; // Wait for more data

    // Extract exactly contentLength bytes
    const bodyBuf = Buffer.from(this.buffer.slice(bodyStart), "utf-8");
    const body = bodyBuf.subarray(0, contentLength).toString("utf-8");
    const remaining = bodyBuf.subarray(contentLength).toString("utf-8");
    this.buffer = remaining;

    try {
      this.dispatch(JSON.parse(body));
    } catch {
      // Malformed JSON — skip
    }

    return true;
  }

  private dispatch(msg: Record<string, unknown>): void {
    const hasId = "id" in msg && msg.id !== null;
    const hasMethod = "method" in msg;
    const hasResult = "result" in msg || "error" in msg;

    if (hasId && hasResult && !hasMethod) {
      // Response to a client request
      const id = msg.id as number;
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        if ("error" in msg && msg.error) {
          const err = msg.error as { code: number; message: string };
          pending.reject(new Error(`LSP error ${err.code}: ${err.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (hasId && hasMethod) {
      // Server-initiated request — needs a response
      const id = msg.id as number;
      const method = msg.method as string;
      if (this.listenerCount(method) > 0) {
        this.emit(method, msg.params, id);
      } else {
        // Auto-respond with null for unhandled server requests
        this.respond(id, null);
      }
    } else if (hasMethod && !hasId) {
      // Server notification
      this.emit(msg.method as string, msg.params);
    }
  }

  /**
   * Reject all pending requests (used during shutdown).
   */
  destroy(): void {
    for (const [, pending] of this.pending) {
      pending.reject(new Error("Transport destroyed"));
    }
    this.pending.clear();
  }
}
