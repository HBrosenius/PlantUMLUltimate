#!/usr/bin/env bash
# Run a command quietly: full output goes to a log, only a short summary is printed.
# Usage: scripts/quiet-run.sh <cmd...>
if [ $# -eq 0 ]; then echo "usage: $0 <cmd...>" >&2; exit 2; fi
tmp="${TMPDIR:-/tmp}"
log="${tmp%/}/quiet-run-$(date +%Y%m%d-%H%M%S)-$$.log"
"$@" >"$log" 2>&1
status=$?
echo "log: $log"
echo "exit: $status"
echo "--- last 15 lines ---"
tail -n 15 "$log"
matches=$(grep -E 'FAIL|Error|✘|failed|AssertionError' "$log" | grep -viE '^> |node_modules|deprecat|0 failed' | head -n 40)
if [ -n "$matches" ]; then
  echo "--- failure matches (max 40) ---"
  printf '%s\n' "$matches"
fi
exit "$status"
