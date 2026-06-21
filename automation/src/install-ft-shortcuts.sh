#!/bin/zsh
set -euo pipefail

REPO="/Users/niklaskofler/Documents/finanztool"
TARGET_DIR="$HOME/.local/bin"

if [ ! -d "$REPO" ]; then
  echo "FEHLER: Projekt fehlt unter $REPO"
  exit 1
fi

mkdir -p "$TARGET_DIR"

for command in ftd fts ftu; do
  chmod +x "$REPO/bin/$command"
  ln -sf "$REPO/bin/$command" "$TARGET_DIR/$command"
done

if ! echo ":$PATH:" | grep -q ":$TARGET_DIR:"; then
  ZSHRC="$HOME/.zshrc"
  if ! grep -q 'finanztool shortcuts' "$ZSHRC" 2>/dev/null; then
    {
      echo ""
      echo "# finanztool shortcuts"
      echo 'export PATH="$HOME/.local/bin:$PATH"'
    } >> "$ZSHRC"
  fi
fi

echo "Installiert:"
echo "  $TARGET_DIR/ftd -> $REPO/bin/ftd"
echo "  $TARGET_DIR/fts -> $REPO/bin/fts"
echo "  $TARGET_DIR/ftu -> $REPO/bin/ftu"
echo ""
echo "Falls die Befehle in einem bestehenden Terminal nicht gefunden werden:"
echo "  source ~/.zshrc"
