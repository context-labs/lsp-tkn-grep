---
name: lsptkns
description: "Use the lsptkns CLI for semantic code analysis via Language Server Protocol. Use this skill whenever you need to find symbol definitions, trace references across a codebase, list all symbols in a project, inspect class/function internals, build call graphs, or diff code structure between versions. Trigger on tasks like: 'find where X is defined', 'what calls this function', 'show me all the classes', 'how does this module connect to that one', 'what changed between these two snapshots'. Also use when the user mentions lsptkns directly, or when semantic code understanding would be more accurate than grep/ripgrep text search."
---

# lsptkns — LSP-Powered Code Analysis CLI

`lsptkns` uses Language Server Protocol to semantically analyze codebases. Unlike text-based grep, it understands code structure — it knows the difference between a function definition and a string that happens to contain the same word.

## When to use lsptkns vs grep/ripgrep

- **Use lsptkns** when you need semantic understanding: finding definitions, tracing references, understanding call hierarchies, listing typed symbols (functions, classes, interfaces)
- **Use grep/ripgrep** when you need raw text search: log messages, string literals, comments, config values

## Prerequisites

The relevant language server must be installed:

| Language | Flag | Server | Install |
|----------|------|--------|---------|
| TypeScript/JS | `-l typescript` | `typescript-language-server` | `npm install -g typescript-language-server typescript` |
| Python | `-l python` | `pyright-langserver` | `pip install pyright` |
| Elixir | `-l elixir` | `elixir-ls` | `brew install elixir-ls` |

For TypeScript projects, `typescript-language-server` is usually already available if the project has TypeScript installed. Check with `which typescript-language-server`.

## Common flags (all commands except diff)

| Flag | Short | Description |
|------|-------|-------------|
| `--work-dir <dir>` | `-w` | Project root (default: `.`) |
| `--language <lang>` | `-l` | `typescript`, `python`, or `elixir` |
| `--format <fmt>` | | `json` (default) or `human` |
| `--kind <kind>` | `-k` | Filter: `function`, `class`, `interface`, `method`, `variable`, `constant`, `module`, `enum`, etc. |
| `--file <path>` | `-f` | Filter to a specific file path |
| `--server-path <path>` | | Override LSP server binary |
| `--verbose` | | Log LSP communication to stderr |

## Commands

### 1. Find a symbol definition

```bash
lsptkns find <symbol> -w <project-dir> -l <language>
```

Finds where a symbol is defined. If multiple matches are found, it errors with the list and asks you to disambiguate with `--kind` or `--file`.

```bash
# Find a class
lsptkns find MyClass -w . -l typescript

# Disambiguate: only functions named "render"
lsptkns find render -w . -l typescript --kind function

# Restrict to a file
lsptkns find User -w . -l python --file "models/user.py"
```

### 2. Find all references to a symbol

```bash
lsptkns references <symbol> -w <project-dir> -l <language>
```

First resolves the symbol (same disambiguation as `find`), then returns every location where it's used.

```bash
lsptkns references handleRequest -w . -l typescript --kind function
```

### 3. List all symbols in a project

```bash
lsptkns symbols -w <project-dir> -l <language>
```

Lists every symbol the language server knows about. Combine with `--kind` and `--file` to filter.

```bash
# All functions
lsptkns symbols -w . -l typescript --kind function

# All symbols in a specific file
lsptkns symbols -w . -l python --file "src/models.py"

# Flat list (no hierarchy)
lsptkns symbols -w . -l typescript --flat
```

### 4. Get children of a symbol

```bash
lsptkns children <symbol> -w <project-dir> -l <language>
```

Returns the inner symbols of a container (methods of a class, fields of an interface, etc.). Use `--source` to also get the raw source code.

```bash
# Methods of a class
lsptkns children UserService -w . -l typescript --kind class

# With source code
lsptkns children Router -w . -l elixir --source
```

### 5. Build a call graph

```bash
lsptkns graph -w <project-dir> -l <language>
```

Produces a call graph showing which functions call which. Supports `--entry` to start from a specific symbol and `--depth` to limit traversal.

```bash
# From a specific entry point
lsptkns graph -w . -l typescript --entry main --depth 3

# Graphviz DOT output
lsptkns graph -w . -l python --format dot > callgraph.dot
```

### 6. Diff two snapshots

```bash
lsptkns diff <before.json> <after.json>
```

Compares two JSON outputs from `symbols` or `graph`. No git operations — you capture the snapshots yourself.

```bash
lsptkns symbols -w . -l typescript > before.json
# ... make code changes ...
lsptkns symbols -w . -l typescript > after.json
lsptkns diff before.json after.json
```

Shows added, removed, and modified symbols (or nodes/edges for graphs).

## JSON output structure

All commands produce:

```json
{
  "command": "find",
  "workDir": ".",
  "language": "typescript",
  "query": "MyClass",
  "results": [ ... ],
  "meta": { "duration_ms": 1423 }
}
```

Each symbol in results looks like:

```json
{
  "name": "MyClass",
  "kind": 5,
  "kindName": "class",
  "location": {
    "file": "src/models.ts",
    "line": 12,
    "col": 1,
    "endLine": 45,
    "endCol": 2
  },
  "containerName": "models",
  "children": [ ... ]
}
```

## Typical workflows

### "Where is X defined and who uses it?"

```bash
lsptkns find MyFunction -w . -l typescript --kind function
lsptkns references MyFunction -w . -l typescript --kind function
```

### "What's inside this class?"

```bash
lsptkns children MyClass -w . -l typescript --kind class --source
```

### "What functions exist in this project?"

```bash
lsptkns symbols -w . -l typescript --kind function --format human
```

### "How does function A relate to function B?"

```bash
lsptkns graph -w . -l typescript --entry functionA --depth 4
```

### "What symbols changed?"

```bash
lsptkns symbols -w . -l typescript > snap1.json
# ... edit code ...
lsptkns symbols -w . -l typescript > snap2.json
lsptkns diff snap1.json snap2.json --format human
```

## Disambiguation

When a symbol name matches multiple results, lsptkns errors with the full list:

```
Symbol "render" matched 3 results. Be more specific:

  src/ui/Button.tsx:12:3  method  render (in Button)
  src/ui/App.tsx:8:3      method  render (in App)
  src/utils/dom.ts:45:1   function  render

Use --file <path> or --kind <kind> to disambiguate.
```

Always narrow with `--kind` and/or `--file` when working with common symbol names.

## Performance notes

- First run for a project is slower (~1.5s) because the language server needs to index
- Subsequent commands in the same invocation reuse the server session
- The `graph` command with no `--entry` scans all files and can be slow on large projects — use `--entry` and `--depth` to scope it down
- Elixir's LSP server (`elixir-ls`) requires a Mix project and is slow on first init due to compilation
