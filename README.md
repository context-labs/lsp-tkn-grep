# lsptkns

LSP-powered code analysis CLI. Uses Language Server Protocol to find symbols, trace references, build call graphs, and diff code structure.

Supports **TypeScript**, **Python**, and **Elixir** out of the box. The compiled binary is self-contained — no Bun or Node.js runtime required.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/context-labs/lsp-tkn-grep/main/install.sh | sh
```

This downloads the latest binary for your platform and installs it to `~/.lsptkns/bin/`. The script automatically adds it to your PATH.

To update:

```bash
lsptkns update
```

### Claude Code skill

If you use [Claude Code](https://claude.ai/claude-code), install the lsptkns skill so Claude knows how to use the CLI:

```bash
npx skills install context-labs/lsp-tkn-grep/skills/lsptkns
```

### From source

Requires [Bun](https://bun.sh):

```bash
git clone https://github.com/context-labs/lsp-tkn-grep.git
cd lsp-tkn-grep
bun install
bun link  # makes `lsptkns` available globally
```

## Prerequisites

`lsptkns` communicates with language servers over stdio. Install the servers for the languages you need:

| Language | Server | Install |
|----------|--------|---------|
| TypeScript / JavaScript | `typescript-language-server` | `npm install -g typescript-language-server typescript` |
| Python | `pyright-langserver` | `pip install pyright` |
| Elixir | `elixir-ls` | `brew install elixir-ls` |

Use `--server-path <path>` on any command to point at a custom server binary not in the registry.

## How it works

Every command (except `diff`) spawns a language server process for the given language, performs an LSP handshake, issues structured requests (`workspace/symbol`, `textDocument/references`, `callHierarchy/outgoingCalls`, etc.), and shuts the server down. The results are parsed into a consistent JSON structure suitable for piping into other tools or AI agents.

The default output format is **JSON**. Pass `--format human` for a readable table.

## Commands

### `lsptkns find <symbol>`

Find where a symbol is defined.

```bash
# Find a class definition
lsptkns find MyClass -w ./my-project -l typescript

# Disambiguate with filters
lsptkns find render -w . -l typescript --kind function --file "src/ui/"
```

If multiple symbols match, `lsptkns` errors with the list of matches and tells you how to narrow it down using `--kind` or `--file`.

### `lsptkns references <symbol>`

Find all usages of a symbol across the project.

```bash
lsptkns references handleRequest -w . -l typescript --kind function
lsptkns references User -w . -l python --format human
```

### `lsptkns symbols`

List all symbols in a project.

```bash
# All symbols
lsptkns symbols -w . -l typescript

# Only functions
lsptkns symbols -w . -l typescript --kind function

# Only symbols in a specific file
lsptkns symbols -w . -l python --file "models/*.py"

# Flat list (no hierarchy)
lsptkns symbols -w . -l elixir --flat
```

### `lsptkns children <symbol>`

Get the children / inner code of a symbol (e.g. methods inside a class, fields inside a struct).

```bash
# List methods of a class
lsptkns children MyClass -w . -l typescript --kind class

# Include raw source code
lsptkns children Router -w . -l elixir --source --format human
```

### `lsptkns graph`

Generate a call graph showing how symbols interact.

```bash
# Full project call graph
lsptkns graph -w . -l typescript

# Starting from a specific function, depth 2
lsptkns graph -w . -l typescript --entry main --depth 2

# Output as Graphviz DOT
lsptkns graph -w . -l python --format dot > callgraph.dot
dot -Tsvg callgraph.dot -o callgraph.svg

# Save to a directory
lsptkns graph -w . -l typescript --out-dir ./analysis
```

### `lsptkns diff <file-a.json> <file-b.json>`

Diff two `lsptkns` JSON outputs. No git operations — purely compares two snapshots.

```bash
# Capture symbols at two points in time
lsptkns symbols -w . -l typescript > before.json
# ... make changes ...
lsptkns symbols -w . -l typescript > after.json

# Diff them
lsptkns diff before.json after.json
lsptkns diff before.json after.json --format human

# Also works with graph outputs
lsptkns graph -w . -l typescript > graph-v1.json
lsptkns graph -w . -l typescript > graph-v2.json
lsptkns diff graph-v1.json graph-v2.json
```

## Common flags

| Flag | Description |
|------|-------------|
| `-w, --work-dir <dir>` | Project root directory (default: `.`) |
| `-l, --language <lang>` | Language: `typescript`, `python`, `elixir` |
| `--format <fmt>` | Output format: `json` (default), `human`, `dot` (graph only) |
| `-k, --kind <kind>` | Filter by symbol kind: `function`, `class`, `module`, `interface`, `method`, `variable`, `constant`, etc. |
| `-f, --file <path>` | Filter to a specific file or path |
| `--server-path <path>` | Override the LSP server binary |
| `--verbose` | Log LSP communication to stderr |

## JSON output structure

All commands produce a consistent top-level structure:

```json
{
  "command": "find",
  "workDir": ".",
  "language": "typescript",
  "query": "MyClass",
  "results": [ ... ],
  "meta": {
    "duration_ms": 1423
  }
}
```

This makes it straightforward to pipe into `jq`, feed to an AI agent, or integrate with other tooling.

## Development

```bash
bun install           # install dependencies
bun src/bin.ts --help # run locally
bun test              # run tests
bun run typecheck     # type check
```

## Release process

Releases are automated via GitHub Actions. On every push to `main`:

1. Patch version is bumped in `package.json`
2. Standalone binaries are compiled for macOS (ARM64) and Linux (x64, ARM64)
3. A GitHub Release is created with the binaries

## License

MIT
