import { LSPCoreClient, type LSPClientOptions } from "./core-client.ts";
import { getClientClass } from "./clients/registry.ts";

export interface CreateSessionOptions extends LSPClientOptions {
  skipReady?: boolean;
}

export async function createSession(
  options: CreateSessionOptions
): Promise<LSPCoreClient> {
  const ClientClass = getClientClass(options.language);
  return LSPCoreClient.spawn(options, ClientClass, {
    skipReady: options.skipReady,
  });
}

export async function destroySession(client: LSPCoreClient): Promise<void> {
  await client.shutdown();
}
