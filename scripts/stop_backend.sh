#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.pids"

if [ ! -d "$PID_DIR" ]; then
  echo "No hay servicios corriendo."
  exit 0
fi

for pidfile in "$PID_DIR"/*.pid; do
  [ -e "$pidfile" ] || continue
  name=$(basename "$pidfile" .pid)
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" && echo "[STOP] $name (pid $pid)"
  else
    echo "[SKIP] $name (pid $pid no activo)"
  fi
  rm -f "$pidfile"
done
