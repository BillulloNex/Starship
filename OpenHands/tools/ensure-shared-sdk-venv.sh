#!/usr/bin/env bash
# Create or reuse a single OpenHands SDK virtualenv and point this run's
# `.venv` at it. Prevents the ~540 MB per-run install in automation workspaces.
set -euo pipefail

log() { printf '[setup] %s\n' "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DEFAULT="/opt/openhands-shared-sdk-venv"
SHARED="${AUTOMATION_SHARED_VENV:-}"
INIT_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --init-only) INIT_ONLY=1 ;;
  esac
done

if [ -z "$SHARED" ]; then
  if [ -x "${SHARED_DEFAULT}/bin/python" ]; then
    SHARED="$SHARED_DEFAULT"
  else
    SHARED="${HOME}/.openhands/shared-sdk-venv"
  fi
fi

VERSION_FILE="${SHARED}/.grokbot-sdk-version"
LOCK_FILE="${TMPDIR:-/tmp}/grokbot-shared-sdk-venv.lock"

fetch_sdk_version() {
  if [ -z "${AUTOMATION_API_URL:-}" ]; then
    return 0
  fi
  local python_json=python3
  if ! command -v python3 >/dev/null 2>&1; then
    if command -v python >/dev/null 2>&1; then
      python_json=python
    else
      return 0
    fi
  fi
  curl -sf "${AUTOMATION_API_URL}/sdk-version" \
    | ${python_json} -c "import sys, json; print(json.load(sys.stdin)['version'])" 2>/dev/null \
    || true
}

install_shared_venv() {
  local version="$1"
  mkdir -p "$(dirname "$SHARED")"
  if ! command -v uv >/dev/null 2>&1; then
    log "ERROR: uv is required to build the shared SDK venv at ${SHARED}"
    exit 1
  fi
  if [ ! -x "${SHARED}/bin/python" ]; then
    log "Creating shared SDK venv at ${SHARED}"
    uv venv "$SHARED" --python '>=3.12' --quiet
  fi
  if [ -n "$version" ]; then
    log "Installing OpenHands SDK ${version} into shared venv"
    uv pip install --python "$SHARED" --quiet \
      "openhands-sdk==${version}" \
      "openhands-tools==${version}" \
      "openhands-workspace==${version}"
    printf '%s\n' "$version" > "$VERSION_FILE"
  else
    log "ERROR: cannot install shared SDK venv without a version" >&2
    exit 1
  fi
}

ensure_shared_venv() {
  local desired
  desired="$(fetch_sdk_version || true)"
  local installed=""
  if [ -f "$VERSION_FILE" ]; then
    installed="$(tr -d '[:space:]' < "$VERSION_FILE" || true)"
  fi

  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  if command -v flock >/dev/null 2>&1; then
    flock -w 300 9
  fi

  if [ -x "${SHARED}/bin/python" ]; then
    if [ -z "$desired" ] || [ "$desired" = "$installed" ]; then
      log "Reusing shared SDK venv at ${SHARED}${installed:+ (sdk ${installed})}"
      return 0
    fi
    log "Shared SDK venv is ${installed:-unknown}, service wants ${desired}"
    install_shared_venv "$desired"
    return 0
  fi

  if [ -z "$desired" ]; then
    log "ERROR: shared SDK venv missing at ${SHARED} and /sdk-version is unreachable" >&2
    exit 1
  fi
  install_shared_venv "$desired"
}

ensure_shared_venv

if [ "$INIT_ONLY" -eq 1 ]; then
  exit 0
fi

if [ -e .venv ] && [ ! -L .venv ]; then
  log "Replacing local .venv directory with shared SDK venv symlink"
  rm -rf .venv
fi
ln -sfn "$SHARED" .venv
log "Linked .venv -> ${SHARED}"
