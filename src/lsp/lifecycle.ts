import { LSPCoreClient, type LSPClientOptions } from "./core-client.ts";
import { getClientClass } from "./clients/registry.ts";

export type CreateSessionOptions = LSPClientOptions;

export async function createSession(
  options: CreateSessionOptions
): Promise<LSPCoreClient> {
  const ClientClass = getClientClass(options.language);
  return LSPCoreClient.spawn(options, ClientClass);
}

export async function destroySession(client: LSPCoreClient): Promise<void> {
  await client.shutdown();
}
