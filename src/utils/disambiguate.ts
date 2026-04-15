import type { SymbolInfo } from "../types/symbol.ts";

export class AmbiguousSymbolError extends Error {
  constructor(
    public query: string,
    public matches: SymbolInfo[]
  ) {
    const matchList = matches
      .map(
        (m) =>
          `  ${m.location.file}:${m.location.line}:${m.location.col}  ${m.kindName}  ${m.name}${m.containerName ? ` (in ${m.containerName})` : ""}`
      )
      .join("\n");

    super(
      `Symbol "${query}" matched ${matches.length} results. Be more specific:\n\n${matchList}\n\n` +
        `Use --file <path> or --kind <kind> to disambiguate.`
    );
    this.name = "AmbiguousSymbolError";
  }
}

export function disambiguate(
  symbols: SymbolInfo[],
  query: string,
  filters: { file?: string; kind?: string }
): SymbolInfo {
  let filtered = symbols;

  if (filters.file) {
    filtered = filtered.filter((s) => s.location.file.includes(filters.file!));
  }

  if (filters.kind) {
    const lower = filters.kind.toLowerCase();
    filtered = filtered.filter((s) => s.kindName === lower);
  }

  if (filtered.length === 0) {
    throw new Error(
      `No symbol matching "${query}" found${filters.file ? ` in file "${filters.file}"` : ""}${filters.kind ? ` with kind "${filters.kind}"` : ""}.`
    );
  }

  if (filtered.length > 1) {
    throw new AmbiguousSymbolError(query, filtered);
  }

  return filtered[0]!;
}
