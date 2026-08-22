#!/bin/bash
# Ralph Loop Quick Launcher for Grokbot
# Usage: ./scripts/ralph-loop.sh [options]
# Examples:
#   ./scripts/ralph-loop.sh --mode subscription --max-turns 25
#   ./scripts/ralph-loop.sh --mode api --max-budget 8.00

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$SCRIPT_DIR/ralph-runner.mjs" "$@"
