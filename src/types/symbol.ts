import { SymbolKind } from "ts-lsp-client";

export { SymbolKind };

export interface SymbolLocation {
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  kindName: string;
  location: SymbolLocation;
  containerName?: string;
  children?: SymbolInfo[];
}

export const SYMBOL_KIND_NAMES: Record<number, string> = {
  [SymbolKind.File]: "file",
  [SymbolKind.Module]: "module",
  [SymbolKind.Namespace]: "namespace",
  [SymbolKind.Package]: "package",
  [SymbolKind.Class]: "class",
  [SymbolKind.Method]: "method",
  [SymbolKind.Property]: "property",
  [SymbolKind.Field]: "field",
  [SymbolKind.Constructor]: "constructor",
  [SymbolKind.Enum]: "enum",
  [SymbolKind.Interface]: "interface",
  [SymbolKind.Function]: "function",
  [SymbolKind.Variable]: "variable",
  [SymbolKind.Constant]: "constant",
  [SymbolKind.String]: "string",
  [SymbolKind.Number]: "number",
  [SymbolKind.Boolean]: "boolean",
  [SymbolKind.Array]: "array",
  [SymbolKind.Object]: "object",
  [SymbolKind.Key]: "key",
  [SymbolKind.Null]: "null",
  [SymbolKind.EnumMember]: "enum-member",
  [SymbolKind.Struct]: "struct",
  [SymbolKind.Event]: "event",
  [SymbolKind.Operator]: "operator",
  [SymbolKind.TypeParameter]: "type-parameter",
};

export function symbolKindName(kind: SymbolKind): string {
  return SYMBOL_KIND_NAMES[kind] ?? `unknown(${kind})`;
}

export function parseSymbolKind(name: string): SymbolKind | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(SYMBOL_KIND_NAMES)) {
    if (v === lower) return Number(k) as SymbolKind;
  }
  return undefined;
}
