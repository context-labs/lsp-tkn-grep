import { LSPCoreClient } from "../core-client.ts";

export class PythonLS extends LSPCoreClient {
  // Pyright indexes quickly — default waitForReady is fine
}
