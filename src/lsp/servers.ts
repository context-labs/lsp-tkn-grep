export interface ServerConfig {
  command: string;
  args: string[];
  extensions: string[];
  installHint: string;
  quirks?: string;
}

export const SERVER_REGISTRY: Record<string, ServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    installHint: "bun install -g typescript-language-server typescript",
  },
  python: {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
    installHint: 'pip install pyright  (or: bun install -g pyright)',
  },
  elixir: {
    command: "elixir-ls",
    args: [],
    extensions: [".ex", ".exs"],
    installHint: "brew install elixir-ls",
    quirks: "Requires mix.exs in work-dir. First run is slow (compilation).",
  },
  protobuf: {
    command: "buf",
    args: ["lsp", "serve"],
    extensions: [".proto"],
    installHint: "brew install buf",
  },
};

export function getServerConfig(language: string): ServerConfig {
  const config = SERVER_REGISTRY[language];
  if (!config) {
    const available = Object.keys(SERVER_REGISTRY).join(", ");
    throw new Error(
      `Unknown language: "${language}". Available: ${available}`
    );
  }
  return config;
}

export function detectLanguage(workDir: string): string | undefined {
  for (const [lang, config] of Object.entries(SERVER_REGISTRY)) {
    for (const ext of config.extensions) {
      const glob = new Bun.Glob(`**/*${ext}`);
      const iter = glob.scanSync({ cwd: workDir, onlyFiles: true });
      const first = iter.next();
      if (!first.done) return lang;
    }
  }
  return undefined;
}
