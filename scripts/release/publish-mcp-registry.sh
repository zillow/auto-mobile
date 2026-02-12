#!/usr/bin/env bash
#
# Publish AutoMobile to the MCP Registry using DNS verification.
#
# Prerequisites:
#   - brew install modelcontextprotocol/tap/mcp-publisher
#   - mcp-key.pem in repo root (Ed25519 private key)
#   - TXT record on auto-mobile.jasonpearson.dev with matching public key
#
# Usage:
#   ./scripts/release/publish-mcp-registry.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KEY_FILE="$REPO_ROOT/mcp-key.pem"
DOMAIN="jasonpearson.dev"

if ! command -v mcp-publisher >/dev/null 2>&1; then
  echo "Error: mcp-publisher not found. Install with:" >&2
  echo "  brew install modelcontextprotocol/tap/mcp-publisher" >&2
  exit 1
fi

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Error: $KEY_FILE not found." >&2
  echo "Generate with: openssl genpkey -algorithm Ed25519 -out mcp-key.pem" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/server.json" ]]; then
  echo "Error: server.json not found in repo root." >&2
  exit 1
fi

echo "Building and publishing npm package..."
cd "$REPO_ROOT"
bun run build
npm publish --access public

PRIVATE_KEY="$(openssl pkey -in "$KEY_FILE" -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"

echo "Authenticating with MCP Registry via DNS ($DOMAIN)..."
mcp-publisher login dns --domain "$DOMAIN" --private-key "$PRIVATE_KEY"

echo "Publishing server.json to MCP Registry..."
cd "$REPO_ROOT"
mcp-publisher publish

echo "Done! Verify at:"
echo "  curl 'https://registry.modelcontextprotocol.io/v0.1/servers?search=dev.jasonpearson/auto-mobile'"
