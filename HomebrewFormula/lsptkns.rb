class Lsptkns < Formula
  desc "LSP-powered code analysis CLI - find symbols, trace references, build call graphs"
  homepage "https://github.com/context-labs/lsp-tkn-grep"
  version "0.1.1"
  license "MIT"

  depends_on "typescript-language-server"
  depends_on "pyright"
  depends_on "elixir-ls"

  on_macos do
    url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.1/lsptkns-darwin-arm64.tar.gz"
    sha256 "20dd7351f14e19ff7fbb08e6789b86a686279d14f78fba390c2012649bdfa55e"

    def install
      bin.install "lsptkns-darwin-arm64" => "lsptkns"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.1/lsptkns-linux-arm64.tar.gz"
      sha256 "c91e37aa308b3b17ae092f747c5a201ec4d1ff2b74fd13e07f2ba67f74559158"

      def install
        bin.install "lsptkns-linux-arm64" => "lsptkns"
      end
    else
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.1/lsptkns-linux-x64.tar.gz"
      sha256 "fa320db12fb934cce89e3c0c6436ba0e891899f2323cdf31347df0dab945d99c"

      def install
        bin.install "lsptkns-linux-x64" => "lsptkns"
      end
    end
  end

  test do
    assert_match "lsptkns", shell_output("#{bin}/lsptkns --help")
  end
end
