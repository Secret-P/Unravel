#!/bin/sh
# Copy the site into the ribbescobb.github.io clone under /unravel, cache-bust asset URLs with the
# source commit, and push with the ribbescobb account. Run from anywhere after committing.
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Ribbescobb-Labs/.deploys/ribbescobb.github.io"
SHA=$(git -C "$SRC" rev-parse --short HEAD)
if [ -n "$(git -C "$SRC" status --porcelain)" ]; then echo "Commit first: working tree is dirty."; exit 1; fi
mkdir -p "$DEST/unravel"
cp "$SRC"/style.css "$SRC"/app.js "$SRC"/words.js "$SRC"/puzzles.js "$DEST/unravel/"
sed -E "s/(href|src)=\"(style\.css|app\.js|words\.js|puzzles\.js)\"/\1=\"\2?v=$SHA\"/g" "$SRC/index.html" > "$DEST/unravel/index.html"
cd "$DEST"
git add unravel
git commit -q -m "Unravel: deploy $SHA" || { echo "Nothing to deploy."; exit 0; }
gh auth switch --user ribbescobb >/dev/null 2>&1
git -c credential.helper='!gh auth git-credential' push -q origin HEAD
gh auth switch --user Secret-P >/dev/null 2>&1
echo "Deployed $SHA -> https://ribbescobb.com/unravel/"
