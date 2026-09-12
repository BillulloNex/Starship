#!/usr/bin/env bash
# Wrapper invoked in place of `bash setup.sh` for automation runs.
# 1. Point `.venv` at the shared SDK install.
# 2. Run the original setup.sh with a uv shim so leftover tarball recipes
#    cannot recreate a 540 MB per-run virtualenv.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENSURE="${SCRIPT_DIR}/ensure-shared-sdk-venv.sh"
SHIM_DIR="${SCRIPT_DIR}/uv-shim"

if [ ! -f setup.sh ]; then
  exit 0
fi

if [ -x "$ENSURE" ]; then
  bash "$ENSURE"
else
  echo "[setup] WARNING: ${ENSURE} missing; setup.sh will run unmodified" >&2
fi

if [ -x "${SHIM_DIR}/uv" ]; then
  export PATH="${SHIM_DIR}:${PATH}"
fi

bash setup.sh
