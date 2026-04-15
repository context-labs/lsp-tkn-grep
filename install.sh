#!/bin/sh
set -e

REPO="context-labs/lsp-tkn-grep"
INSTALL_DIR="$HOME/.lsptkns/bin"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) OS="darwin" ;;
  linux)  OS="linux" ;;
  *)
    echo "Error: Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY="lsptkns-${OS}-${ARCH}"

echo "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$TAG" ]; then
  echo "Error: Could not determine latest release"
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${BINARY}"

mkdir -p "${INSTALL_DIR}"

echo "Downloading lsptkns ${TAG} (${OS}-${ARCH})..."
curl -fsSL "$URL" -o "${INSTALL_DIR}/lsptkns"
chmod +x "${INSTALL_DIR}/lsptkns"

echo "lsptkns ${TAG} installed to ${INSTALL_DIR}/lsptkns"

# Add to PATH if not already there
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    SHELL_NAME=$(basename "$SHELL")
    case "$SHELL_NAME" in
      zsh)  RC="$HOME/.zshrc" ;;
      bash) RC="$HOME/.bashrc" ;;
      fish) RC="$HOME/.config/fish/config.fish" ;;
      *)    RC="" ;;
    esac
    if [ -n "$RC" ]; then
      echo "export PATH=\"${INSTALL_DIR}:\$PATH\"" >> "$RC"
      echo "Added ${INSTALL_DIR} to PATH in ${RC}"
      echo "Run 'source ${RC}' or restart your shell to use lsptkns"
    else
      echo "Add ${INSTALL_DIR} to your PATH to use lsptkns"
    fi
    ;;
esac

echo ""
echo "Note: lsptkns requires language servers to be installed separately:"
echo "  TypeScript: npm install -g typescript-language-server typescript"
echo "  Python:     pip install pyright"
echo "  Elixir:     brew install elixir-ls"
