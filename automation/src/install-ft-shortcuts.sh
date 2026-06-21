#!/bin/zsh
set -euo pipefail

REPO="/Users/niklaskofler/Documents/finanztool"
TARGET_DIR="$HOME/.local/bin"
ZSHRC="$HOME/.zshrc"
BLOCK_START="# >>> finanztool shortcuts >>>"
BLOCK_END="# <<< finanztool shortcuts <<<"

if [ ! -d "$REPO" ]; then
  echo "FEHLER: Projekt fehlt unter $REPO"
  exit 1
fi

mkdir -p "$TARGET_DIR"

for command in ftd fts ftu; do
  chmod +x "$REPO/bin/$command"
  ln -sf "$REPO/bin/$command" "$TARGET_DIR/$command"
done

touch "$ZSHRC"

tmpfile="$(mktemp)"
awk -v start="$BLOCK_START" -v end="$BLOCK_END" '
  $0 == start { skip = 1; next }
  $0 == end { skip = 0; next }
  $0 == "# finanztool shortcuts" { next }
  $0 == "export PATH=\"$HOME/.local/bin:$PATH\"" { next }
  !skip { print }
' "$ZSHRC" > "$tmpfile"
mv "$tmpfile" "$ZSHRC"

{
  echo ""
  echo "$BLOCK_START"
  echo 'export PATH="$HOME/.local/bin:$PATH"'
  echo 'export FINANZTOOL_REPO="/Users/niklaskofler/Documents/finanztool"'
  echo ""
  echo "ftd() {"
  echo '  "$FINANZTOOL_REPO/bin/ftd" "$@"'
  echo '  local exit_code=$?'
  echo '  if [ "$exit_code" -eq 0 ]; then'
  echo '    cd "$FINANZTOOL_REPO"'
  echo "  fi"
  echo '  return "$exit_code"'
  echo "}"
  echo ""
  echo "fts() {"
  echo '  "$FINANZTOOL_REPO/bin/fts" "$@"'
  echo "}"
  echo ""
  echo "ftu() {"
  echo '  "$FINANZTOOL_REPO/bin/ftu" "$@"'
  echo "}"
  echo "$BLOCK_END"
} >> "$ZSHRC"

echo "Installiert:"
echo "  $TARGET_DIR/ftd -> $REPO/bin/ftd"
echo "  $TARGET_DIR/fts -> $REPO/bin/fts"
echo "  $TARGET_DIR/ftu -> $REPO/bin/ftu"
echo ""
echo "Falls die Befehle in einem bestehenden Terminal nicht gefunden werden:"
echo "  source ~/.zshrc"
echo ""
echo "Hinweis: ftd wechselt nach erfolgreichem Lauf automatisch nach:"
echo "  $REPO"
