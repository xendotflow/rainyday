#!/bin/bash

MAIN_DIR="$(dirname "$0")"
GENCACHE_FILE="gencache"

if [ ! -f "$MAIN_DIR/$GENCACHE_FILE" ]; then
  echo "gencache file not found in the main directory"
  exit 1
fi

for SUBDIR in "$MAIN_DIR"/*/; do
  if [ -d "$SUBDIR" ]; then
    cp "$MAIN_DIR/$GENCACHE_FILE" "$SUBDIR"
    (cd "$SUBDIR" && chmod +x "$GENCACHE_FILE" && ./$GENCACHE_FILE)
  fi
done

(cd "$MAIN_DIR" && chmod +x "$GENCACHE_FILE" && ./$GENCACHE_FILE)

echo "done"
