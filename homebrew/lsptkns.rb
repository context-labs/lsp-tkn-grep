class Lsptkns < Formula
  desc "LSP-powered code analysis CLI - find symbols, trace references, build call graphs"
  homepage "https://github.com/context-labs/lsp-tkn-grep"
  version "0.1.0"
  license "MIT"

  on_macos do
    url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-darwin-arm64.tar.gz"
    sha256 "PLACEHOLDER"

    def install
      bin.install "lsptkns-darwin-arm64" => "lsptkns"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER"

      def install
        bin.install "lsptkns-linux-arm64" => "lsptkns"
      end
    else
      url "https://github.com/context-labs/lsp-tkn-grep/releases/download/v0.1.0/lsptkns-linux-x64.tar.gz"
      sha256 "PLACEHOLDER"

      def install
        bin.install "lsptkns-linux-x64" => "lsptkns"
      end
    end
  end

  test do
    assert_match "lsptkns", shell_output("#{bin}/lsptkns --help")
  end
end
