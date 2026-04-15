#!/usr/bin/env bun

import { Command } from "commander";
import { version } from "../package.json";
import { findCommand } from "./commands/find.ts";
import { referencesCommand } from "./commands/references.ts";
import { symbolsCommand } from "./commands/symbols.ts";
import { graphCommand } from "./commands/graph.ts";
import { childrenCommand } from "./commands/children.ts";
import { diffCommand } from "./commands/diff.ts";
import { updateCommand } from "./commands/update.ts";

const program = new Command();

program
  .name("lsptkns")
  .description(
    "LSP-powered code analysis CLI. Uses Language Server Protocol to find symbols, " +
      "trace references, build call graphs, and diff code structure.\n\n" +
      "Supports TypeScript, Python, and Elixir via their respective language servers.\n" +
      "The relevant language server must be installed on your system."
  )
  .version(version);

program.addCommand(findCommand);
program.addCommand(referencesCommand);
program.addCommand(symbolsCommand);
program.addCommand(graphCommand);
program.addCommand(childrenCommand);
program.addCommand(diffCommand);
program.addCommand(updateCommand);

program.parseAsync().catch((err) => {
  if (err.name === "AmbiguousSymbolError") {
    console.error(err.message);
    process.exit(1);
  }
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
