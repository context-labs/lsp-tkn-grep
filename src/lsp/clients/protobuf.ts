import { LSPCoreClient } from "../core-client.ts";

export class ProtobufLS extends LSPCoreClient {
  // buf lsp indexes quickly — default waitForReady is fine
}
