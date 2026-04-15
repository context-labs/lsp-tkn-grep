class Lsptkns < Formula
  desc "LSP-powered code analysis CLI - find symbols, trace references, build call graphs"
  homepage "https://github.com/context-labs/lsp-tkn-grep"
  version "0.1.0"
  license "MIT"

  depends_on "typescript-language-server"
  depends_on "pyright"
  depends_on "elixir-ls"

  on_macos do
    url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-darwin-arm64.tar.gz"
    sha256 "c77d99dbcf57c5f81f1b1caee164915a042db419f838297bcd35b911960b4121"

    def install
      bin.install "lsptkns-darwin-arm64" => "lsptkns"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-linux-arm64.tar.gz"
      sha256 "1c288f3484a4c0dccd02ca674978ea6d257e7a135e8d86d24be47db3c69476a3"

      def install
        bin.install "lsptkns-linux-arm64" => "lsptkns"
      end
    else
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-linux-x64.tar.gz"
      sha256 "4739666544ca10a4a7c2a9288bc3c36d5b693ee757fbc44551fe605f4d456ae9"

      def install
        bin.install "lsptkns-linux-x64" => "lsptkns"
      end
    end
  end

  test do
    assert_match "lsptkns", shell_output("#{bin}/lsptkns --help")
  end
end
