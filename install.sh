#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- bump patch version in package.json ---
CURRENT_VERSION="$(node -p "require('./package.json').version")"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# in-place edit works on both macOS (BSD sed) and Linux (GNU sed)
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
else
  sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

echo "Version: $CURRENT_VERSION -> $NEW_VERSION"

# --- compile ---
echo "Compiling..."
npm run compile

# --- uninstall previous version to avoid stale cache ---
EXT_ID="$(node -p "require('./package.json').publisher + '.' + require('./package.json').name")"
if code --list-extensions | grep -qi "^${EXT_ID}$"; then
  echo "Uninstalling $EXT_ID..."
  code --uninstall-extension "$EXT_ID"
fi

# --- package ---
VSIX_FILE="$(node -p "require('./package.json').name")-${NEW_VERSION}.vsix"
echo "Packaging $VSIX_FILE..."
npx --yes @vscode/vsce package --out "$VSIX_FILE" --no-git-tag-version 2>/dev/null

# --- install ---
echo "Installing..."
code --install-extension "$VSIX_FILE"

echo ""
echo "Done. Reload VS Code to activate version $NEW_VERSION."
echo "  Cmd+Shift+P -> Developer: Reload Window"
