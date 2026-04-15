import { LSPCoreClient } from "../core-client.ts";
import { TypeScriptLS } from "./typescript.ts";
import { ElixirLS } from "./elixir.ts";
import { PythonLS } from "./python.ts";
import { ProtobufLS } from "./protobuf.ts";

export function getClientClass(language: string): typeof LSPCoreClient {
  switch (language) {
    case "typescript":
      return TypeScriptLS;
    case "elixir":
      return ElixirLS;
    case "python":
      return PythonLS;
    case "protobuf":
      return ProtobufLS;
    default:
      return LSPCoreClient;
  }
}
